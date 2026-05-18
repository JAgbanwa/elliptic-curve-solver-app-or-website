"""
Elliptic Curve Integer Point Finder
====================================
Flask backend: safely parses a user-supplied curve expression  y² = f(n, x),
then streams found integer triples (n, x, y) via Server-Sent Events (SSE).

Run:
    pip install flask sympy
    python app.py
Then open http://localhost:5000
"""

from __future__ import annotations

import re
import math
import json
import time
import os

import numpy as np

try:
    import mpmath as _mpmath
    _MPMATH = True
except ImportError:
    _mpmath = None  # type: ignore[assignment]
    _MPMATH = False

from flask import Flask, jsonify, render_template, request, Response, stream_with_context
from sympy import symbols, sympify, lambdify, latex as sym_latex
from sympy.core.sympify import SympifyError

app = Flask(__name__)
# Disable static-file caching so browsers always fetch the latest CSS/JS
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

n_sym, x_sym, y_sym = symbols("n x y")

# ── SSE keepalive / soft-timeout ───────────────────────────────────────────────
# Browsers and reverse proxies drop idle SSE connections.  Yielding an SSE
# comment (": …\n\n") every _KEEPALIVE_SEC keeps the pipe alive without
# affecting the browser's event-listener logic.
_SSE_KEEPALIVE     = 'data: {"type":"heartbeat"}\n\n'
_KEEPALIVE_SEC     = 5      # seconds between heartbeat pings (must be real data frames, not comments, for Render proxy)
_SOFT_TIMEOUT      = 245    # graceful shutdown before gunicorn's 300 s hard limit
_EC_CHUNK          = 2_000_000   # max x values per vectorised chunk (keeps RAM under ~50 MB/chunk)
_POLY_CHUNK        = 500_000     # x-chunk size for general Diophantine vectorised paths

# ── Large-value exact-arithmetic threshold ─────────────────────────────────────
# numpy float64 has 53-bit mantissa: values > 9×10^15 lose integer precision.
# For rhs above this threshold the numpy fast-path re-evaluates using the
# exact Python big-integer evaluator.
_EXACT_THRESH = 9_000_000_000_000_000   # 9 × 10^15

# ── Quadratic-residue (QR) modular sieve ──────────────────────────────────────
# For y² = f(n, x) to have a solution, f(n, x) must be a QR modulo every
# modulus below.  Using these four residues eliminates ~85-95 % of candidates
# before any square-root computation.  Only activated for large x ranges.
_SIEVE_MODULI = (8, 9, 5, 7)
_SIEVE_MIN_X  = 5_000   # only sieve when len(x_arr) exceeds this

# ── Security ───────────────────────────────────────────────────────────────────
_FORBIDDEN = re.compile(
    r"(__\w+__"
    r"|\bimport\b|\bexec\b|\beval\b|\bopen\b"
    r"|\bos\b|\bsys\b|\bsubprocess\b"
    r"|\bgetattr\b|\bsetattr\b|\bdelattr\b"
    r"|\bglobals\b|\blocals\b|\bvars\b"
    r"|\bcompile\b)",
    re.IGNORECASE,
)


def _compute_qr_sieve(f_py_exact, n_val, x_int_arr: np.ndarray,
                       moduli: tuple = _SIEVE_MODULI) -> np.ndarray:
    """Return a boolean numpy mask for x candidates that pass the QR pre-filter.

    For y² = f(n, x) to have an integer solution, f(n, x) must be a quadratic
    residue modulo every modulus in *moduli*.  Polynomial congruence guarantees
    f(n, x) mod m depends only on x mod m, so only O(Σ mᵢ) exact evaluations
    are needed to build the sieve; numpy vectorised ops apply it in O(|x_arr|).

    Expected rejection rate: ~85-95 % of candidates eliminated instantly,
    giving a massive speed-up for large x ranges.
    """
    combined = np.ones(len(x_int_arr), dtype=bool)
    for m in moduli:
        qr_m = np.fromiter(sorted({(r * r) % m for r in range(m)}), dtype=np.int64)
        f_res = np.empty(m, dtype=np.int64)
        for xr in range(m):
            try:
                v = int(f_py_exact(n_val, xr)) % m
                f_res[xr] = (v + m) % m
            except Exception:  # noqa: BLE001
                # Can't evaluate modularly (e.g. rational n) → allow all residues
                f_res[xr] = int(qr_m[0])
        x_mod_m   = (x_int_arr % m + m).astype(np.int64) % m
        f_at_xmod = f_res[x_mod_m]
        combined &= np.isin(f_at_xmod, qr_m)
    return combined


# ── Rational-point scan helper ────────────────────────────────────────────────
def _rational_scan(f_py_exact, n_exact, x_min: int, x_max: int,
                   x_denom_max: int, n_disp: str, skip_zero_x: bool) -> list[dict]:
    """
    Scan x = p/q for denominators q in [2, x_denom_max] and numerators p such
    that x_min ≤ p/q ≤ x_max.  For each candidate, check whether y² = f(n, x)
    is a non-negative rational perfect square using exact Fraction arithmetic.
    Returns a list of {n, x, y} dicts (x and y as fraction strings like "3/2").
    """
    from math import isqrt as _isqrt  # noqa: PLC0415
    from fractions import Fraction as _Frac  # noqa: PLC0415
    from math import gcd as _gcd  # noqa: PLC0415

    results: list[dict] = []

    for q in range(2, x_denom_max + 1):
        p_lo = x_min * q
        p_hi = x_max * q
        for p in range(p_lo, p_hi + 1):
            if _gcd(abs(p), q) != 1:
                continue  # not in lowest terms — skip duplicate
            if skip_zero_x and p == 0:
                continue
            x_frac = _Frac(p, q)
            try:
                rhs_raw = f_py_exact(n_exact, x_frac)
                rhs = _Frac(rhs_raw)
            except Exception:  # noqa: BLE001
                continue
            if rhs < 0:
                continue
            # rhs = A/B (lowest terms).  Perfect rational square iff A and B
            # are both perfect squares.
            A, B = rhs.numerator, rhs.denominator
            sqA = _isqrt(A)
            sqB = _isqrt(B)
            if sqA * sqA == A and sqB * sqB == B:
                y_frac = _Frac(sqA, sqB)
                x_str = str(x_frac) if x_frac.denominator > 1 else str(x_frac.numerator)
                y_str = str(y_frac) if y_frac.denominator > 1 else str(y_frac.numerator)
                results.append({"n": n_disp, "x": x_str, "y":  y_str})
                if y_frac > 0:
                    neg_str = ("-" + str(y_frac)) if y_frac.denominator > 1 else str(-y_frac.numerator)
                    results.append({"n": n_disp, "x": x_str, "y": neg_str})
    return results


def parse_expr(raw: str):
    """
    Safely parse *raw* (a Python-syntax math expression in n and x) into a
    sympy Expr.  Raises ValueError on invalid or dangerous input.
    """
    raw = raw.strip().replace("^", "**")
    # Implicit multiplication: 2x → 2*x, 3n → 3*n, 2(x+1) → 2*(x+1)
    raw = re.sub(r'(\d)([A-Za-z(])', r'\1*\2', raw)
    if len(raw) > 300:
        raise ValueError("Expression too long (max 300 characters).")
    if _FORBIDDEN.search(raw):
        raise ValueError("Expression contains a forbidden keyword.")
    try:
        expr = sympify(raw, locals={"n": n_sym, "x": x_sym}, evaluate=True)
    except SympifyError as exc:
        raise ValueError(f"Cannot parse expression: {exc}") from exc
    bad = expr.free_symbols - {n_sym, x_sym}
    if bad:
        raise ValueError(f"Unknown symbol(s): {', '.join(str(s) for s in bad)}")
    return expr


def parse_general_eq(raw: str):
    """
    Parse a full Diophantine equation such as 'y**3 - y = x**4 - 2*x - 2'
    (or just 'F(n,x,y)' interpreted as = 0).
    Returns the expression F where the equation is F = 0.
    Allowed symbols: n, x, y.
    """
    raw = raw.strip().replace("^", "**")
    # Implicit multiplication: 2x → 2*x, 3y → 3*y, 2(x+1) → 2*(x+1)
    raw = re.sub(r'(\d)([A-Za-z(])', r'\1*\2', raw)
    if len(raw) > 400:
        raise ValueError("Equation too long (max 400 characters).")
    if _FORBIDDEN.search(raw):
        raise ValueError("Equation contains a forbidden keyword.")
    if "=" in raw:
        left, right = raw.split("=", 1)
        try:
            lhs = sympify(left,  locals={"n": n_sym, "x": x_sym, "y": y_sym}, evaluate=True)
            rhs = sympify(right, locals={"n": n_sym, "x": x_sym, "y": y_sym}, evaluate=True)
            expr = lhs - rhs
        except SympifyError as exc:
            raise ValueError(f"Cannot parse equation: {exc}") from exc
    else:
        try:
            expr = sympify(raw, locals={"n": n_sym, "x": x_sym, "y": y_sym}, evaluate=True)
        except SympifyError as exc:
            raise ValueError(f"Cannot parse expression: {exc}") from exc
    bad = expr.free_symbols - {n_sym, x_sym, y_sym}
    if bad:
        raise ValueError(f"Unknown symbol(s): {', '.join(str(s) for s in bad)}")
    return expr


# ── Big-integer helpers ───────────────────────────────────────────────────────
def _icbrt(n: int) -> int:
    """Exact integer cube-root floor (∛n). Works for arbitrarily large Python ints."""
    if n == 0:
        return 0
    if n < 0:
        return -_icbrt(-n)
    x = int(round(float(n) ** (1 / 3)))
    # Correct downward/upward from the float approximation
    while x > 0 and x * x * x > n:
        x -= 1
    while (x + 1) ** 3 <= n:
        x += 1
    return x


def _eval_center(center_str: str, n_val: int) -> int:
    """
    Evaluate 'center_str' as a Python expression in n=n_val using exact integer
    arithmetic.  Available names: n, abs, round, int, icbrt.
    Returns the result as a Python int.
    """
    center_str = center_str.strip().replace("^", "**")
    center_str = re.sub(r'(\d)([A-Za-z(])', r'\1*\2', center_str)
    if len(center_str) > 300:
        raise ValueError("Center expression too long.")
    if _FORBIDDEN.search(center_str):
        raise ValueError("Center expression contains a forbidden keyword.")
    safe = {
        "__builtins__": {},
        "n": n_val,
        "abs": abs,
        "round": round,
        "int": int,
        "icbrt": _icbrt,
    }
    try:
        result = eval(center_str, safe)  # noqa: S307
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Cannot evaluate center expression: {exc}") from exc
    # Preserve exact precision for Python ints; fall back to float for others
    if isinstance(result, int):
        return result
    return int(round(float(result)))


def _integer_divisors(p: int, max_d: int) -> list[int]:
    """Return all integer divisors of p with |d| ≤ max_d, sorted ascending.
    Returns [] for p = 0 (every integer divides 0 — unhelpful for search)."""
    if p == 0:
        return []
    p_abs = abs(p)
    divs: set[int] = set()
    for d in range(1, min(math.isqrt(p_abs), max_d) + 1):
        if p_abs % d == 0:
            divs.add(d)
            q = p_abs // d
            if q <= max_d:
                divs.add(q)
    return sorted([-d for d in divs] + [d for d in divs])


def _curve_info(expr, n_val) -> dict:  # noqa: C901
    """
    Compute elliptic curve invariants for y² = expr(n=n_val, x).

    Substitutes a concrete n value into the user expression, identifies the
    degree/genus of the left-hand curve, and — for genus-1 cubics — converts
    to short Weierstrass form y² = x³ + Ax + B and computes:
        • Short Weierstrass coefficients A, B
        • Discriminant  Δ = −16(4A³ + 27B²)
        • j-invariant   j = 6912A³ / (4A³ + 27B²)
        • c₄, c₆
        • Primes of bad reduction (prime divisors of |Δ|, if |Δ| < 10¹²)
        • LMFDB a-invariants [0,0,0,A,B] when A,B are integers

    All dict values are plain Python strings/lists, safe for JSON serialisation.
    """
    from fractions import Fraction  # noqa: PLC0415
    from sympy import (  # noqa: PLC0415
        Poly, Rational, Symbol as _Sym, expand as _exp,
        factorint as _fi, Integer as _Int,
    )

    info: dict = {}
    try:
        # Exact conversion of n_val to SymPy numeric type
        if isinstance(n_val, int):
            n_sub = _Int(n_val)
        elif isinstance(n_val, Fraction):
            n_sub = Rational(n_val.numerator, n_val.denominator)
        else:
            n_sub = Rational(n_val)

        rhs = _exp(expr.subs(n_sym, n_sub))

        # Represent as polynomial in x (fails for rational functions like 1/x)
        try:
            poly = Poly(rhs, x_sym, domain="QQ")
        except Exception:  # noqa: BLE001
            info["curve_class"] = "Non-polynomial in x (rational function)"
            return info

        deg = poly.degree()
        all_c = poly.all_coeffs()  # descending: [a_d, …, a_0]

        if deg < 1:
            info["curve_class"] = "Constant RHS — degenerate (y² = const)"
            return info
        elif deg <= 2:
            info["curve_class"] = "Conic / parabola (genus 0, not an elliptic curve)"
            return info
        elif deg == 3:
            info["curve_class"] = "Elliptic curve — genus 1"
        elif deg == 4:
            info["curve_class"] = "Quartic (genus 1 via birational map to Weierstrass)"
            return info
        else:
            g = (deg - 1) // 2
            info["curve_class"] = (
                f"Degree-{deg} hyperelliptic curve (genus {g}; "
                "Faltings' theorem: finitely many rational points)"
            )
            return info

        # ── Cubic: convert to short Weierstrass y² = x³ + Ax + B ───────────
        while len(all_c) < 4:
            all_c.insert(0, Rational(0))
        a3, a2, a1, a0 = [Rational(c) for c in all_c[-4:]]

        # Discriminant of ax³+bx²+cx+d: 18abcd − 4b³d + b²c² − 4ac³ − 27a²d²
        disc_c = (
            18 * a3 * a2 * a1 * a0
            - 4 * a2 ** 3 * a0
            + a2 ** 2 * a1 ** 2
            - 4 * a3 * a1 ** 3
            - 27 * a3 ** 2 * a0 ** 2
        )
        if disc_c == 0:
            info["curve_class"] = "Singular cubic — node or cusp (Δ = 0; not an elliptic curve)"
            info["discriminant"] = "0"
            return info

        # Tschirnhaus substitution: x → t − a₂/(3a₃)  (eliminates x² term)
        t = _Sym("_t_")
        shift = a2 / (3 * a3)
        dep = _exp(rhs.subs(x_sym, t - shift))
        nc = Poly(dep, t, domain="QQ").all_coeffs()
        while len(nc) < 4:
            nc.insert(0, Rational(0))
        lc, _zero, A_p, B_p = [Rational(c) for c in nc[-4:]]

        # Normalise to monic: y² = t³ + (A_p/lc)·t + (B_p/lc)
        A_w = A_p / lc
        B_w = B_p / lc

        # Weierstrass invariants
        S      = 4 * A_w ** 3 + 27 * B_w ** 2   # non-zero since disc_c ≠ 0
        Delta  = Rational(-16) * S
        j_inv  = Rational(6912) * A_w ** 3 / S   # = 1728·(4A³)/(4A³+27B²)
        c4_val = Rational(-48)  * A_w
        c6_val = Rational(-864) * B_w

        def _fmt(r: Rational) -> str:
            r = Rational(r)
            return str(int(r.p)) if r.q == 1 else f"{r.p}/{r.q}"

        info["short_weierstrass"] = f"y\u00b2 = x\u00b3 + ({_fmt(A_w)})\u00b7x + ({_fmt(B_w)})"
        info["A"]             = _fmt(A_w)
        info["B"]             = _fmt(B_w)
        info["discriminant"]  = _fmt(Delta)
        info["j_invariant"]   = _fmt(j_inv)
        info["c4"]            = _fmt(c4_val)
        info["c6"]            = _fmt(c6_val)

        # Primes of bad reduction (factor |Δ_numerator| if not too large)
        try:
            dn = abs(int(Rational(Delta).p))
            if 0 < dn < 10 ** 12:
                fct = _fi(dn)
                info["primes_bad_reduction"] = sorted(int(k) for k in fct.keys())
            elif dn >= 10 ** 12:
                info["primes_bad_reduction"] = f"|Δ| too large to factor ({dn})"
            else:
                info["primes_bad_reduction"] = []
        except Exception:  # noqa: BLE001
            pass

        # LMFDB a-invariants  [0, 0, 0, A, B]  when A, B are integers
        try:
            Ar = Rational(A_w)
            Br = Rational(B_w)
            if Ar.q == 1 and Br.q == 1:
                info["lmfdb_ainvs"] = f"[0, 0, 0, {int(Ar.p)}, {int(Br.p)}]"
                info["lmfdb_url"] = (
                    f"https://www.lmfdb.org/EllipticCurve/Q/"
                    f"?a4={int(Ar.p)}&a6={int(Br.p)}"
                )
        except Exception:  # noqa: BLE001
            pass

        # Tschirnhaus shift  x_W = x_orig + shift  (useful for coordinate transforms)
        try:
            info["x_shift"] = _fmt(shift)
        except Exception:  # noqa: BLE001
            pass

        # Rank / conductor — require Sage or PARI-GP; not computable here
        info["rank"]               = "N/A"
        info["rank_note"]          = "Requires 2-descent (Sage / PARI-GP)"
        info["analytic_rank"]      = "N/A"
        info["analytic_rank_note"] = (
            "Order of vanishing of L(E, s) at s = 1; "
            "equals algebraic rank (BSD conjecture, proven for rank 0 and 1)"
        )
        info["conductor"]      = "N/A"
        info["conductor_note"] = (
            "Product of primes of bad reduction with local exponents "
            "(Tate's algorithm required)"
        )

    except Exception as exc:  # noqa: BLE001
        info["error"] = f"Invariant computation failed: {exc}"

    return info


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route("/")
def landing():
    return render_template("landing.html")


@app.route("/app")
def index():
    return render_template("index.html")


@app.route("/api/latex", methods=["POST"])
def api_latex():
    """Convert a Python-syntax expression to LaTeX (used for live preview)."""
    data = request.get_json(silent=True) or {}
    try:
        expr = parse_expr(data.get("expr", ""))
        return {"ok": True, "latex": sym_latex(expr)}
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}


@app.route("/api/from_latex", methods=["POST"])
def api_from_latex():
    """Convert a LaTeX equation (or RHS expression) to a Python-syntax expression.

    When mode == "gen", accepts a full equation with y (e.g. y^3 - y = x^4 - 2x - 2)
    and returns both sides as a Python equation string suitable for the general
    Diophantine solver.
    """
    data = request.get_json(silent=True) or {}
    latex_raw = data.get("latex", "").strip()
    mode = data.get("mode", "ec")          # "ec" (default) or "gen"
    if not latex_raw:
        return {"ok": False, "error": "No LaTeX provided."}

    try:
        from sympy.parsing.latex import parse_latex  # noqa: PLC0415
    except ImportError:
        return {"ok": False, "error": "LaTeX parsing requires antlr4-python3-runtime==4.11 (pip install antlr4-python3-runtime==4.11)."}

    from sympy import expand as _expand, collect as _collect  # noqa: PLC0415

    # ── General Diophantine mode: parse a full "LHS = RHS" LaTeX equation ──
    if mode == "gen":
        allowed = {n_sym, x_sym, y_sym}
        # Split on the first bare '=' that is not part of \leq, \geq, \neq etc.
        parts = re.split(r'(?<!\\)=', latex_raw, maxsplit=1)
        if len(parts) == 2:
            lhs_latex, rhs_latex = parts[0].strip(), parts[1].strip()
        else:
            lhs_latex, rhs_latex = latex_raw.strip(), "0"
        try:
            lhs_sym = parse_latex(lhs_latex) if lhs_latex else sympify("0")
            rhs_sym = parse_latex(rhs_latex) if rhs_latex else sympify("0")
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": f"Cannot parse LaTeX: {exc}"}
        unknown = (lhs_sym.free_symbols | rhs_sym.free_symbols) - allowed
        if unknown:
            return {"ok": False, "error": f"Unknown symbol(s): {', '.join(str(s) for s in unknown)}. Only x, y, n are allowed."}
        try:
            lhs_py = str(_collect(_expand(lhs_sym), [y_sym, x_sym]))
            rhs_py = str(_collect(_expand(rhs_sym), [y_sym, x_sym]))
        except Exception:  # noqa: BLE001
            lhs_py, rhs_py = str(lhs_sym), str(rhs_sym)
        eq_str = f"{lhs_py} = {rhs_py}"
        return {"ok": True, "eq": eq_str}

    # ── EC mode: parse the RHS of y² = f(n, x) ──────────────────────────
    # Strip leading  y^2 =  /  y² =  /  y^{2} =  so users can paste whole equations
    cleaned = re.sub(
        r'^\s*y\s*(?:\^\{?2\}?|²|\*\*2)\s*=\s*', '', latex_raw, flags=re.IGNORECASE
    ).strip()
    if not cleaned:
        return {"ok": False, "error": "Expression is empty after stripping y² = prefix."}

    try:
        sym_expr = parse_latex(cleaned)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Cannot parse LaTeX: {exc}"}

    # Validate: only n and x symbols allowed
    allowed = {n_sym, x_sym}
    unknown = sym_expr.free_symbols - allowed
    if unknown:
        return {"ok": False, "error": f"Unknown symbol(s) in LaTeX: {', '.join(str(s) for s in unknown)}. Only n and x are allowed."}

    # Produce a clean, human-readable Python expression: expand then collect by x
    try:
        clean_expr = _collect(_expand(sym_expr), x_sym)
        python_expr = str(clean_expr)
    except Exception:  # noqa: BLE001
        python_expr = str(sym_expr)  # fall back to raw form

    try:
        validated = parse_expr(python_expr)
        return {"ok": True, "expr": python_expr, "latex": sym_latex(validated)}
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}


@app.route("/api/search")
def api_search():
    """
    SSE endpoint.  Streams JSON-encoded events:
        {"type": "start",     "n_count": …, "x_count": …, "total_evals": …}
        {"type": "progress",  "pct": …, "n": …, "solutions": …}
        {"type": "solutions", "data": [{n, x, y}, …]}
        {"type": "done",      "total_solutions": …}
        {"type": "error",     "message": …}
    """
    expr_str = request.args.get("expr", "x**3 - n**2*x")
    try:
        n_min   = int(request.args.get("n_min",    -10))
        n_max   = int(request.args.get("n_max",     10))
        x_min   = int(request.args.get("x_min",  -100))
        x_max   = int(request.args.get("x_max",   100))
        n_denom = max(1, int(request.args.get("n_denom", 1)))
        x_scale = max(0.0, float(request.args.get("x_scale", 0)))
        x_window = max(1, int(request.args.get("x_window", 100)))
        x_center_expr_str = request.args.get("x_center_expr", "").strip()
        x_divisor_poly = request.args.get("x_divisor_poly", "").strip()
        x_divisor_max  = max(1, int(request.args.get("x_divisor_max", 1_000_000)))
        x_start_expr   = request.args.get("x_start_expr",  "").strip()
        x_end_expr     = request.args.get("x_end_expr",    "").strip()
        x_step_expr    = request.args.get("x_step_expr",   "1").strip() or "1"
        skip_zero_n = request.args.get("skip_zero_n", "") == "1"
        skip_zero_x = request.args.get("skip_zero_x", "") == "1"
        point_type  = request.args.get("point_type",  "integer")  # "integer"|"rational"|"all"
        x_denom_max = max(2, min(50, int(request.args.get("x_denom_max", 12))))
    except (ValueError, TypeError) as exc:
        def _err():
            yield f"data: {json.dumps({'type':'error','message':str(exc)})}\n\n"
        return Response(stream_with_context(_err()), mimetype="text/event-stream")

    # Soft warning threshold: search proceeds regardless of size
    WARN_EVALS = 100_000_000  # warn above 100 M

    def sse(obj: dict) -> str:
        return f"data: {json.dumps(obj)}\n\n"

    def generate():  # noqa: C901
        # ── parse + compile ───────────────────────────────────────────────────
        try:
            expr = parse_expr(expr_str)
        except ValueError as exc:
            yield sse({"type": "error", "message": str(exc)})
            return

        try:
            f_fast = lambdify((n_sym, x_sym), expr, modules=["numpy", "math"])
        except Exception as exc:  # noqa: BLE001
            yield sse({"type": "error", "message": f"Cannot compile expression: {exc}"})
            return

        # ── exact Python big-integer evaluator (for large-height fallback) ────
        try:
            f_py_exact = lambdify((n_sym, x_sym), expr, modules=[])
        except Exception:  # noqa: BLE001
            f_py_exact = None

        # ── timing state for heartbeat / soft-timeout ─────────────────────────
        t_start = time.monotonic()
        last_hb = t_start

        # ── build list of n values (integer or rational) ──────────────────────
        from fractions import Fraction  # noqa: PLC0415

        if n_denom == 1:
            _raw = list(range(n_min, n_max + 1))
            n_pairs: list[tuple[float, str]]      = [(float(i), str(i)) for i in _raw]
            n_raw:  list[tuple[int, str]]          = [(i,        str(i)) for i in _raw]
        else:
            seen: set = set()
            fracs: list[Fraction] = []
            for p in range(n_min * n_denom, n_max * n_denom + 1):
                frac = Fraction(p, n_denom)  # auto-reduces
                if frac not in seen and n_min <= frac <= n_max:
                    seen.add(frac)
                    fracs.append(frac)
            fracs.sort()
            n_pairs = [(float(f), str(f)) for f in fracs]
            n_raw   = [(f,        str(f)) for f in fracs]

        n_count = len(n_pairs)
        if x_scale > 0:
            # Per-n x range: [−x_scale·|n|, x_scale·|n|], minimum ±10 for n=0
            total_evals = sum(
                2 * max(10, math.ceil(x_scale * abs(nf))) + 1
                for (nf, _) in n_pairs
            )
            x_count = 0   # variable; 0 signals auto-scale to the frontend
        else:
            x_count     = x_max - x_min + 1
            total_evals = n_count * x_count

        # ── Window mode: exact big-integer arithmetic ────────────────────────
        if x_center_expr_str:
            try:
                f_py = lambdify((n_sym, x_sym), expr, modules=[])
            except Exception as exc:  # noqa: BLE001
                yield sse({"type": "error", "message": f"Cannot compile: {exc}"})
                return

            x_count_w   = 2 * x_window + 1
            total_evals_w = n_count * x_count_w
            if total_evals_w > WARN_EVALS:
                yield sse({"type": "warning",
                           "message": f"Large search: {total_evals_w:,} evaluations. "
                                      "Results stream as found — click Stop any time."})
            yield sse({"type": "start", "n_count": n_count,
                       "x_count": x_count_w, "total_evals": total_evals_w, "x_scale": 0})

            solutions_found_w = 0
            report_step_w = max(1, n_count // 200)
            n_with_solutions_w: list[str] = []

            for idx, (n_raw_val, n_disp) in enumerate(n_raw):
                if skip_zero_n and n_raw_val == 0:
                    continue
                # ── heartbeat + soft-timeout ──────────────────────────────────
                _now = time.monotonic()
                if _now - last_hb >= _KEEPALIVE_SEC:
                    yield _SSE_KEEPALIVE
                    last_hb = _now
                if _now - t_start >= _SOFT_TIMEOUT:
                    yield sse({"type": "done", "total_solutions": solutions_found_w,
                               "n_with_solutions": n_with_solutions_w,
                               "timed_out": True, "timed_out_at_n": n_disp})
                    return
                batch_w: list[dict] = []
                try:
                    center = _eval_center(x_center_expr_str, n_raw_val)
                except ValueError as exc:
                    yield sse({"type": "error", "message": str(exc)})
                    return

                for x_val in range(center - x_window, center + x_window + 1):
                    if skip_zero_x and x_val == 0:
                        continue
                    try:
                        rhs = f_py(n_raw_val, x_val)
                        if isinstance(rhs, float):
                            if not math.isfinite(rhs) or rhs < 0:
                                continue
                            rhs_int = round(rhs)
                            if abs(rhs - rhs_int) > 1e-6:
                                continue
                        else:
                            rhs_int = int(rhs)
                            if rhs_int < 0:
                                continue
                        y_pos = math.isqrt(rhs_int)
                        if y_pos * y_pos == rhs_int:
                            batch_w.append({"n": n_disp, "x": str(x_val), "y": str(y_pos)})
                            if y_pos > 0:
                                batch_w.append({"n": n_disp, "x": str(x_val), "y": str(-y_pos)})
                            solutions_found_w += 1
                    except Exception:  # noqa: BLE001
                        continue

                if batch_w:
                    n_with_solutions_w.append(n_disp)
                    yield sse({"type": "solutions", "data": batch_w})
                    try:
                        ci = _curve_info(expr, n_raw_val)
                        ci["n"] = n_disp
                        yield sse({"type": "curve_info", **ci})
                    except Exception:  # noqa: BLE001
                        pass

                if idx % report_step_w == 0 or idx == n_count - 1:
                    yield sse({"type": "progress",
                               "pct": round(100 * (idx + 1) / n_count, 1),
                               "n": n_disp, "solutions": solutions_found_w})

            yield sse({"type": "done", "total_solutions": solutions_found_w,
                       "n_with_solutions": n_with_solutions_w})
            return
        # ── End window mode ──────────────────────────────────────────────────

        # ── Expression range mode ──────────────────────────────────────────
        # Scan x in [eval(x_start_expr,n), eval(x_end_expr,n)] with step
        # eval(x_step_expr,n).  All arithmetic is exact big-integer Python.
        if x_start_expr and x_end_expr:
            try:
                f_py_er = lambdify((n_sym, x_sym), expr, modules=[])
            except Exception as exc:  # noqa: BLE001
                yield sse({"type": "error", "message": f"Cannot compile: {exc}"})
                return

            # Estimate iteration count from first n value (for progress message)
            try:
                _sn = n_raw[0][0]
                _xs = _eval_center(x_start_expr, _sn)
                _xe = _eval_center(x_end_expr,   _sn)
                _st = max(1, _eval_center(x_step_expr, _sn))
                x_count_er = max(0, int((_xe - _xs) // _st) + 1)
            except Exception:  # noqa: BLE001
                x_count_er = 0
            total_evals_er = n_count * x_count_er
            if total_evals_er > WARN_EVALS:
                yield sse({"type": "warning",
                           "message": f"Estimated ~{total_evals_er:,} evaluations "
                                      "(based on first n). Results stream as found "
                                      "— click Stop any time."})
            yield sse({"type": "start", "n_count": n_count,
                       "x_count": x_count_er, "total_evals": total_evals_er, "x_scale": 0})

            sol_er = 0
            n_with_sol_er: list[str] = []
            report_step_er = max(1, n_count // 200)

            for idx, (n_raw_val, n_disp) in enumerate(n_raw):
                if skip_zero_n and n_raw_val == 0:
                    continue
                # ── heartbeat + soft-timeout ──────────────────────────────────
                _now = time.monotonic()
                if _now - last_hb >= _KEEPALIVE_SEC:
                    yield _SSE_KEEPALIVE
                    last_hb = _now
                if _now - t_start >= _SOFT_TIMEOUT:
                    yield sse({"type": "done", "total_solutions": sol_er,
                               "n_with_solutions": n_with_sol_er,
                               "timed_out": True, "timed_out_at_n": n_disp})
                    return
                batch_er: list[dict] = []
                try:
                    x_start_v = _eval_center(x_start_expr, n_raw_val)
                    x_end_v   = _eval_center(x_end_expr,   n_raw_val)
                    x_step_v  = max(1, _eval_center(x_step_expr, n_raw_val))
                except ValueError as exc:
                    yield sse({"type": "error", "message": str(exc)})
                    return

                x_val = x_start_v
                while x_val <= x_end_v:
                    if not (skip_zero_x and x_val == 0):
                        try:
                            rhs = f_py_er(n_raw_val, x_val)
                            rhs_ok = False
                            if isinstance(rhs, float):
                                if math.isfinite(rhs) and rhs >= 0:
                                    rhs_int = round(rhs)
                                    rhs_ok = abs(rhs - rhs_int) <= 1e-6
                            else:
                                rhs_int = int(rhs)       # exact for polynomials
                                rhs_ok  = rhs_int >= 0
                            if rhs_ok:
                                y_pos = math.isqrt(rhs_int)
                                if y_pos * y_pos == rhs_int:
                                    batch_er.append({"n": n_disp,
                                                     "x": str(x_val),
                                                     "y": str(y_pos)})
                                    if y_pos > 0:
                                        batch_er.append({"n": n_disp,
                                                         "x": str(x_val),
                                                         "y": str(-y_pos)})
                                    sol_er += 1
                        except Exception:  # noqa: BLE001
                            pass
                    x_val += x_step_v

                if batch_er:
                    n_with_sol_er.append(n_disp)
                    yield sse({"type": "solutions", "data": batch_er})
                    try:
                        ci = _curve_info(expr, n_raw_val)
                        ci["n"] = n_disp
                        yield sse({"type": "curve_info", **ci})
                    except Exception:  # noqa: BLE001
                        pass

                if idx % report_step_er == 0 or idx == n_count - 1:
                    yield sse({"type": "progress",
                               "pct": round(100 * (idx + 1) / n_count, 1),
                               "n": n_disp, "solutions": sol_er})

            yield sse({"type": "done", "total_solutions": sol_er,
                       "n_with_solutions": n_with_sol_er})
            return
        # ── End expression range mode ──────────────────────────────────────────

        # ── Divisor search mode ───────────────────────────────────────────────
        if x_divisor_poly:
            try:
                div_expr = parse_expr(x_divisor_poly)
            except ValueError as exc:
                yield sse({"type": "error", "message": f"Divisor polynomial: {exc}"})
                return
            if div_expr.free_symbols - {n_sym}:
                yield sse({"type": "error",
                           "message": "Divisor polynomial must contain only n (not x)."})
                return
            try:
                f_py   = lambdify((n_sym, x_sym), expr,     modules=[])
                div_py = lambdify((n_sym,),        div_expr, modules=[])
            except Exception as exc:  # noqa: BLE001
                yield sse({"type": "error", "message": f"Cannot compile: {exc}"})
                return

            yield sse({"type": "start", "n_count": n_count,
                       "x_count": 0, "total_evals": 0, "x_scale": 0})

            sol_d = 0
            n_with_sol_d: list[str] = []
            report_step_d = max(1, n_count // 200)

            for idx, (n_raw_val, n_disp) in enumerate(n_raw):
                if skip_zero_n and n_raw_val == 0:
                    continue
                # ── heartbeat + soft-timeout ──────────────────────────────────
                _now = time.monotonic()
                if _now - last_hb >= _KEEPALIVE_SEC:
                    yield _SSE_KEEPALIVE
                    last_hb = _now
                if _now - t_start >= _SOFT_TIMEOUT:
                    yield sse({"type": "done", "total_solutions": sol_d,
                               "n_with_solutions": n_with_sol_d,
                               "timed_out": True, "timed_out_at_n": n_disp})
                    return
                batch_d: list[dict] = []
                try:
                    p_val = div_py(n_raw_val)
                    if isinstance(p_val, float):
                        p_int = round(p_val)
                        if abs(p_val - p_int) > 1e-6:
                            continue
                        p_val = p_int
                    else:
                        p_val = int(p_val)
                except Exception:  # noqa: BLE001
                    continue

                for x_val in _integer_divisors(p_val, x_divisor_max):
                    if skip_zero_x and x_val == 0:
                        continue
                    try:
                        rhs = f_py(n_raw_val, x_val)
                        if isinstance(rhs, float):
                            if not math.isfinite(rhs) or rhs < 0:
                                continue
                            rhs_int = round(rhs)
                            if abs(rhs - rhs_int) > 1e-6:
                                continue
                        else:
                            rhs_int = int(rhs)
                            if rhs_int < 0:
                                continue
                        y_pos = math.isqrt(rhs_int)
                        if y_pos * y_pos == rhs_int:
                            batch_d.append({"n": n_disp, "x": str(x_val), "y": str(y_pos)})
                            if y_pos > 0:
                                batch_d.append({"n": n_disp, "x": str(x_val), "y": str(-y_pos)})
                            sol_d += 1
                    except Exception:  # noqa: BLE001
                        continue

                if batch_d:
                    n_with_sol_d.append(n_disp)
                    yield sse({"type": "solutions", "data": batch_d})
                    try:
                        ci = _curve_info(expr, n_raw_val)
                        ci["n"] = n_disp
                        yield sse({"type": "curve_info", **ci})
                    except Exception:  # noqa: BLE001
                        pass

                if idx % report_step_d == 0 or idx == n_count - 1:
                    yield sse({"type": "progress",
                               "pct": round(100 * (idx + 1) / n_count, 1),
                               "n": n_disp, "solutions": sol_d})

            yield sse({"type": "done", "total_solutions": sol_d,
                       "n_with_solutions": n_with_sol_d})
            return
        # ── End divisor search mode ───────────────────────────────────────────

        if total_evals > WARN_EVALS:
            yield sse({
                "type": "warning",
                "message": (
                    f"Large search: {total_evals:,} evaluations. "
                    "Results stream as found — a 245-second time limit applies. "
                    "For exhaustive results on very large ranges, use Smart Window "
                    "or Divisor mode instead."
                ),
            })
        # No hard limit: search always proceeds (soft timeout at 245 s).

        yield sse({"type": "start", "n_count": n_count,
                   "x_count": x_count, "total_evals": total_evals,
                   "x_scale": x_scale})

        solutions_found = 0
        report_step = max(1, n_count // 200)  # emit progress ≈ 200 times

        n_with_solutions: list[str] = []

        # Pre-allocate fixed x arrays when not auto-scaling AND range fits in one chunk
        _x_range_total = (x_max - x_min + 1) if x_scale == 0 else 0
        _use_ec_chunks = (x_scale == 0 and _x_range_total > _EC_CHUNK)
        if x_scale == 0 and not _use_ec_chunks:
            x_arr = np.arange(x_min, x_max + 1, dtype=np.float64)
            x_int = np.arange(x_min, x_max + 1, dtype=np.int64)

        for idx, (n_float, n_disp) in enumerate(n_pairs):
            if skip_zero_n and n_float == 0.0:
                continue

            # ── heartbeat + soft-timeout ──────────────────────────────────────
            _now = time.monotonic()
            if _now - last_hb >= _KEEPALIVE_SEC:
                yield _SSE_KEEPALIVE
                last_hb = _now
            if _now - t_start >= _SOFT_TIMEOUT:
                yield sse({"type": "done", "total_solutions": solutions_found,
                           "n_with_solutions": n_with_solutions,
                           "timed_out": True, "timed_out_at_n": n_disp})
                return

            batch: list[dict] = []

            # Build per-n x range when auto-scaling
            if x_scale > 0:
                half = max(10, math.ceil(x_scale * abs(n_float)))
                # Guard: refuse to build a numpy array larger than 50 M elements
                if half > 50_000_000:
                    yield sse({"type": "error",
                               "message": (
                                   f"Auto-scale: per-n x range [{-half:,}, {half:,}] is "
                                   "too large for vectorised search. "
                                   "Switch to Smart Window mode and set a centre "
                                   "expression (e.g. icbrt(1729*n**3)) with a small  "
                                   "half-width instead."
                               )})
                    return
                x_arr = np.arange(-half, half + 1, dtype=np.float64)
                x_int = np.arange(-half, half + 1, dtype=np.int64)

            _n_exact = n_raw[idx][0]

            def _process_ec_chunk(x_int_c: np.ndarray, x_arr_c: np.ndarray) -> list:  # noqa: ANN202
                """Evaluate one chunk of x values, return solution dicts."""
                chunk_batch: list[dict] = []
                # QR modular sieve
                if (f_py_exact is not None
                        and len(x_int_c) >= _SIEVE_MIN_X
                        and isinstance(_n_exact, int)):
                    _sv = _compute_qr_sieve(f_py_exact, _n_exact, x_int_c)
                    x_arr_eval = x_arr_c[_sv]
                    x_int_eval = x_int_c[_sv]
                else:
                    x_arr_eval = x_arr_c
                    x_int_eval = x_int_c
                try:
                    rhs_raw = f_fast(n_float, x_arr_eval)
                    rhs_arr = np.asarray(rhs_raw, dtype=np.float64)
                    if rhs_arr.ndim == 0:
                        rhs_arr = np.full(len(x_arr_eval), float(rhs_arr))
                except Exception:  # noqa: BLE001
                    return chunk_batch
                rhs_round = np.rint(rhs_arr)
                mask = (
                    np.isfinite(rhs_arr)
                    & (rhs_round >= 0)
                    & (np.abs(rhs_arr - rhs_round) <= 1e-6)
                )
                if np.any(mask):
                    cand_rhs_np = rhs_round[mask]
                    cand_x      = x_int_eval[mask]
                    for j in range(len(cand_x)):
                        x_val = int(cand_x[j])
                        if skip_zero_x and x_val == 0:
                            continue
                        rhs_approx = int(cand_rhs_np[j])
                        if rhs_approx > _EXACT_THRESH and f_py_exact is not None:
                            try:
                                rhs_exact = int(f_py_exact(_n_exact, x_val))
                            except Exception:  # noqa: BLE001
                                rhs_exact = rhs_approx
                        else:
                            rhs_exact = rhs_approx
                        if rhs_exact < 0:
                            continue
                        y_pos = math.isqrt(rhs_exact)
                        if y_pos * y_pos == rhs_exact:
                            chunk_batch.append({"n": n_disp, "x": x_val, "y":  y_pos})
                            if y_pos > 0:
                                chunk_batch.append({"n": n_disp, "x": x_val, "y": -y_pos})
                return chunk_batch

            if _use_ec_chunks:
                # Chunked scan: process x range in _EC_CHUNK blocks to stay within RAM
                if point_type in ("integer", "all"):
                    for _cs in range(x_min, x_max + 1, _EC_CHUNK):
                        _ce = min(_cs + _EC_CHUNK, x_max + 1)
                        _xi = np.arange(_cs, _ce, dtype=np.int64)
                        _xa = _xi.astype(np.float64)
                        _cb = _process_ec_chunk(_xi, _xa)
                        batch.extend(_cb)
                        solutions_found += sum(1 for d in _cb if d["y"] >= 0)
                        # heartbeat + soft-timeout check between chunks
                        _now = time.monotonic()
                        if _now - last_hb >= _KEEPALIVE_SEC:
                            yield _SSE_KEEPALIVE
                            last_hb = _now
                        if _now - t_start >= _SOFT_TIMEOUT:
                            if batch:
                                n_with_solutions.append(n_disp)
                                yield sse({"type": "solutions", "data": batch})
                            yield sse({"type": "done", "total_solutions": solutions_found,
                                       "n_with_solutions": n_with_solutions,
                                       "timed_out": True, "timed_out_at_n": n_disp})
                            return
            else:
                if point_type in ("integer", "all"):
                    _cb = _process_ec_chunk(x_int, x_arr)
                    batch.extend(_cb)
                    solutions_found += sum(1 for d in _cb if d["y"] >= 0)

            # ── Rational (non-integer) scan ───────────────────────────────────
            if (point_type in ("rational", "all")
                    and f_py_exact is not None
                    and x_scale == 0):
                _rb = _rational_scan(
                    f_py_exact, _n_exact,
                    x_min, x_max, x_denom_max, n_disp, skip_zero_x,
                )
                batch.extend(_rb)
                solutions_found += sum(1 for d in _rb if not str(d["y"]).startswith("-"))

            if batch:
                n_with_solutions.append(n_disp)
                yield sse({"type": "solutions", "data": batch})
                try:
                    ci = _curve_info(expr, n_raw[idx][0])
                    ci["n"] = n_disp
                    yield sse({"type": "curve_info", **ci})
                except Exception:  # noqa: BLE001
                    pass

            if idx % report_step == 0 or idx == n_count - 1:
                yield sse({
                    "type":      "progress",
                    "pct":       round(100 * (idx + 1) / n_count, 1),
                    "n":         n_disp,
                    "solutions": solutions_found,
                })

        # ── x-range hint when fixed search found nothing ─────────────────
        _xrh: str | None = None
        if solutions_found == 0 and x_scale == 0 and n_raw:
            try:
                _n_abs = max(abs(float(n_raw[0][0])), abs(float(n_raw[-1][0])))
                _x_abs = max(abs(x_min), abs(x_max))
                if _n_abs > 1000 and _x_abs < _n_abs:
                    _xsug = int(_n_abs) * 4
                    _xrh = (
                        f"Tip: for n \u2248 {int(_n_abs):,}, x-values of solutions "
                        f"can scale with n (\u2248 3\u20134\u00d7|n| \u2248 {int(_n_abs) * 3:,}). "
                        f"Try \u2460 x range \u00b1{_xsug:,}, "
                        f"\u2461 Auto-scale mode with k\u2009=\u20094, or "
                        f"\u2462 Smart Window with center\u2009=\u2009-3*n "
                        f"and half-width\u2009{max(10000, int(_n_abs) // 10):,}."
                    )
            except Exception:  # noqa: BLE001
                pass

        yield sse({"type": "done", "total_solutions": solutions_found,
                   "n_with_solutions": n_with_solutions,
                   **({"x_range_hint": _xrh} if _xrh else {})})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.route("/api/diophantine")
def api_diophantine():  # noqa: C901
    """
    SSE endpoint for general polynomial Diophantine equations F(n, x, y) = 0.

    Strategy: for each (n, x) pair, form the polynomial P(y) = F(n_val, x_val, y),
    find all approximate real roots via numpy.roots(), round to nearby integers,
    then verify exactly with Python arbitrary-precision arithmetic.

    No y-range required — numpy finds ALL roots of the y-polynomial up to its degree.
    """
    eq_str = request.args.get("eq", "").strip()
    try:
        x_min   = int(request.args.get("x_min",  -50))
        x_max   = int(request.args.get("x_max",   50))
        y_min   = int(request.args.get("y_min", -100))
        y_max   = int(request.args.get("y_max",  100))
        n_min   = int(request.args.get("n_min",    0))
        n_max   = int(request.args.get("n_max",    0))
        n_denom = max(1, int(request.args.get("n_denom", 1)))
        skip_zero_n = request.args.get("skip_zero_n", "") == "1"
        skip_zero_x = request.args.get("skip_zero_x", "") == "1"
    except (ValueError, TypeError) as exc:
        def _err():
            yield f"data: {json.dumps({'type':'error','message':str(exc)})}\n\n"
        return Response(stream_with_context(_err()), mimetype="text/event-stream")

    def sse(obj: dict) -> str:
        return f"data: {json.dumps(obj)}\n\n"

    def generate():  # noqa: C901
        if not eq_str:
            yield sse({"type": "error", "message": "No equation provided."})
            return

        # ── Parse equation ───────────────────────────────────────────────────
        try:
            expr = parse_general_eq(eq_str)
        except ValueError as exc:
            yield sse({"type": "error", "message": str(exc)})
            return

        has_y = y_sym in expr.free_symbols

        # ── Choose strategy ──────────────────────────────────────────────────
        # poly_y  — equation is polynomial in y → numpy.roots() fast path
        # brute3  — y present but non-polynomial (e.g. x**y=n) → vectorised 3D scan
        # brute2  — y absent → 2-variable (n, x) scan
        from sympy import Poly, expand as sp_expand  # noqa: PLC0415

        strategy      = "brute2"
        coeff_syms: list | None    = None
        coeff_fns_flt: list | None = None

        if has_y:
            try:
                poly_t = Poly(sp_expand(expr), y_sym, domain="EX")
                if poly_t.degree() >= 1:
                    coeff_syms    = poly_t.all_coeffs()
                    coeff_fns_flt = [
                        lambdify((n_sym, x_sym), c, modules=["numpy", "math"])
                        for c in coeff_syms
                    ]
                    strategy = "poly_y"
            except Exception:  # noqa: BLE001
                pass
            if strategy != "poly_y":
                strategy = "brute3"

        # ── Compile evaluators ───────────────────────────────────────────────
        # Exact evaluator — uses Python's own arithmetic (integers, Fractions)
        try:
            if has_y:
                f_exact = lambdify((n_sym, x_sym, y_sym), expr, modules=[])
            else:
                f_exact = lambdify((n_sym, x_sym), expr, modules=[])
        except Exception as exc:  # noqa: BLE001
            yield sse({"type": "error", "message": f"Cannot compile equation: {exc}"})
            return

        # Vectorised float evaluator for brute-force strategies
        f_vec = None
        if strategy in ("brute3", "brute2"):
            try:
                if has_y:
                    f_vec = lambdify((n_sym, x_sym, y_sym), expr,
                                     modules=["numpy", "math"])
                else:
                    f_vec = lambdify((n_sym, x_sym), expr,
                                     modules=["numpy", "math"])
            except Exception as exc:  # noqa: BLE001
                yield sse({"type": "error",
                           "message": f"Cannot compile evaluator: {exc}"})
                return

        # ── Build n values ───────────────────────────────────────────────────
        from fractions import Fraction  # noqa: PLC0415
        if n_denom == 1:
            n_raw: list[tuple] = [(i, str(i)) for i in range(n_min, n_max + 1)]
        else:
            seen: set = set()
            fracs: list[Fraction] = []
            for p_int in range(n_min * n_denom, n_max * n_denom + 1):
                frac = Fraction(p_int, n_denom)
                if frac not in seen and n_min <= frac <= n_max:
                    seen.add(frac)
                    fracs.append(frac)
            fracs.sort()
            n_raw = [(f, str(f)) for f in fracs]

        n_count = len(n_raw)
        x_count = x_max - x_min + 1
        y_count = (y_max - y_min + 1) if strategy == "brute3" else 0

        total_evals = n_count * x_count * y_count if strategy == "brute3" \
            else n_count * x_count

        WARN_EVALS = 100_000_000
        if total_evals > WARN_EVALS:
            yield sse({"type": "warning",
                       "message": f"Large search: {total_evals:,} evaluations. "
                                  "Results stream live \u2014 a 245-second time limit applies."})

        yield sse({
            "type":        "start",
            "n_count":     n_count,
            "x_count":     x_count,
            "y_count":     y_count,
            "total_evals": total_evals,
            "x_scale":     0,
            "strategy":    strategy,
        })

        solutions_found   = 0
        n_with_solutions: list[str] = []
        report_step = max(1, n_count // 200)

        # ── timing state for heartbeat / soft-timeout ─────────────────────────
        t_start = time.monotonic()
        last_hb = t_start

        # ══════════════════════════════════════════════════════════════════════
        # STRATEGY: poly_y — polynomial-root fast path
        # Uses mpmath high-precision roots when polynomial coefficients are
        # very large (> 1e8), preventing precision loss that would cause
        # numpy.roots() to miss correct integer candidates.
        # ══════════════════════════════════════════════════════════════════════
        if strategy == "poly_y":
            for idx, (n_raw_val, n_disp) in enumerate(n_raw):
                if skip_zero_n and n_raw_val == 0:
                    continue
                # ── heartbeat + soft-timeout ──────────────────────────────────
                _now = time.monotonic()
                if _now - last_hb >= _KEEPALIVE_SEC:
                    yield _SSE_KEEPALIVE
                    last_hb = _now
                if _now - t_start >= _SOFT_TIMEOUT:
                    yield sse({"type": "done", "total_solutions": solutions_found,
                               "n_with_solutions": n_with_solutions,
                               "timed_out": True, "timed_out_at_n": n_disp})
                    return

                batch: list[dict] = []
                seen_xy: set      = set()
                n_float = float(n_raw_val)

                # ── Vectorised chunked path for large x ranges ─────────────────
                # Degree 1/2: fully vectorised (quadratic formula / direct division)
                # Degree 3+:  per-x root-finding but chunked with heartbeats
                _poly_deg = len(coeff_fns_flt) - 1

                def _verify_xy(x_v: int, y_v: int) -> bool:
                    key = (x_v, y_v)
                    if key in seen_xy:
                        return False
                    try:
                        val = f_exact(n_raw_val, x_v, y_v)
                        ok  = (abs(val) < 0.5) if isinstance(val, float) else (val == 0)
                    except Exception:  # noqa: BLE001
                        ok = False
                    if ok:
                        seen_xy.add(key)
                    return ok

                for _xs in range(x_min, x_max + 1, _POLY_CHUNK):
                    _xe = min(_xs + _POLY_CHUNK, x_max + 1)
                    x_chunk_int = np.arange(_xs, _xe, dtype=np.int64)
                    if skip_zero_x:
                        x_chunk_int = x_chunk_int[x_chunk_int != 0]
                    if len(x_chunk_int) == 0:
                        continue
                    x_chunk_flt = x_chunk_int.astype(np.float64)

                    # Compute all polynomial coefficients as numpy arrays over chunk
                    try:
                        coeff_arrs: list[np.ndarray] = []
                        for cf in coeff_fns_flt:
                            cv = np.asarray(cf(n_float, x_chunk_flt), dtype=np.float64)
                            if cv.ndim == 0:
                                cv = np.full(len(x_chunk_flt), float(cv))
                            coeff_arrs.append(cv)
                        # Drop leading zero coefficients (all-zero across chunk is rare but safe)
                        while len(coeff_arrs) > 1 and np.all(coeff_arrs[0] == 0):
                            coeff_arrs.pop(0)
                        eff_deg = len(coeff_arrs) - 1
                        if eff_deg < 1:
                            continue
                    except Exception:  # noqa: BLE001
                        # Vectorised eval failed — fall back to per-x scalar loop for this chunk
                        coeff_arrs = None
                        eff_deg = _poly_deg

                    if coeff_arrs is not None and eff_deg == 1:
                        # Degree 1 in y: a·y + b = 0  →  y = −b/a  (vectorised)
                        a_arr, b_arr = coeff_arrs[0], coeff_arrs[1]
                        valid = np.abs(a_arr) > 1e-10
                        y_exact = np.where(valid, -b_arr / a_arr, np.nan)
                        y_round = np.rint(y_exact)
                        cand_mask = valid & np.isfinite(y_exact) & (np.abs(y_exact - y_round) < 1e-6)
                        for k in np.where(cand_mask)[0]:
                            x_v = int(x_chunk_int[k])
                            y_v = int(y_round[k])
                            if _verify_xy(x_v, y_v):
                                batch.append({"n": n_disp, "x": str(x_v), "y": str(y_v)})
                                solutions_found += 1

                    elif coeff_arrs is not None and eff_deg == 2:
                        # Degree 2 in y: quadratic formula  (vectorised)
                        a_arr, b_arr, c_arr = coeff_arrs[0], coeff_arrs[1], coeff_arrs[2]
                        disc = b_arr * b_arr - 4.0 * a_arr * c_arr
                        valid = (np.abs(a_arr) > 1e-10) & (disc >= -1e-10)
                        sqrt_d = np.where(valid, np.sqrt(np.maximum(disc, 0)), 0.0)
                        for sign in (1.0, -1.0):
                            y_cand = np.where(valid, (-b_arr + sign * sqrt_d) / (2.0 * a_arr), np.nan)
                            y_r    = np.rint(y_cand)
                            cm     = valid & np.isfinite(y_cand) & (np.abs(y_cand - y_r) < 1e-6)
                            for k in np.where(cm)[0]:
                                x_v = int(x_chunk_int[k])
                                y_v = int(y_r[k])
                                if _verify_xy(x_v, y_v):
                                    batch.append({"n": n_disp, "x": str(x_v), "y": str(y_v)})
                                    solutions_found += 1

                    else:
                        # Degree 3+ (or vectorised coeff eval failed): per-x root finding
                        for ki, x_val in enumerate(x_chunk_int.tolist()):
                            x_float = float(x_val)
                            try:
                                if coeff_arrs is not None:
                                    flt_c = [float(coeff_arrs[d][ki]) for d in range(len(coeff_arrs))]
                                else:
                                    flt_c = []
                                    for cf in coeff_fns_flt:
                                        v = cf(n_float, x_float)
                                        flt_c.append(float(v) if np.isscalar(v)
                                                     else float(np.asarray(v).flat[0]))
                                while len(flt_c) > 1 and flt_c[0] == 0.0:
                                    flt_c.pop(0)
                                if len(flt_c) < 2:
                                    continue
                                _max_c = max(abs(c) for c in flt_c if c != 0.0)
                                if _MPMATH and _max_c > 1e8:
                                    try:
                                        _mp_c    = [_mpmath.mpf(c) for c in flt_c]
                                        _mp_roots = _mpmath.polyroots(_mp_c, maxsteps=200, extraprec=40)
                                        approx_roots = [complex(r) for r in _mp_roots]
                                    except Exception:  # noqa: BLE001
                                        approx_roots = list(np.roots(flt_c))
                                else:
                                    approx_roots = list(np.roots(flt_c))
                                y_cands: set[int] = set()
                                for r in approx_roots:
                                    if abs(r.imag) < 0.5:
                                        yr = r.real
                                        y_cands.add(math.floor(yr))
                                        y_cands.add(math.ceil(yr))
                                        if abs(yr) > 1e9:
                                            y_cands.add(math.floor(yr) - 1)
                                            y_cands.add(math.ceil(yr) + 1)
                            except Exception:  # noqa: BLE001
                                continue
                            for y_cand in y_cands:
                                if _verify_xy(x_val, y_cand):
                                    batch.append({"n": n_disp, "x": str(x_val), "y": str(y_cand)})
                                    solutions_found += 1

                    # Heartbeat + timeout between x-chunks
                    _now = time.monotonic()
                    if _now - last_hb >= _KEEPALIVE_SEC:
                        yield _SSE_KEEPALIVE
                        last_hb = _now
                    if _now - t_start >= _SOFT_TIMEOUT:
                        if batch:
                            n_with_solutions.append(n_disp)
                            yield sse({"type": "solutions", "data": batch})
                        yield sse({"type": "done", "total_solutions": solutions_found,
                                   "n_with_solutions": n_with_solutions,
                                   "timed_out": True, "timed_out_at_n": n_disp})
                        return

                if batch:
                    n_with_solutions.append(n_disp)
                    yield sse({"type": "solutions", "data": batch})
                if idx % report_step == 0 or idx == n_count - 1:
                    yield sse({"type": "progress",
                               "pct": round(100 * (idx + 1) / n_count, 1),
                               "n": n_disp, "solutions": solutions_found})

        # ══════════════════════════════════════════════════════════════════════
        # STRATEGY: brute3 — vectorised 3D brute-force over (n, x, y)
        # ══════════════════════════════════════════════════════════════════════
        elif strategy == "brute3":
            y_arr_int = np.arange(y_min, y_max + 1, dtype=np.int64)
            y_arr_flt = y_arr_int.astype(float)

            for idx, (n_raw_val, n_disp) in enumerate(n_raw):
                if skip_zero_n and n_raw_val == 0:
                    continue
                # ── heartbeat + soft-timeout ──────────────────────────────────
                _now = time.monotonic()
                if _now - last_hb >= _KEEPALIVE_SEC:
                    yield _SSE_KEEPALIVE
                    last_hb = _now
                if _now - t_start >= _SOFT_TIMEOUT:
                    yield sse({"type": "done", "total_solutions": solutions_found,
                               "n_with_solutions": n_with_solutions,
                               "timed_out": True, "timed_out_at_n": n_disp})
                    return

                batch: list[dict] = []
                seen_set: set     = set()
                n_float = float(n_raw_val)

                for _bx_s in range(x_min, x_max + 1, _POLY_CHUNK):
                    _bx_e = min(_bx_s + _POLY_CHUNK, x_max + 1)
                    for x_val in range(_bx_s, _bx_e):
                        if skip_zero_x and x_val == 0:
                            continue
                        x_float = float(x_val)

                        # Vectorised scan over the entire y range at once
                        try:
                            raw = f_vec(n_float, x_float, y_arr_flt)
                            vals = np.asarray(raw, dtype=float).ravel()
                            if vals.size == 1:   # scalar broadcast
                                vals = np.full(len(y_arr_int), vals[0])
                            y_cands_list = y_arr_int[
                                np.isfinite(vals) & (np.abs(vals) < 1.0)
                            ].tolist()
                        except Exception:  # noqa: BLE001
                            y_cands_list = []
                            for y_vi, y_fi in zip(y_arr_int.tolist(),
                                                  y_arr_flt.tolist()):
                                try:
                                    v = float(f_vec(n_float, x_float, y_fi))
                                    if math.isfinite(v) and abs(v) < 1.0:
                                        y_cands_list.append(y_vi)
                                except Exception:  # noqa: BLE001
                                    pass

                        for y_cand in y_cands_list:
                            y_cand = int(y_cand)
                            key = (x_val, y_cand)
                            if key in seen_set:
                                continue
                            ok = False
                            try:
                                val = f_exact(n_raw_val, x_val, y_cand)
                                ok  = (abs(val) < 0.5) if isinstance(val, float) \
                                      else (val == 0)
                            except Exception:  # noqa: BLE001
                                # exact check failed; use tight float threshold
                                try:
                                    fv = float(f_vec(n_float, x_float, float(y_cand)))
                                    ok = math.isfinite(fv) and abs(fv) < 0.5
                                except Exception:  # noqa: BLE001
                                    pass
                            if ok:
                                seen_set.add(key)
                                batch.append({"n": n_disp, "x": str(x_val),
                                              "y": str(y_cand)})
                                solutions_found += 1

                    # Heartbeat + timeout between x-chunks
                    _now = time.monotonic()
                    if _now - last_hb >= _KEEPALIVE_SEC:
                        yield _SSE_KEEPALIVE
                        last_hb = _now
                    if _now - t_start >= _SOFT_TIMEOUT:
                        if batch:
                            n_with_solutions.append(n_disp)
                            yield sse({"type": "solutions", "data": batch})
                        yield sse({"type": "done", "total_solutions": solutions_found,
                                   "n_with_solutions": n_with_solutions,
                                   "timed_out": True, "timed_out_at_n": n_disp})
                        return

                if batch:
                    n_with_solutions.append(n_disp)
                    yield sse({"type": "solutions", "data": batch})
                if idx % report_step == 0 or idx == n_count - 1:
                    yield sse({"type": "progress",
                               "pct": round(100 * (idx + 1) / n_count, 1),
                               "n": n_disp, "solutions": solutions_found})

        # ══════════════════════════════════════════════════════════════════════
        # STRATEGY: brute2 — y absent, scan over (n, x) only
        # ══════════════════════════════════════════════════════════════════════
        else:
            for idx, (n_raw_val, n_disp) in enumerate(n_raw):
                if skip_zero_n and n_raw_val == 0:
                    continue
                # ── heartbeat + soft-timeout ──────────────────────────────────
                _now = time.monotonic()
                if _now - last_hb >= _KEEPALIVE_SEC:
                    yield _SSE_KEEPALIVE
                    last_hb = _now
                if _now - t_start >= _SOFT_TIMEOUT:
                    yield sse({"type": "done", "total_solutions": solutions_found,
                               "n_with_solutions": n_with_solutions,
                               "timed_out": True, "timed_out_at_n": n_disp})
                    return

                batch: list[dict] = []
                n_float = float(n_raw_val)

                for _bx_s in range(x_min, x_max + 1, _POLY_CHUNK):
                    _bx_e = min(_bx_s + _POLY_CHUNK, x_max + 1)
                    for x_val in range(_bx_s, _bx_e):
                        if skip_zero_x and x_val == 0:
                            continue
                        ok = False
                        try:
                            val = f_exact(n_raw_val, x_val)
                            ok  = (abs(val) < 0.5) if isinstance(val, float) \
                                  else (val == 0)
                        except Exception:  # noqa: BLE001
                            try:
                                fv = float(f_vec(n_float, float(x_val)))
                                ok = math.isfinite(fv) and abs(fv) < 0.5
                            except Exception:  # noqa: BLE001
                                pass
                        if ok:
                            batch.append({"n": n_disp, "x": str(x_val),
                                          "y": "\u2014"})
                            solutions_found += 1

                    # Heartbeat + timeout between x-chunks
                    _now = time.monotonic()
                    if _now - last_hb >= _KEEPALIVE_SEC:
                        yield _SSE_KEEPALIVE
                        last_hb = _now
                    if _now - t_start >= _SOFT_TIMEOUT:
                        if batch:
                            n_with_solutions.append(n_disp)
                            yield sse({"type": "solutions", "data": batch})
                        yield sse({"type": "done", "total_solutions": solutions_found,
                                   "n_with_solutions": n_with_solutions,
                                   "timed_out": True, "timed_out_at_n": n_disp})
                        return

                if batch:
                    n_with_solutions.append(n_disp)
                    yield sse({"type": "solutions", "data": batch})
                if idx % report_step == 0 or idx == n_count - 1:
                    yield sse({"type": "progress",
                               "pct": round(100 * (idx + 1) / n_count, 1),
                               "n": n_disp, "solutions": solutions_found})

        yield sse({"type": "done", "total_solutions": solutions_found,
                   "n_with_solutions": n_with_solutions})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Plot helpers ───────────────────────────────────────────────────────────────

def _build_pgfplots(eq_latex: str, n_val_str: str,
                    pos_segs: list, neg_segs: list, sol_pts: list,
                    xlo: float, xhi: float, ylo: float, yhi: float,
                    mode: str) -> str:
    """Return a self-contained pgfplots axis environment for the curve."""
    DECIMATE = 3  # keep every 3rd point to control .tex size
    lines: list[str] = []
    lines.append(r"\begin{tikzpicture}")
    lines.append(r"\begin{axis}[")
    lines.append(r"  xlabel={$x$}, ylabel={$y$},")
    if mode == "ec":
        rhs_tex = eq_latex.replace("y^2 = ", "").replace("y\u00b2 = ", "")
        title_str = f"$y^2 = {rhs_tex}$, $n = {n_val_str}$"
    else:
        title_str = f"${eq_latex}$"
    lines.append(f"  title={{{title_str}}},")
    lines.append(r"  grid=major,")
    lines.append(f"  xmin={round(xlo, 2)}, xmax={round(xhi, 2)},")
    lines.append(f"  ymin={round(ylo, 2)}, ymax={round(yhi, 2)},")
    lines.append(r"  width=14cm, height=9cm,")
    lines.append(r"  axis lines=center,")
    lines.append(r"  tick label style={font=\small},")
    lines.append(r"]")
    for seg in pos_segs:
        if len(seg) < 2:
            continue
        pts = seg[::DECIMATE] if len(seg) > DECIMATE * 2 else seg
        coords = " ".join(f"({p[0]:.4f},{p[1]:.4f})" for p in pts)
        lines.append(r"\addplot[blue, semithick, smooth] coordinates {")
        lines.append(f"  {coords}")
        lines.append(r"};")
    for seg in neg_segs:
        if len(seg) < 2:
            continue
        pts = seg[::DECIMATE] if len(seg) > DECIMATE * 2 else seg
        coords = " ".join(f"({p[0]:.4f},{p[1]:.4f})" for p in pts)
        lines.append(r"\addplot[blue, semithick, smooth] coordinates {")
        lines.append(f"  {coords}")
        lines.append(r"};")
    if sol_pts:
        coords = " ".join(f"({p[0]:.4f},{p[1]:.4f})" for p in sol_pts)
        lines.append(r"\addplot[red, only marks, mark=*, mark size=4pt] coordinates {")
        lines.append(f"  {coords}")
        lines.append(r"};")
    lines.append(r"\end{axis}")
    lines.append(r"\end{tikzpicture}")
    return "\n".join(lines)


@app.route("/api/plot", methods=["POST"])
def api_plot():  # noqa: C901
    """
    Generate curve data for canvas visualization and pgfplots export.

    POST JSON:
        mode      : "ec" | "gen"
        expr      : RHS expression string (EC mode only)
        eq        : full equation string (Gen mode only)
        n_val     : n value as string, may be fractional (default "0")
        x_min     : float — left edge of plotting window
        x_max     : float — right edge of plotting window
        solutions : [{x, y}, …] — integer points to highlight as red dots

    Response JSON:
        ok, pos_segments, neg_segments, sol_points, pgfplots, eq_latex, n_val
    """
    import math as _math
    data = request.get_json(silent=True) or {}
    mode = data.get("mode", "ec")

    # Parse n_val — may be a rational string like "3/7"
    n_val_str = str(data.get("n_val", "0")).strip()
    try:
        from fractions import Fraction as _Frac  # noqa: PLC0415
        n_val_f = float(_Frac(n_val_str))
    except Exception:  # noqa: BLE001
        try:
            n_val_f = float(n_val_str)
        except Exception:  # noqa: BLE001
            n_val_f = 0.0

    solutions_raw = data.get("solutions", [])
    try:
        x_plot_min = float(data.get("x_min", -20))
        x_plot_max = float(data.get("x_max",  20))
    except (ValueError, TypeError):
        x_plot_min, x_plot_max = -20.0, 20.0

    # Sanitise plot range
    if x_plot_max - x_plot_min <= 0 or x_plot_max - x_plot_min > 10_000:
        x_plot_min = max(-200.0, x_plot_min)
        x_plot_max = min( 200.0, x_plot_max)
        if x_plot_max - x_plot_min <= 0:
            x_plot_min, x_plot_max = -20.0, 20.0

    N_SAMPLES = 600
    span = x_plot_max - x_plot_min
    xs = [x_plot_min + i * span / (N_SAMPLES - 1) for i in range(N_SAMPLES)]

    pos_segments: list = []
    neg_segments: list = []
    eq_latex = ""
    curve_strategy = "none"

    # ── EC mode: y² = expr(n, x) ─────────────────────────────────────────────
    if mode == "ec":
        expr_str = data.get("expr", "").strip()
        if not expr_str:
            return {"ok": False, "error": "No expression provided."}
        try:
            expr = parse_expr(expr_str)
            eq_latex = f"y^2 = {sym_latex(expr)}"
        except ValueError as exc:
            return {"ok": False, "error": str(exc)}
        try:
            f_ec = lambdify((n_sym, x_sym), expr, modules=["numpy", "math"])
        except Exception as exc:  # noqa: BLE001
            return {"ok": False, "error": str(exc)}

        xs_arr = np.array(xs, dtype=np.float64)
        try:
            rhs = np.asarray(f_ec(n_val_f, xs_arr), dtype=np.float64)
            if rhs.ndim == 0:
                rhs = np.full(len(xs_arr), float(rhs))
        except Exception:  # noqa: BLE001
            return {"ok": False, "error": "Cannot evaluate expression for plotting."}

        cur_pos: list = []
        cur_neg: list = []
        for xi, ri in zip(xs, rhs.tolist()):
            if _math.isfinite(ri) and ri >= 0:
                yi = _math.sqrt(ri)
                cur_pos.append([round(xi, 5), round( yi, 5)])
                cur_neg.append([round(xi, 5), round(-yi, 5)])
            else:
                if cur_pos:
                    pos_segments.append(cur_pos)
                    neg_segments.append(cur_neg)
                    cur_pos = []
                    cur_neg = []
        if cur_pos:
            pos_segments.append(cur_pos)
            neg_segments.append(cur_neg)
        curve_strategy = "ec" if pos_segments else "ec_no_real"

    # ── Gen mode: F(n, x, y) = 0 ─────────────────────────────────────────────
    else:
        eq_str = data.get("eq", "").strip()
        if not eq_str:
            return {"ok": False, "error": "No equation provided."}
        try:
            expr = parse_general_eq(eq_str)
        except ValueError as exc:
            return {"ok": False, "error": str(exc)}

        # Build LaTeX representation
        if "=" in eq_str:
            parts = eq_str.split("=", 1)
            try:
                lhs_e = sympify(parts[0].strip().replace("^", "**"),
                                locals={"n": n_sym, "x": x_sym, "y": y_sym})
                rhs_e = sympify(parts[1].strip().replace("^", "**"),
                                locals={"n": n_sym, "x": x_sym, "y": y_sym})
                eq_latex = f"{sym_latex(lhs_e)} = {sym_latex(rhs_e)}"
            except Exception:  # noqa: BLE001
                eq_latex = sym_latex(expr) + " = 0"
        else:
            eq_latex = sym_latex(expr) + " = 0"

        has_y = y_sym in expr.free_symbols
        if has_y:
            from sympy import Poly, expand as sp_expand  # noqa: PLC0415
            _poly_tried = False
            try:
                poly_t = Poly(sp_expand(expr), y_sym, domain="EX")
                _poly_tried = True
                if poly_t.degree() >= 1:
                    coeff_syms_list = poly_t.all_coeffs()
                    coeff_fns_plot = [
                        lambdify((n_sym, x_sym), c, modules=["numpy", "math"])
                        for c in coeff_syms_list
                    ]
                    by_root: dict = {}
                    for xi in xs:
                        try:
                            flt_c: list[float] = []
                            for cf in coeff_fns_plot:
                                v = cf(n_val_f, xi)
                                flt_c.append(
                                    float(v) if np.isscalar(v)
                                    else float(np.asarray(v).flat[0])
                                )
                            while len(flt_c) > 1 and flt_c[0] == 0.0:
                                flt_c.pop(0)
                            if len(flt_c) < 2:
                                continue
                            roots = np.roots(flt_c)
                            real_roots = sorted(
                                r.real for r in roots if abs(r.imag) < 0.1
                            )
                            for ri_idx, yr in enumerate(real_roots):
                                by_root.setdefault(ri_idx, []).append(
                                    [round(xi, 5), round(yr, 5)]
                                )
                        except Exception:  # noqa: BLE001
                            pass
                    for seg in by_root.values():
                        if len(seg) > 1:
                            pos_segments.append(seg)
            except Exception:  # noqa: BLE001
                pass
            if not _poly_tried:
                curve_strategy = "brute3"  # y not polynomial (e.g. x^y = n)
            elif pos_segments:
                curve_strategy = "poly_y"
            else:
                curve_strategy = "poly_y_no_real"
        else:
            curve_strategy = "brute2"  # y absent from equation

    # ── Solution points ───────────────────────────────────────────────────────
    sol_pts: list = []
    for s in solutions_raw:
        try:
            yv = s.get("y", "")
            if str(yv) == "\u2014":  # em-dash means y absent (brute2 mode)
                continue
            sol_pts.append([float(str(s.get("x", 0))), float(str(yv))])
        except Exception:  # noqa: BLE001
            pass

    # ── Compute y-axis bounds ─────────────────────────────────────────────────
    curve_ys: list[float] = [p[1] for seg in pos_segments + neg_segments for p in seg]
    sol_ys:   list[float] = [sp[1] for sp in sol_pts]

    if sol_ys:
        # Zoom the y axis to show solution points clearly.
        # The curve can extend far beyond the solutions (e.g. y≈1000 for x=100
        # yet the solutions are at y=6); don't let the full curve extent dwarf
        # the dots.  Instead, build a window centred on the solutions and only
        # include curve values that fall within a generous multiple of that
        # window so the curve shape near the solutions is still visible.
        s_lo, s_hi = min(sol_ys), max(sol_ys)
        sol_extent  = max(s_hi - s_lo, 2.0)
        pad         = max(sol_extent * 1.5, 5.0)
        win_lo, win_hi = s_lo - pad, s_hi + pad

        # Include curve segments that pass within 4× the window of the sol range
        reach = (win_hi - win_lo) * 4
        nearby_curve = [y for y in curve_ys if win_lo - reach <= y <= win_hi + reach]
        all_ys = sol_ys + nearby_curve
        y_lo = min(all_ys)
        y_hi = max(all_ys)
        # Ensure the window around just the solution points is always shown
        y_lo = min(y_lo, win_lo)
        y_hi = max(y_hi, win_hi)
        margin = max(1.0, (y_hi - y_lo) * 0.08)
        y_lo -= margin
        y_hi += margin
    elif curve_ys:
        y_lo = min(curve_ys)
        y_hi = max(curve_ys)
        margin = max(1.0, (y_hi - y_lo) * 0.12)
        y_lo -= margin
        y_hi += margin
    else:
        y_lo, y_hi = -10.0, 10.0

    # Clamp extreme y range so the plot remains useful
    if y_hi - y_lo > 20_000:
        y_lo = max(y_lo, -2_000.0)
        y_hi = min(y_hi,  2_000.0)

    pgfplots = _build_pgfplots(
        eq_latex, n_val_str,
        pos_segments, neg_segments, sol_pts,
        x_plot_min, x_plot_max, y_lo, y_hi,
        mode,
    )

    return {
        "ok":             True,
        "pos_segments":   pos_segments,
        "neg_segments":   neg_segments,
        "sol_points":     sol_pts,
        "x_min":          x_plot_min,
        "x_max":          x_plot_max,
        "y_min":          round(y_lo, 3),
        "y_max":          round(y_hi, 3),
        "eq_latex":       eq_latex,
        "pgfplots":       pgfplots,
        "n_val":          n_val_str,
        "curve_strategy": curve_strategy,
    }


# ── Elliptic curve group-law helpers ─────────────────────────────────────────

def _frac(r):
    """Convert a SymPy Rational (or any numeric) to a Python Fraction."""
    from fractions import Fraction  # noqa: PLC0415
    from sympy import Rational as _R  # noqa: PLC0415
    r2 = _R(r)
    return Fraction(int(r2.p), int(r2.q))


def _ec_add_cubic(a3, a2, a1, a0, P, Q):
    """Add points P, Q on y² = a3·x³ + a2·x² + a1·x + a0 (Fraction coefficients).

    P, Q: (Fraction, Fraction) or the string "O" (point at infinity).
    Returns (Fraction, Fraction) or "O".
    Uses the chord-tangent law (valid for any smooth cubic).
    """
    if P == "O":
        return Q
    if Q == "O":
        return P
    x1, y1 = P
    x2, y2 = Q
    if x1 == x2:
        if y1 + y2 == 0:  # P = −Q (or 2-torsion y1=y2=0)
            return "O"
        if y1 != y2:
            return "O"
        # Doubling: use tangent slope = f′(x) / (2y)
        if y1 == 0:
            return "O"
        f_prime = 3 * a3 * x1 * x1 + 2 * a2 * x1 + a1
        m = f_prime / (2 * y1)
    else:
        m = (y2 - y1) / (x2 - x1)
    k  = y1 - m * x1
    # Vieta: x₁ + x₂ + x₃ = (m² − a₂) / a₃
    x3 = (m * m - a2) / a3 - x1 - x2
    y3 = -(m * x3 + k)
    return (x3, y3)


def _ec_order_cubic(a3, a2, a1, a0, P, max_order=24):
    """Compute multiplicative order of P on y² = a3x³+a2x²+a1x+a0.

    Returns an int (1–max_order) or the string f'>{max_order}'.
    """
    Q = P
    for n_iter in range(1, max_order + 1):
        if Q == "O":
            return n_iter
        Q = _ec_add_cubic(a3, a2, a1, a0, Q, P)
    return f">{max_order}"


# ── Group law endpoint ────────────────────────────────────────────────────────

@app.route("/api/group_law", methods=["POST"])
def api_group_law():
    """Compute P + Q on y² = f(n, x) with exact Fraction arithmetic."""
    data      = request.get_json(silent=True) or {}
    expr_str  = data.get("expr", "").strip()
    n_val_str = str(data.get("n_val", "0")).strip()
    p1_raw    = data.get("p1")
    p2_raw    = data.get("p2")

    from fractions import Fraction  # noqa: PLC0415
    from sympy import Poly, expand as _sexp, Rational as _R, Integer as _Int  # noqa: PLC0415

    try:
        n_val = int(n_val_str) if "/" not in n_val_str else Fraction(n_val_str)
        expr  = parse_expr(expr_str)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}

    # Extract cubic polynomial coefficients a₃, a₂, a₁, a₀
    try:
        n_sub  = _Int(n_val) if isinstance(n_val, int) else _R(n_val.numerator, n_val.denominator)
        rhs    = _sexp(expr.subs(n_sym, n_sub))
        poly   = Poly(rhs, x_sym, domain="QQ")
        if poly.degree() != 3:
            return {"ok": False, "error": f"Group law requires a cubic curve; got degree {poly.degree()}."}
        coeffs = poly.all_coeffs()
        while len(coeffs) < 4:
            coeffs.insert(0, _R(0))
        a3, a2, a1, a0 = [_frac(c) for c in coeffs[-4:]]
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Cannot extract curve coefficients: {exc}"}

    def _parse_pt(d):
        if not d or d.get("x") in (None, "O", "o"):
            return "O"
        try:
            return (Fraction(str(d["x"])), Fraction(str(d["y"])))
        except Exception as exc2:  # noqa: BLE001
            raise ValueError(f"Invalid point: {exc2}") from exc2

    try:
        P = _parse_pt(p1_raw)
        Q = _parse_pt(p2_raw)
    except ValueError as exc:
        return {"ok": False, "error": str(exc)}

    try:
        result = _ec_add_cubic(a3, a2, a1, a0, P, Q)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Group law computation failed: {exc}"}

    if result == "O":
        return {"ok": True, "is_infinity": True, "result": "O"}

    x3, y3   = result
    is_int   = (x3.denominator == 1 and y3.denominator == 1)
    on_curve = str(y3 * y3 - (a3 * x3 ** 3 + a2 * x3 ** 2 + a1 * x3 + a0))
    return {
        "ok":             True,
        "is_infinity":    False,
        "is_integer":     is_int,
        "result":         {"x": str(x3), "y": str(y3)},
        "on_curve_check": on_curve,  # should always be "0"
    }


# ── Torsion subgroup endpoint ─────────────────────────────────────────────────

@app.route("/api/torsion", methods=["POST"])
def api_torsion():
    """Compute torsion subgroup of y²=x³+Ax+B via Nagell-Lutz theorem."""
    data      = request.get_json(silent=True) or {}
    expr_str  = data.get("expr", "").strip()
    n_val_str = str(data.get("n_val", "0")).strip()

    from fractions import Fraction  # noqa: PLC0415
    from sympy import factorint as _fi, Rational as _R  # noqa: PLC0415

    try:
        n_val = int(n_val_str) if "/" not in n_val_str else Fraction(n_val_str)
        expr  = parse_expr(expr_str)
        ci    = _curve_info(expr, n_val)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}

    if "A" not in ci or "B" not in ci:
        return {"ok": False,
                "error": ci.get("curve_class", "Cannot compute torsion for this curve type.")}

    A_r = _R(ci["A"])
    B_r = _R(ci["B"])
    if A_r.q != 1 or B_r.q != 1:
        return {"ok": False,
                "error": "Nagell-Lutz requires integer A, B in short Weierstrass form."}

    A_int = int(A_r.p)
    B_int = int(B_r.p)
    # Nagell-Lutz divisibility parameter: D = 4A³ + 27B²
    D_int = 4 * A_int ** 3 + 27 * B_int ** 2
    if D_int == 0:
        return {"ok": False, "error": "Singular curve (4A³+27B² = 0)."}

    from fractions import Fraction as _Frac  # noqa: PLC0415

    torsion_pts: list[tuple[int, int]] = []

    # ── Case 1: y = 0  →  x³ + Ax + B = 0 ────────────────────────────────
    if B_int != 0:
        y0_divs = _integer_divisors(B_int, min(abs(B_int), 10 ** 7))
    else:
        y0_divs = [0]
        if A_int < 0:
            sq = math.isqrt(-A_int)
            if sq * sq == -A_int:
                y0_divs += [sq, -sq]
    for xc in y0_divs:
        if xc ** 3 + A_int * xc + B_int == 0:
            torsion_pts.append((xc, 0))

    # ── Case 2: y ≠ 0  →  y² | D  (Nagell-Lutz theorem) ──────────────────
    D_abs = abs(D_int)
    if 0 < D_abs < 10 ** 14:
        try:
            fct = _fi(D_abs)
            # Build all y_abs such that y_abs² | D_abs:
            # for each prime pᵉ in factorization, take p^0 … p^(e//2)
            sq_y: set[int] = {1}
            for p_f, e_f in fct.items():
                new_sq: set[int] = set()
                for ev in sq_y:
                    for k in range(e_f // 2 + 1):
                        new_sq.add(ev * (p_f ** k))
                sq_y = new_sq

            for y_abs in sorted(sq_y):
                if y_abs == 0:
                    continue
                for y_val in [y_abs, -y_abs]:
                    const_term = B_int - y_val * y_val   # constant of x³+Ax+(B−y²)=0
                    if const_term == 0:
                        xc_list: list[int] = [0]
                        if A_int < 0:
                            sq2 = math.isqrt(-A_int)
                            if sq2 * sq2 == -A_int:
                                xc_list += [sq2, -sq2]
                    else:
                        xc_list = _integer_divisors(const_term,
                                                    min(abs(const_term), 10 ** 7))
                    for xc in xc_list:
                        if xc ** 3 + A_int * xc + B_int == y_val * y_val:
                            torsion_pts.append((xc, y_val))
        except Exception:  # noqa: BLE001
            pass

    # De-duplicate and compute order of each candidate point
    seen:      set[tuple[int, int]] = set()
    a3f, a2f, a1f, a0f = _Frac(1), _Frac(0), _Frac(A_int), _Frac(B_int)
    pt_orders: list[dict] = []
    max_finite_order = 1

    for pt in torsion_pts:
        if pt in seen:
            continue
        seen.add(pt)
        pt_frac  = (_Frac(pt[0]), _Frac(pt[1]))
        ord_val  = _ec_order_cubic(a3f, a2f, a1f, a0f, pt_frac)
        pt_orders.append({"x": str(pt[0]), "y": str(pt[1]), "order": str(ord_val)})
        try:
            max_finite_order = max(max_finite_order, int(str(ord_val)))
        except ValueError:
            pass

    # Determine torsion group structure (Mazur: 15 possible groups)
    total        = len(pt_orders) + 1   # +1 for point at infinity O
    two_torsion  = sum(1 for p in pt_orders if p["order"] == "2")

    if total == 1:
        group_str = "Trivial {O}"
    elif total == 2:
        group_str = "\u2124/2\u2124"
    elif total == 4 and two_torsion == 3:
        group_str = "\u2124/2\u2124 \u00d7 \u2124/2\u2124"
    elif total == 8 and two_torsion == 3:
        group_str = "\u2124/2\u2124 \u00d7 \u2124/4\u2124"
    elif total == 16 and two_torsion == 3:
        group_str = "\u2124/2\u2124 \u00d7 \u2124/8\u2124"
    else:
        group_str = f"\u2124/{max_finite_order}\u2124"

    return {
        "ok":               True,
        "torsion_points":   pt_orders,
        "group_structure":  group_str,
        "short_weierstrass": ci.get("short_weierstrass",
                                    f"y\u00b2 = x\u00b3 + {A_int}x + {B_int}"),
        "D": str(D_int),
    }


# ── Frobenius traces endpoint ─────────────────────────────────────────────────

@app.route("/api/frobenius", methods=["POST"])
def api_frobenius():
    """Compute Frobenius traces aₚ = p+1 − #E(𝔽ₚ) for the first num_primes primes."""
    data       = request.get_json(silent=True) or {}
    expr_str   = data.get("expr", "").strip()
    n_val_str  = str(data.get("n_val", "0")).strip()
    num_primes = min(25, max(5, int(data.get("num_primes", 20))))

    from fractions import Fraction  # noqa: PLC0415
    from sympy import Rational as _R  # noqa: PLC0415

    try:
        n_val = int(n_val_str) if "/" not in n_val_str else Fraction(n_val_str)
        expr  = parse_expr(expr_str)
        ci    = _curve_info(expr, n_val)
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}

    if "A" not in ci or "B" not in ci:
        return {"ok": False,
                "error": ci.get("curve_class", "Cannot compute for this curve type.")}

    A_r = _R(ci["A"])
    B_r = _R(ci["B"])
    if A_r.q != 1 or B_r.q != 1:
        return {"ok": False, "error": "Frobenius traces require integer A, B."}

    A_int = int(A_r.p)
    B_int = int(B_r.p)

    # Bad primes (those dividing |Δ|)
    bad: set[int] = set()
    try:
        delta_int = int(_R(ci["discriminant"]))
        if delta_int:
            from sympy import factorint as _fi2  # noqa: PLC0415
            bad = set(int(k) for k in _fi2(abs(delta_int)).keys())
    except Exception:  # noqa: BLE001
        pass

    # Generate first num_primes primes (trial division; fast for ≤ 25 primes)
    primes: list[int] = []
    cand = 2
    while len(primes) < num_primes:
        if all(cand % q != 0 for q in primes):
            primes.append(cand)
        cand += 1

    results = []
    for p in primes:
        red_type = "bad" if p in bad else "good"
        A_mod    = A_int % p
        B_mod    = B_int % p
        count    = 0   # affine points over 𝔽ₚ
        for x in range(p):
            rhs = (pow(x, 3, p) + A_mod * x % p + B_mod) % p
            if rhs == 0:
                count += 1
            elif p == 2:
                count += 1   # every element is a QR mod 2
            elif pow(rhs, (p - 1) // 2, p) == 1:
                count += 2
        Np = count + 1   # +1 for point at infinity O
        ap = p + 1 - Np
        results.append({"p": p, "ap": ap, "Np": Np, "type": red_type})

    # Partial BSD heuristic sum  Σ log(p)/p · log(Nₚ/p)  over good primes ≥ 3
    bsd_sum = 0.0
    for r in results:
        if r["type"] == "good" and r["p"] >= 3:
            ratio = max(r["Np"] / r["p"], 1e-10)
            bsd_sum += math.log(r["p"]) / r["p"] * math.log(ratio)

    return {
        "ok":               True,
        "traces":           results,
        "bsd_heuristic":    round(bsd_sum, 4),
        "A":                ci["A"],
        "B":                ci["B"],
        "short_weierstrass": ci.get("short_weierstrass", ""),
    }


# ── Mathematician's Lens helpers ──────────────────────────────────────────────

def _insight_detect_family(expr, n_sym, x_sym):
    """Return a known family identifier or 'general'."""
    try:
        from sympy import Poly, expand, simplify
        px = Poly(expand(expr), x_sym)
        if px.degree() != 3:
            return "general"
        coeffs = px.all_coeffs()
        if len(coeffs) != 4:
            return "general"
        a3, a2, a1, a0 = coeffs
        if a3 != 1 or a2 != 0:
            return "general"
        # y² = x³ − n²x  (congruent number family)
        if a0 == 0 and simplify(a1 + n_sym**2) == 0:
            return "congruent_number"
        # y² = x³ − nx
        if a0 == 0 and simplify(a1 + n_sym) == 0:
            return "minus_nx"
        # y² = x³ + n  (Mordell curves)
        if a1 == 0 and simplify(a0 - n_sym) == 0:
            return "x_cubed_plus_n"
        # y² = x³ − n  (Mordell curves, negative)
        if a1 == 0 and simplify(a0 + n_sym) == 0:
            return "x_cubed_minus_n"
        return "short_weierstrass"
    except Exception:
        return "general"


def _insight_sol_stats(raw_sols):
    count = len(raw_sols)
    if count == 0:
        return {"count": 0, "n_count": 0, "torsion_count": 0, "non_torsion_count": 0}
    n_set = {}
    torsion = 0
    non_torsion = 0
    for s in raw_sols:
        try:
            nv = str(s.get("n", ""))
            n_set[nv] = n_set.get(nv, 0) + 1
            y_val = str(s.get("y", "")).strip()
            if y_val in ("0", "0.0", "-0", "0.00"):
                torsion += 1
            else:
                non_torsion += 1
        except Exception:
            pass
    return {
        "count": count,
        "n_count": len(n_set),
        "torsion_count": torsion,
        "non_torsion_count": non_torsion,
    }


def _insight_curve_section(deg_x, torsion_roots, disc_str, disc_zeros, family):
    cards = []

    # ── Genus / curve type ────────────────────────────────────────────────
    if deg_x == 3:
        cards.append({
            "headline": "Elliptic curve — genus 1",
            "body": (
                "A cubic f(x) makes y\u00b2 = f(n,x) a curve of genus 1 \u2014 an elliptic curve. "
                "Unlike conics (genus 0, always rationally parametrisable) and higher-genus curves "
                "(genus \u2265 2, finitely many rational points by Faltings), elliptic curves sit at "
                "the critical genus: their rational points form a finitely generated abelian group "
                "with potentially infinite structure, making them the richest objects in number theory."
            ),
            "formula": "E(\u211a) \u2245 \u2124\u02b3 \u2295 E(\u211a)\u209c\u2092\u1d63\u209b",
            "intuition": (
                "Genus 1 is the unique 'critical' genus \u2014 just complex enough to have deep structure, "
                "but still tractable. Genus 0 is trivial (parametrised by \u211a). "
                "Genus \u2265 2 is too rigid (Faltings: finitely many points). "
                "Elliptic curves are where the richest arithmetic action lives."
            ),
        })
    elif deg_x == 2:
        cards.append({
            "headline": "Conic \u2014 genus 0",
            "body": (
                "Degree 2 in x gives y\u00b2 = f(n,x) as a conic. Conics either have no rational "
                "points at all, or infinitely many \u2014 all parametrised by a single rational parameter. "
                "The Hasse-Minkowski theorem gives a complete local-global criterion: the conic has "
                "a rational point if and only if it has a real point and a p-adic point for every prime p."
            ),
            "intuition": "Much simpler than elliptic curves. The deep arithmetic of rational points begins at genus 1.",
        })
    elif deg_x >= 4:
        cards.append({
            "headline": f"High-genus curve (degree {deg_x} \u2192 genus \u2265 2)",
            "body": (
                f"Degree {deg_x} in x gives a curve of genus \u2265 2. "
                "By Faltings' theorem (Mordell conjecture, proved 1983), such a curve over \u211a "
                "has only FINITELY many rational points \u2014 but the proof is non-constructive: "
                "it gives no bound on the number of points or an algorithm to find them all."
            ),
            "formula": "genus \u2265 2  \u27f9  |E(\u211a)| < \u221e  (Faltings 1983)",
            "intuition": (
                "Faltings' theorem was a Fields Medal result. It resolves Fermat's Last Theorem "
                "for exponent \u2265 5 in a few lines (the Fermat curve has genus (n-1)(n-2)/2 \u2265 2 for n \u2265 4). "
                "But it gives no effective bound \u2014 finding all rational points on a specific high-genus curve "
                "remains one of the hardest computational problems."
            ),
        })

    # ── Known family ──────────────────────────────────────────────────────
    if family == "congruent_number":
        cards.append({
            "headline": "Congruent number curve y\u00b2 = x\u00b3 \u2212 n\u00b2x",
            "body": (
                "This is one of the most studied families in number theory. "
                "A positive integer n is a congruent number if it equals the area of a right triangle "
                "with all three side lengths rational. The key connection: "
                "n is congruent if and only if y\u00b2 = x\u00b3 \u2212 n\u00b2x has a rational point with y \u2260 0."
            ),
            "formula": "n congruent  \u27fa  rank(y\u00b2 = x\u00b3 \u2212 n\u00b2x)  \u2265 1",
            "intuition": (
                "Known congruent numbers: 5, 6, 7, 13, 14, 15, 20, 21, \u2026 "
                "Non-congruent: 1, 2, 3, 10, 11, \u2026 (no rational right triangle has these areas). "
                "First recorded in Arab manuscripts ~900 CE \u2014 one of mathematics' oldest open problems."
            ),
        })
    elif family in ("x_cubed_plus_n", "x_cubed_minus_n"):
        sign = "+" if family == "x_cubed_plus_n" else "\u2212"
        cards.append({
            "headline": f"Mordell curve family y\u00b2 = x\u00b3 {sign} n",
            "body": (
                f"The family y\u00b2 = x\u00b3 {sign} n are the Mordell curves, studied since Fermat. "
                "For most n, these curves have rank 0 (finitely many integer points by Siegel's theorem). "
                "Fermat proved y\u00b2 = x\u00b3 \u2212 2 has only the integer solutions (x,y) = (3, \u00b15) "
                "using what is now called infinite descent."
            ),
            "intuition": (
                "The j-invariant of a Mordell curve is 0, meaning it has complex multiplication (CM) "
                "by \u2124[\u03c9] where \u03c9 = e^(2\u03c0i/3). CM curves have extra symmetry that makes their "
                "arithmetic more tractable \u2014 and more studied."
            ),
        })

    # ── Discriminant ─────────────────────────────────────────────────────
    if disc_str:
        sing = (
            f" It vanishes at n = {', '.join(disc_zeros)}, "
            "where the curve degenerates (node or cusp \u2014 no longer elliptic)."
            if disc_zeros else ""
        )
        cards.append({
            "headline": "Discriminant \u0394 \u2014 detecting singularities",
            "body": (
                f"\u0394 = {disc_str}. "
                "A non-zero discriminant confirms the cubic has three distinct roots, "
                "making the curve non-singular \u2014 a genuine elliptic curve with a well-defined "
                f"group law.{sing}"
            ),
            "formula": "\u0394 \u2260 0  \u27fa  E is smooth  \u27fa  group law is well-defined",
            "intuition": (
                "At n-values where \u0394 = 0, the curve degenerates: a cuspidal cubic (cusp \u2014 no group law) "
                "or nodal cubic (node \u2014 group law degenerates to \u211a\u00d7 or \u211a\u207a). "
                "These degenerate fibres are the most studied in Kodaira's classification of elliptic surfaces."
            ),
        })

    # ── 2-torsion ─────────────────────────────────────────────────────────
    if torsion_roots:
        roots_str = ",  ".join(f"x = {r}" for r in torsion_roots[:4])
        cards.append({
            "headline": "2-torsion: the 'free' solutions",
            "body": (
                f"Setting y = 0 gives f(n,x) = 0, with roots: {roots_str}. "
                "Each root x\u2080 yields the point (x\u2080, 0) on the curve. "
                "These have order exactly 2 in the group: the tangent at (x\u2080, 0) is vertical, "
                "so it meets the curve 'again' at the point at infinity \u1d4aa, giving P + P = \u1d4aa."
            ),
            "formula": "(x\u2080, 0) \u2208 E  \u27f9  2\u00b7(x\u2080, 0) = \u1d4aa",
            "intuition": (
                "Nagell-Lutz theorem: every integer torsion point (x,y) satisfies y = 0 (2-torsion) "
                "or y\u00b2 | \u0394. This gives a finite, checkable list of all torsion candidates "
                "with no search required \u2014 just compute \u0394 and test divisors."
            ),
        })

    return {"id": "curve", "title": "Curve Structure", "icon": "\u222e", "cards": cards}


def _insight_strategy_section(deg_x, family, n_min, n_max):
    cards = []

    cards.append({
        "headline": "1. Classify before you compute",
        "body": (
            "The first move is always to identify the problem's structure. "
            "For y\u00b2 = f(n,x), the degree of f in x immediately determines the genus, "
            "which determines which theorems apply. "
            "A cubic \u2192 elliptic curve theory (Mordell-Weil, Mazur, BSD). "
            "A quartic \u2192 hyperelliptic (model change needed). "
            "A quadratic \u2192 conic (Hasse-Minkowski, completely elementary)."
        ),
        "intuition": (
            "This is mathematical triage: 10 seconds of classification tells you whether the problem "
            "has finitely many solutions, infinitely many, or is open. Most calculators skip this step "
            "and dive into computation. Mathematicians classify first."
        ),
    })

    if deg_x == 3:
        cards.append({
            "headline": "2. Torsion first \u2014 it costs nothing",
            "body": (
                "The torsion subgroup is finite and findable without any search. "
                "Nagell-Lutz: check y = 0 (roots of f) and y\u00b2 | \u0394. "
                "Mazur's theorem (1977) limits torsion over \u211a to exactly 15 possible groups. "
                "This produces the 'free' solutions before numerical search begins."
            ),
            "formula": "T(E/\u211a)  \u2208  {\u2124/n\u2124 : n \u2264 10 or n = 12}  \u222a  {\u2124/2 \u00d7 \u2124/2n : n \u2264 4}",
            "intuition": (
                "Mazur's theorem is remarkable: among infinitely many possible finite abelian groups, "
                "only 15 can appear as torsion of an elliptic curve over \u211a. "
                "Proving this required the full machinery of modular curves (Eichler-Shimura theory) "
                "and is considered one of the great theorems of 20th-century arithmetic."
            ),
        })
        cards.append({
            "headline": "3. Non-torsion points certify rank \u2265 1",
            "body": (
                "A point (x,y) with y \u2260 0 that is not in the torsion group is a generator of a \u2124-summand. "
                "From one generator P, the chord-tangent law produces P, 2P, 3P, 4P, \u2026 \u2014 "
                "infinitely many distinct rational points with growing height. "
                "Each such point for a given n certifies rank(E_n) \u2265 1."
            ),
            "intuition": (
                "Height grows roughly as H(2P) \u2248 H(P)\u2074. "
                "So a generator of height 1000 doubles to height ~10\u00b9\u00b2 \u2014 essentially invisible to integer search. "
                "Finding small generators is genuinely informative; their absence suggests rank 0."
            ),
        })

    n_note = ""
    if n_min and n_max:
        try:
            span = abs(int(n_max) - int(n_min)) + 1
            n_note = f" Your search covers {span} curve{'s' if span != 1 else ''} in this parametric family."
        except Exception:
            pass

    cards.append({
        "headline": "4. Integer search is provably complete",
        "body": (
            "Siegel's theorem (1929): every elliptic curve over \u211a has only finitely many integer points. "
            "So for a fixed n, all integer solutions lie in a computable box. "
            f"A search over bounded (n, x) is a complete enumeration of integer points in that region.{n_note}"
        ),
        "formula": "|E(\u2124)| < \u221e  (Siegel 1929)",
        "intuition": (
            "Siegel's theorem is non-effective \u2014 it doesn't give the size of the box. "
            "Baker's theorem (1966) later made it effective via linear forms in logarithms: "
            "we can compute an explicit upper bound on |x| and |y| for integer solutions. "
            "This makes the search provably complete, not just heuristically so."
        ),
    })

    if family == "congruent_number":
        cards.append({
            "headline": "Strategy shortcut: Tunnell's criterion (1983)",
            "body": (
                "For y\u00b2 = x\u00b3 \u2212 n\u00b2x, Tunnell found a modular forms criterion: define "
                "A(n) = #{(x,y,z) \u2208 \u2124\u00b3 : 2x\u00b2+y\u00b2+8z\u00b2 = n} and B(n) = #{2x\u00b2+y\u00b2+32z\u00b2 = n}. "
                "If BSD holds: n (odd, squarefree) is congruent \u27fa A(n) = 2\u00b7B(n). "
                "This is computable in polynomial time \u2014 vs exponential brute-force search."
            ),
            "intuition": (
                "The unconditional direction is proved (congruent \u27f9 Tunnell's condition holds). "
                "The converse requires BSD. If BSD is false, Tunnell's criterion could produce "
                "false positives. The $1M prize for BSD would make this computable unconditionally."
            ),
        })

    return {"id": "strategy", "title": "Mathematical Strategy", "icon": "\u22a2", "cards": cards}


def _insight_solutions_section(sol_stats, deg_x):
    cards = []
    count     = sol_stats["count"]
    n_count   = sol_stats["n_count"]
    torsion   = sol_stats["torsion_count"]
    non_tors  = sol_stats["non_torsion_count"]

    if count == 0:
        cards.append({
            "headline": "No integer solutions in the searched range",
            "body": (
                "Absence of solutions is mathematically meaningful, not a failure. "
                "For a rank-0 curve with trivial torsion, there are provably zero integer points. "
                "For rank \u2265 1, the generator might lie outside your search box (large height). "
                "For a genus \u2265 2 curve, the finitely many rational points might all be outside the range."
            ),
            "intuition": (
                "A complete search over a bounded x-range that finds nothing "
                "is strong (but not conclusive) evidence for rank 0. "
                "To confirm rank 0, one performs a full 2-descent computation \u2014 "
                "an algebraic procedure that doesn't require searching."
            ),
        })
        return {"id": "solutions", "title": "Reading the Solutions", "icon": "\u2208", "cards": cards}

    torsion_note = (
        f" {torsion} point{'s' if torsion != 1 else ''} with y = 0 are 2-torsion candidates."
        if torsion else ""
    )
    gen_note = (
        f" {non_tors} point{'s' if non_tors != 1 else ''} with y \u2260 0 are potential rank generators."
        if non_tors else ""
    )
    cards.append({
        "headline": (
            f"{count} integer point{'s' if count != 1 else ''} "
            f"across {n_count} curve{'s' if n_count != 1 else ''}"
        ),
        "body": f"Total: {count} solution{'s' if count != 1 else ''}.{torsion_note}{gen_note}",
        "intuition": "Each value of n defines a distinct elliptic curve. Rank and torsion can vary dramatically across the family.",
    })

    if torsion > 0:
        cards.append({
            "headline": "y = 0 points: the 2-torsion subgroup",
            "body": (
                "Points of the form (x\u2080, 0) are exactly the 2-torsion: P + P = \u1d4aa. "
                "The tangent to the curve at (x\u2080, 0) is vertical, so it meets the curve "
                "at the point at infinity \u1d4aa \u2014 this is the group law giving 2P = \u1d4aa. "
                "These are always 'free': present whenever f(n, x\u2080) = 0 has an integer root."
            ),
            "formula": "(x\u2080, 0) \u2208 E(\u211a)  \u27fa  f(n, x\u2080) = 0",
            "intuition": (
                "If f(n,x) has 3 rational roots, the 2-torsion subgroup is \u2124/2 \u00d7 \u2124/2 (Klein 4-group). "
                "If only 1 rational root: \u2124/2. "
                "These 2-torsion points live entirely in the torsion part T \u2014 "
                "they never contribute to the rank (the infinite part)."
            ),
        })

    if non_tors > 0:
        cards.append({
            "headline": "y \u2260 0 points: rank generators",
            "body": (
                "A point (x, y) with y \u2260 0 is almost certainly non-torsion. "
                "To confirm: check y\u00b2 does not divide \u0394 (Nagell-Lutz). "
                "Each such point for a given n certifies rank(E_n) \u2265 1 \u2014 "
                "meaning E_n(\u211a) is infinite, with P, 2P, 3P, \u2026 all rational but with "
                "rapidly growing coordinates."
            ),
            "formula": "rank \u2265 1  \u27f9  |E(\u211a)| = \u221e",
            "intuition": (
                "The chord-tangent law: to compute 2P, draw the tangent at P \u2014 "
                "it meets the curve at a third point, then reflect over the x-axis. "
                "Height doubles roughly as H(2P) \u2248 H(P)\u2074, so generators with height > ~1000 "
                "are essentially invisible to integer search, yet still generate infinitely many points."
            ),
        })

    if non_tors > 0 and n_count > 4:
        density = non_tors / max(n_count, 1)
        level = "high" if density > 0.6 else "moderate" if density > 0.3 else "low"
        cards.append({
            "headline": f"Solution density is {level} ({non_tors}/{n_count} n-values have generators)",
            "body": (
                f"{'Most' if density > 0.6 else 'Some'} searched n-values yield non-torsion points. "
                "This is consistent with the average analytic rank of this curve family, "
                "which BSD predicts via the order of vanishing of L(E_n, s) at s = 1."
            ),
            "intuition": (
                "Random matrix theory predicts ~50% of elliptic curves have rank 0 and ~50% rank 1, "
                "with negligibly many having rank \u2265 2. Specific parametric families can deviate: "
                "the congruent number family has a positive proportion with rank \u2265 1."
            ),
        })

    return {"id": "solutions", "title": "Reading the Solutions", "icon": "\u2208", "cards": cards}


def _insight_deeper_section(deg_x, family):
    cards = []

    if deg_x == 3:
        cards.append({
            "headline": "Birch\u2013Swinnerton-Dyer conjecture (\u00a31M open problem)",
            "body": (
                "BSD predicts: rank(E(\u211a)) = ord_{s=1} L(E, s). "
                "The L-function L(E, s) encodes the number of points on E mod p for every prime p. "
                "BSD connects the arithmetic of the curve (rational points you can compute) "
                "to its analytic behaviour (complex analysis). "
                "It is one of the seven Millennium Prize Problems."
            ),
            "formula": "rank(E(\u211a))  =  ord_{s=1} L(E, s)  (BSD conjecture)",
            "intuition": (
                "Every non-torsion rational point you find is direct arithmetic evidence consistent with BSD: "
                "it implies L(E,1) = 0 (BSD says so). "
                "The conjecture has been verified computationally for millions of curves, "
                "and is proved for rank 0 and rank 1 curves (Kolyvagin, 1988) \u2014 but not in general."
            ),
        })
        cards.append({
            "headline": "Mordell-Weil theorem: the group structure",
            "body": (
                "Mordell (1922) proved E(\u211a) is finitely generated; Weil generalised to number fields (1929). "
                "The rank r \u2208 {0, 1, 2, \u2026} measures the 'size' of the infinite part. "
                "No unconditional upper bound on r is known. "
                "The current record is rank \u2265 29 (Elkies, 2006). "
                "Average rank is conjectured to be 1/2."
            ),
            "formula": "E(\u211a) \u2245 \u2124\u02b3 \u2295 T,   r \u2265 0,   T finite",
            "intuition": (
                "The torsion T is completely classified (Mazur's theorem: exactly 15 possible groups). "
                "The rank r is the deep mystery \u2014 computing it is essentially equivalent to BSD. "
                "The fastest known algorithm (2-descent) is exponential in the worst case."
            ),
        })
        cards.append({
            "headline": "Elliptic curve cryptography",
            "body": (
                "The same chord-tangent group law used here underlies modern cryptography. "
                "ECDSA (Bitcoin, TLS) and ECDH (TLS key exchange) rely on the elliptic curve "
                "discrete logarithm: given P and Q = nP, finding n is computationally infeasible "
                "for large prime-order curves. A 256-bit EC key gives security equivalent to "
                "a 3072-bit RSA key."
            ),
            "intuition": (
                "Your parametric family is not cryptographically suitable \u2014 it has special structure "
                "(parametric, potentially low order). Cryptographic curves (P-256, Curve25519, secp256k1) "
                "are chosen for maximal group order, no CM, no small subgroups, and resistance to "
                "MOV, ECDLP, and isogeny attacks."
            ),
        })

    if family == "congruent_number":
        cards.append({
            "headline": "The congruent number problem (antiquity \u2192 today)",
            "body": (
                "First recorded in Arab manuscripts around 900 CE: which integers are areas of "
                "rational right triangles? The link to elliptic curves was found in the 1970s\u201380s. "
                "Tunnell (1983) gave a near-complete modular forms criterion. "
                "In 2019, Smith proved BSD holds for a positive proportion of congruent number curves, "
                "making the problem conditionally solved for 100% of squarefree n via Tunnell."
            ),
            "intuition": (
                "The 3-4-5 right triangle has area 6, so 6 is congruent. "
                "Is 1 congruent? It would need a rational right triangle of area 1. "
                "Fermat proved no such triangle exists \u2014 but his proof required what is now "
                "the Nagell-Lutz theorem applied to y\u00b2 = x\u00b3 \u2212 x."
            ),
        })

    cards.append({
        "headline": "LMFDB \u2014 the global database",
        "body": (
            "Every elliptic curve over \u211a in short Weierstrass form y\u00b2 = x\u00b3 + ax + b "
            "is catalogued in the LMFDB (lmfdb.org): rank, generators, torsion, conductor, "
            "BSD invariants, modular form, and L-function data. "
            "Convert any specific curve to short Weierstrass form and search by (a, b) coefficients "
            "to find its complete arithmetic profile instantly."
        ),
        "intuition": (
            "The LMFDB contains over 3 million curves, built by a global collaboration. "
            "Every elliptic curve over \u211a is modular (Wiles\u2013Taylor, 1995 \u2014 Fermat's Last Theorem) "
            "so each curve corresponds to a modular form. "
            "The LMFDB is the meeting point between these two worlds."
        ),
    })

    return {"id": "deeper", "title": "Deeper Theory", "icon": "\u221e", "cards": cards}


# ── Mathematician's Lens endpoint ─────────────────────────────────────────────

@app.route("/api/insight", methods=["POST"])
def api_insight():
    """
    Return structured mathematical insight about the parametric elliptic curve family.

    Request body (JSON):
        {
          "expr":      "x**3 - n**2*x",
          "solutions": [{n, x, y}, ...],   # optional, capped at 300
          "n_min":     "-10",
          "n_max":     "10"
        }
    """
    data     = request.get_json(silent=True) or {}
    expr_str = data.get("expr", "").strip()
    raw_sols = data.get("solutions", [])[:300]
    n_min    = str(data.get("n_min", ""))
    n_max    = str(data.get("n_max", ""))

    if not expr_str:
        return jsonify({"ok": False, "error": "No expression provided."}), 400

    try:
        from sympy import symbols, sympify, Poly, expand, solve, factor, simplify

        n_sym, x_sym = symbols("n x", real=True)
        try:
            expr = sympify(expr_str, locals={"n": n_sym, "x": x_sym})
        except Exception as exc:
            return jsonify({"ok": False, "error": f"Could not parse expression: {exc}"}), 400

        # ── Degree / polynomial structure ──────────────────────────────────
        deg_x    = -1
        coeffs_x = []
        try:
            px       = Poly(expand(expr), x_sym)
            deg_x    = px.degree()
            coeffs_x = px.all_coeffs()
        except Exception:
            pass

        # ── 2-torsion roots: solve f(n,x) = 0 treating n as symbol ────────
        torsion_roots = []
        try:
            roots_sym = solve(expr, x_sym)
            for r in roots_sym[:5]:
                torsion_roots.append(str(r))
        except Exception:
            pass

        # ── Discriminant (cubic only) ──────────────────────────────────────
        disc_str  = None
        disc_zeros = []
        if deg_x == 3 and len(coeffs_x) == 4:
            try:
                a3, a2, a1, a0 = coeffs_x
                disc = (
                    18*a3*a2*a1*a0
                    - 4*a2**3*a0
                    + a2**2*a1**2
                    - 4*a3*a1**3
                    - 27*a3**2*a0**2
                )
                disc_f    = factor(disc)
                disc_str  = str(disc_f)
                try:
                    zeros = solve(disc_f, n_sym)
                    disc_zeros = [str(z) for z in zeros[:4]]
                except Exception:
                    pass
            except Exception:
                pass

        # ── Family detection & solution stats ──────────────────────────────
        family    = _insight_detect_family(expr, n_sym, x_sym)
        sol_stats = _insight_sol_stats(raw_sols)

        sections = [
            _insight_curve_section(deg_x, torsion_roots, disc_str, disc_zeros, family),
            _insight_strategy_section(deg_x, family, n_min, n_max),
            _insight_solutions_section(sol_stats, deg_x),
            _insight_deeper_section(deg_x, family),
        ]
        return jsonify({"ok": True, "sections": sections})

    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500




@app.route("/api/chat", methods=["POST"])
def api_chat():
    """
    Stream a GPT-4o response back to the client as SSE.

    Request body (JSON):
        {
          "messages": [{"role": "user"|"assistant", "content": "..."}],
          "context":  "optional solver context string"
        }
    """
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return {"ok": False, "error": "OPENAI_API_KEY not configured on the server."}, 500

    data     = request.get_json(silent=True) or {}
    messages = data.get("messages", [])
    context  = data.get("context", "").strip()

    # Validate messages list
    if not isinstance(messages, list) or len(messages) == 0:
        return {"ok": False, "error": "No messages provided."}, 400
    for m in messages:
        if not isinstance(m, dict) or m.get("role") not in ("user", "assistant") or not isinstance(m.get("content"), str):
            return {"ok": False, "error": "Invalid message format."}, 400
        # Truncate each message to prevent abuse
        m["content"] = m["content"][:4000]

    system_content = (
        "You are an expert AI assistant specialising in elliptic curves, number theory, "
        "and algebraic geometry. You help users of the Elliptic Curve Solver web app — "
        "a tool that finds integer and rational points on parametric elliptic curves of "
        "the form y² = f(n, x).\n\n"
        "Your capabilities include:\n"
        "• Explaining elliptic curve theory (Weierstrass form, group law, torsion, rank, BSD conjecture)\n"
        "• Interpreting solutions: what integer points mean geometrically and arithmetically\n"
        "• Suggesting search parameters or example curves\n"
        "• Explaining the chord-tangent addition law and point doubling\n"
        "• Discussing modular forms, L-functions, and related topics\n"
        "• Helping debug unexpected results\n\n"
        "Be concise, precise, and use mathematical notation where helpful (e.g. y² = x³ − x). "
        "When giving equations, prefer plain text notation the user can paste into the solver "
        "(Python syntax: ** for powers, * for multiplication)."
    )
    if context:
        system_content += f"\n\nCurrent solver context:\n{context[:800]}"

    full_messages = [{"role": "system", "content": system_content}] + messages

    def generate():
        try:
            from openai import OpenAI  # noqa: PLC0415
            client = OpenAI(api_key=api_key)
            stream = client.chat.completions.create(
                model="gpt-4o",
                messages=full_messages,
                max_tokens=1024,
                temperature=0.5,
                stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta.content if chunk.choices else None
                if delta:
                    payload = json.dumps({"type": "delta", "content": delta})
                    yield f"data: {payload}\n\n"
            yield "data: " + json.dumps({"type": "done"}) + "\n\n"
        except Exception as exc:  # noqa: BLE001
            yield "data: " + json.dumps({"type": "error", "message": str(exc)}) + "\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── Equation Explorer ─────────────────────────────────────────────────────────

def _explore_eval_fast(expr, vars_list):
    """Return a fast Python callable for the expression, falling back to subs."""
    from sympy import lambdify
    try:
        fn = lambdify(vars_list, expr, modules=[])
        fn(*([0] * len(vars_list)))  # smoke test
        return fn
    except Exception:
        return lambda *vals: float(expr.subs(list(zip(vars_list, vals))))


def _explore_profile_section(expr, var_syms):
    from sympy import total_degree, expand, Symbol, simplify
    cards = []
    vars_list = list(var_syms.values())
    var_names = list(var_syms.keys())
    n = len(vars_list)

    try:
        deg = total_degree(expand(expr), *vars_list)
    except Exception:
        deg = -1

    # Homogeneity check
    is_hom = False
    try:
        t = Symbol("_t_", positive=True)
        scaled = expr.subs([(v, t * v) for v in vars_list])
        if deg > 0:
            is_hom = bool(simplify(scaled - t**deg * expr) == 0)
    except Exception:
        pass

    hom = "Homogeneous" if is_hom else "Inhomogeneous"

    # Curve/surface/variety classification
    if n == 1:
        cls = "Single-variable — polynomial equation, finitely many roots"
    elif n == 2 and deg == 1:
        cls = "Linear Diophantine — solutions form an arithmetic progression"
    elif n == 2 and deg == 2:
        cls = "Conic — genus 0; parametrised by ℚ whenever one rational point exists"
    elif n == 2 and deg == 3:
        cls = "Elliptic curve — genus 1; E(ℚ) ≅ ℤʳ ⊕ T (Mordell-Weil)"
    elif n == 2 and deg >= 4:
        g = (deg - 1) * (deg - 2) // 2
        cls = f"Plane curve, genus ≤ {g}; finitely many rational points if genus ≥ 2 (Faltings)"
    elif n == 3 and deg == 2:
        cls = "Quadric surface — genus 0; rational points dense if any exist (Hasse-Minkowski)"
    elif n == 3 and deg == 3:
        cls = "Cubic surface — 27 lines over ℂ; conjecturally dense rational points"
    elif n == 3 and deg == 4:
        cls = "Quartic surface — K3 if smooth; rational points potentially dense"
    elif n == 4 and deg == 3:
        cls = "Cubic threefold — rational points expected dense (n=4 > 2d=6? No, 4<6 — borderline)"
    else:
        cls = f"{n}-variable degree-{deg} Diophantine equation"

    cards.append({
        "headline": f"{n} var{'s' if n != 1 else ''}, degree {deg} — {cls[:70]}{'…' if len(cls) > 70 else ''}",
        "body": (
            f"Variables: {', '.join(var_names)}. "
            f"Total degree: {deg}. {hom}. "
            f"{cls}."
        ),
        "intuition": (
            "Degree d and variable count n are the two fundamental invariants. "
            "They determine the geometric genus, which theorems apply, and how many solutions to expect. "
            "Homogeneity means scaling all variables multiplies the LHS by λᵈ — "
            "solutions come in scaling families, so search for primitive (gcd=1) solutions."
        ),
    })

    # Circle method heuristic (n ≥ 3, deg ≥ 2)
    if n >= 3 and deg >= 2:
        if n > 2 * deg:
            cm = (f"n={n} > 2d={2*deg}: major arcs dominate. "
                  f"Expect ~H^{n - deg} solutions with max|x_i| ≤ H.")
            cm_proved = "Proved asymptotic (Birch 1962 for non-singular)."
        elif n == 2 * deg:
            cm = (f"n={n} = 2d={2*deg}: borderline. "
                  f"Expect ~H^{n - deg}·(log H)^c solutions.")
            cm_proved = "Logarithmic corrections; more delicate analysis needed."
        else:
            cm = (f"n={n} < 2d={2*deg}: major arcs do NOT dominate. "
                  "Solutions may be sparse even without local obstructions.")
            cm_proved = "Circle method insufficient; geometry-of-numbers or descent required."

        cards.append({
            "headline": "Hardy-Littlewood circle method prediction",
            "body": f"{cm} {cm_proved}",
            "formula": (
                f"N(H) ~ C · H^{n - deg}  (conjectured for n ≤ 2d; proved for n > 2d)\n"
                f"where C = singular series × singular integral > 0 iff no local obstruction"
            ),
            "intuition": (
                "The circle method writes the count as an integral on ℝ/ℤ. "
                "Near rational p/q with small denominator (major arcs), contributions are large and explicit. "
                "Away from rationals (minor arcs), they cancel. "
                "When n > 2d, major arcs win by a power saving — giving a proved asymptotic."
            ),
        })

    return {"id": "profile", "title": "Equation Profile", "icon": "≡", "cards": cards}


def _explore_obstruction_section(expr, var_syms, param_name):
    from itertools import product as iprod

    vars_list = list(var_syms.values())
    var_names = list(var_syms.keys())
    n = len(vars_list)

    # Performance guard: skip large moduli for many variables
    def _moduli_for(nv):
        if nv <= 3:
            return [3, 4, 7, 8, 9]
        if nv == 4:
            return [3, 4, 7, 9]
        return [3, 4, 7]

    moduli = _moduli_for(n)
    fn = _explore_eval_fast(expr, vars_list)

    obs_found = []
    for m in moduli:
        if param_name and param_name in var_names:
            param_idx = var_names.index(param_name)
            attainable = set()
            try:
                for vals in iprod(range(m), repeat=n):
                    try:
                        if round(fn(*vals)) % m == 0:
                            attainable.add(vals[param_idx])
                    except Exception:
                        pass
            except Exception:
                continue
            blocked = sorted(r for r in range(m) if r not in attainable)
            if blocked:
                obs_found.append({
                    "mod": m, "type": "param",
                    "param": param_name,
                    "blocked": blocked,
                    "attainable": sorted(attainable),
                })
        else:
            has_sol = False
            try:
                for vals in iprod(range(m), repeat=n):
                    try:
                        if round(fn(*vals)) % m == 0:
                            has_sol = True
                            break
                    except Exception:
                        pass
            except Exception:
                continue
            if not has_sol:
                obs_found.append({"mod": m, "type": "global"})
                break  # one global obstruction is a complete proof

    cards = []
    if not obs_found:
        cards.append({
            "headline": "No congruence obstructions found (mod 3, 4, 7, 8, 9)",
            "body": (
                "The equation has solutions modulo every tested modulus. "
                "No elementary congruence argument prevents integer solutions. "
                "Higher p-adic or real obstructions may still exist."
            ),
            "formula": "∀ p ∈ {3,4,7,8,9}:  ∃ solution mod p",
            "intuition": (
                "Passing all local tests is necessary (but NOT sufficient) for a global solution. "
                "For quadrics: sufficiency holds (Hasse-Minkowski theorem). "
                "For higher degree: the Brauer-Manin obstruction can block global solutions "
                "even when every local test passes — a phenomenon first found by Selmer (1951)."
            ),
        })
    else:
        for obs in obs_found:
            if obs["type"] == "global":
                cards.append({
                    "headline": f"Global obstruction mod {obs['mod']}: provably NO integer solutions exist",
                    "body": (
                        f"The equation has no solutions in (ℤ/{obs['mod']}ℤ)ⁿ. "
                        "Every integer solution would reduce to a modular solution by taking remainders. "
                        f"Therefore, no integer solution can exist — this is a complete, unconditional proof."
                    ),
                    "formula": f"f(x₁,...,xₙ) ≢ 0 (mod {obs['mod']})  ⟹  no integer solution exists",
                    "intuition": (
                        "This is the cheapest impossibility proof in all of mathematics: "
                        "a finite computation over {0,...," + str(obs['mod'] - 1) + "}ⁿ. "
                        "Once found, no further work is needed — no solutions of any kind exist."
                    ),
                })
            else:
                blocked_str = ", ".join(str(b) for b in obs["blocked"])
                attain_str = ", ".join(str(a) for a in obs["attainable"])
                cards.append({
                    "headline": (
                        f"Obstruction mod {obs['mod']}: "
                        f"{obs['param']} ≡ {{{blocked_str}}} (mod {obs['mod']}) → no solution"
                    ),
                    "body": (
                        f"When {obs['param']} ≡ {{{blocked_str}}} (mod {obs['mod']}), "
                        f"there is provably no integer solution. "
                        f"Values of {obs['param']} mod {obs['mod']} that DO have solutions: "
                        f"{{{attain_str}}}."
                    ),
                    "formula": (
                        f"{obs['param']} ≡ {{{blocked_str}}} (mod {obs['mod']})"
                        f"  ⟹  no integer (x₁,...,xₙ) satisfies the equation"
                    ),
                    "intuition": (
                        "This is a p-adic obstruction: the equation has no solution in ℤ_"
                        + str(obs['mod'])
                        + " (the " + str(obs['mod']) + "-adic integers). "
                        "It is unconditional — no computation or search can produce a counterexample."
                    ),
                })

    return {"id": "obstruction", "title": "Congruence Obstructions", "icon": "≢", "cards": cards}


def _explore_search_section(expr, var_syms, param_name, bound):
    from itertools import product as iprod

    vars_list = list(var_syms.values())
    var_names = list(var_syms.keys())
    n = len(vars_list)

    # Scale bound to keep iterations manageable
    MAX_ITERS = 2_000_000
    eff = min(bound, max(3, int(MAX_ITERS ** (1.0 / n)) // 2))
    total = (2 * eff + 1) ** n

    fn = _explore_eval_fast(expr, vars_list)
    solutions = []
    param_groups = {}  # param_val → [sol, ...]
    param_idx = var_names.index(param_name) if param_name and param_name in var_names else None

    try:
        rng = range(-eff, eff + 1)
        for vals in iprod(rng, repeat=n):
            try:
                v = fn(*vals)
                if isinstance(v, float):
                    if abs(v) > 0.5:
                        continue
                elif int(round(v)) != 0:
                    continue
            except Exception:
                continue
            sol = dict(zip(var_names, vals))
            solutions.append(sol)
            if param_idx is not None:
                pv = vals[param_idx]
                param_groups.setdefault(pv, []).append(sol)
            if len(solutions) >= 120:
                break
    except Exception:
        pass

    cards = []
    if not solutions:
        cards.append({
            "headline": f"No solutions in [−{eff}, {eff}]^{n}  ({total:,} combinations checked)",
            "body": (
                f"Searched all {total:,} combinations of {n} variables in [−{eff}, {eff}]. "
                "Possible reasons: "
                "(1) A congruence obstruction provably eliminates all solutions. "
                "(2) Solutions exist but outside the searched range — "
                "e.g. the smallest solution of x³+y³+z³=42 has |x|,|y|,|z| up to ~10¹⁴. "
                "(3) The equation has no integer solutions."
            ),
            "intuition": (
                "Negative search results are informative but not conclusive. "
                "A congruence obstruction (see above) is a complete proof of impossibility. "
                "Absence of small solutions is only evidence for rank 0 or large generator height."
            ),
        })
    else:
        if param_idx is not None and param_groups:
            pvals = sorted(param_groups.keys())
            sample_str = ", ".join(str(v) for v in pvals[:12])
            extra = f" (+{len(pvals) - 12} more)" if len(pvals) > 12 else ""
            cards.append({
                "headline": (
                    f"{len(solutions)} solution{'s' if len(solutions) != 1 else ''} found — "
                    f"{len(pvals)} value{'s' if len(pvals) != 1 else ''} of {param_name} "
                    f"in [−{eff}, {eff}]"
                ),
                "body": (
                    f"Search range: [−{eff}, {eff}] per variable ({total:,} combinations). "
                    f"{param_name} values with solutions: {{{sample_str}{extra}}}."
                ),
                "intuition": (
                    "These are the small solutions. "
                    "Larger solutions exist if the curve has rank ≥ 1 or the family has infinite structure. "
                    "Check the obstruction section to see which parameter values are provably excluded."
                ),
            })
            # Per-param breakdown (first 8 parameter values)
            for pv in pvals[:8]:
                sols = param_groups[pv][:4]
                free_vars = [k for k in var_names if k != param_name]
                sols_str = "; ".join(
                    "(" + ", ".join(f"{k}={s[k]}" for k in free_vars) + ")"
                    for s in sols
                )
                more = f" (+{len(param_groups[pv]) - 4} more)" if len(param_groups[pv]) > 4 else ""
                cards.append({
                    "headline": f"{param_name} = {pv}:  {sols_str}{more}",
                    "body": (
                        f"For {param_name} = {pv}, found {len(param_groups[pv])} solution(s): "
                        f"{sols_str}."
                    ),
                })
        else:
            rows = [
                "(" + ", ".join(f"{k}={v}" for k, v in s.items()) + ")"
                for s in solutions[:16]
            ]
            extra = f" (+{len(solutions) - 16} more)" if len(solutions) > 16 else ""
            cards.append({
                "headline": f"{len(solutions)} solution{'s' if len(solutions) != 1 else ''} in [−{eff}, {eff}]^{n}",
                "body": f"Found: {'; '.join(rows)}{extra}.",
                "intuition": "These are the smallest integer solutions by coordinate magnitude.",
            })

    return {"id": "search", "title": "Small Solutions (Experimental)", "icon": "∃", "cards": cards}


def _explore_structure_section(expr, var_syms, param_name):
    from sympy import Poly, expand, total_degree, Symbol, simplify

    vars_list = list(var_syms.values())
    var_names = list(var_syms.keys())
    n = len(vars_list)
    cards = []

    try:
        expanded = expand(expr)
        deg = total_degree(expanded, *vars_list)
        poly = Poly(expanded, *vars_list)
        monoms = poly.monoms()   # list of tuples of exponents
        coeffs = [int(c) for c in poly.coeffs()]
        monom_dict = dict(zip(monoms, coeffs))
    except Exception:
        return {"id": "structure", "title": "Mathematical Structure", "icon": "≅", "cards": cards}

    # ── Sum-of-powers detection ──────────────────────────────────────────
    pure_power_monoms = [
        tuple(deg if i == j else 0 for i in range(n))
        for j in range(n)
    ]
    all_pure = all(
        m == tuple(0 for _ in range(n)) or m in pure_power_monoms
        for m in monoms
    )

    if all_pure and deg >= 2:
        active_vars = [var_names[j] for j, pp in enumerate(pure_power_monoms) if pp in monom_dict]
        signs = [monom_dict[pp] for pp in pure_power_monoms if pp in monom_dict]
        const = monom_dict.get(tuple(0 for _ in range(n)), 0)

        if n == 3 and deg == 3 and param_name:
            # Check it looks like x³+y³+z³=k
            free_vars_active = [v for v in var_names if v != param_name]
            if len(free_vars_active) >= 2:
                cards.append({
                    "headline": "Sum of Three Cubes: x³ + y³ + z³ = k",
                    "body": (
                        "One of the most studied unsolved problems in number theory. "
                        "The only proven obstruction: k ≡ 4 or 5 (mod 9) → no solution exists. "
                        "All other k are expected to have solutions (conjectured but unproved). "
                        "Recent breakthroughs: k=33 (Booker 2019), k=42 (Booker-Sutherland 2019), "
                        "k=114 and k=390 (2024). The smallest unsolved eligible k < 1000 is k=114 "
                        "(now solved) and k=579."
                    ),
                    "formula": (
                        "k ≡ 4 or 5 (mod 9)  ⟹  no solution\n"
                        "Conjectured: all other k have infinitely many solutions\n"
                        "Expected density: #solutions with |x|,|y|,|z| ≤ H ~ C · log H"
                    ),
                    "intuition": (
                        "The mod 9 obstruction is the ONLY known obstruction. "
                        "The extremely slow logarithmic growth means solutions for large k can be "
                        "astronomically large — yet computers now search up to |x| ~ 10²¹ using "
                        "Elkies' algorithm and massive parallelism."
                    ),
                })

        elif deg == 2 and all(s > 0 for s in signs):
            # Sum of squares
            k = len(active_vars)
            if k == 2 and not param_name:
                cards.append({
                    "headline": "Sum of two squares: x² + y² = n",
                    "body": (
                        "An integer n is expressible as x²+y² if and only if "
                        "every prime p ≡ 3 (mod 4) appears to an even power in the factorisation of n. "
                        "The number of representations is r₂(n) = 4(d₁(n) − d₃(n)), "
                        "where d₁ counts divisors ≡ 1 (mod 4) and d₃ counts those ≡ 3 (mod 4)."
                    ),
                    "formula": "r₂(n) = 4·(#{d|n : d≡1 mod 4} − #{d|n : d≡3 mod 4})",
                    "intuition": (
                        "The Gaussian integers ℤ[i] explain this completely: "
                        "n = x²+y² = |x+iy|² means n factors in ℤ[i]. "
                        "Primes p ≡ 1 (mod 4) split in ℤ[i]; primes p ≡ 3 (mod 4) remain prime."
                    ),
                })
            elif k >= 3 and const != 0:
                cards.append({
                    "headline": f"Waring's problem for squares — {k} summands",
                    "body": (
                        f"Lagrange (1770): every positive integer is a sum of 4 squares (W(2) = 4). "
                        f"Legendre: 3 squares suffice except for 4^a(8b+7). "
                        f"For {k} ≥ 4 squares, every positive integer is representable."
                    ),
                    "formula": "W(2) = 4:  ∀n > 0, n = x₁² + x₂² + x₃² + x₄²",
                    "intuition": "Lagrange's four-square theorem is proved via the quaternion identity: (a²+b²+c²+d²)(e²+f²+g²+h²) = sum of 4 squares.",
                })

        elif deg == 3 and n == 3 and not param_name:
            # All ±x³: check for Fermat-like structure
            if all(abs(c) == 1 for c in signs) and len(active_vars) == 3:
                pos = sum(1 for s in signs if s > 0)
                neg = sum(1 for s in signs if s < 0)
                if pos == 2 and neg == 1:
                    cards.append({
                        "headline": "Fermat's Last Theorem (n=3): x³ + y³ = z³",
                        "body": (
                            "Fermat's Last Theorem for exponent 3: no positive integer solution. "
                            "First proved by Euler (1770), using the ring ℤ[ω] where ω = e^(2πi/3). "
                            "Euler's proof had a gap (unique factorisation in ℤ[ω]), "
                            "later completed by Gauss. "
                            "The general case (all n ≥ 3) was proved by Wiles (1995)."
                        ),
                        "formula": "x³ + y³ = z³  has no solution in ℤ>0  (Euler/Wiles)",
                        "intuition": (
                            "The key insight for n=3: work in ℤ[ω] which has unique factorisation. "
                            "An infinite descent argument then shows the equation is impossible. "
                            "For n ≥ 5, Wiles used modular forms (a completely different approach)."
                        ),
                    })

    # ── Pell / quadratic detection ───────────────────────────────────────
    if n == 2 and deg == 2:
        x_s, y_s = vars_list
        try:
            p = Poly(expanded, x_s, y_s)
            c_xx = int(p.nth(2, 0))
            c_yy = int(p.nth(0, 2))
            c_xy = int(p.nth(1, 1))
            c_0 = int(p.nth(0, 0))

            if c_xy == 0 and c_xx == 1 and c_yy < 0:
                D = -c_yy
                N = -c_0
                if N == 1:
                    cards.append({
                        "headline": f"Pell equation: x² − {D}y² = 1",
                        "body": (
                            f"The Pell equation x² − {D}y² = 1 has infinitely many solutions "
                            f"(since {D} is {'not ' if int(D**0.5)**2 != D else ''}a perfect square). "
                            "The fundamental solution (x₁,y₁) generates all others via: "
                            f"xₙ + yₙ√{D} = (x₁ + y₁√{D})ⁿ for n ∈ ℤ."
                        ),
                        "formula": f"All solutions: xₙ + yₙ√{D} = (x₁ + y₁√{D})ⁿ",
                        "intuition": (
                            f"The fundamental solution comes from the continued fraction of √{D}. "
                            "Pell equations connect to units in real quadratic number fields ℚ(√D): "
                            "solutions correspond to units of norm 1 in ℤ[√D]."
                        ),
                    })
                else:
                    cards.append({
                        "headline": f"Generalized Pell: x² − {D}y² = {N}",
                        "body": (
                            f"Unlike the standard Pell equation (N=1), x² − {D}y² = {N} "
                            "may have zero, finitely many, or infinitely many solutions. "
                            "Solutions split into finitely many equivalence classes, "
                            "each generating an infinite family via the Pell group action."
                        ),
                        "intuition": "Solve via LLL/continued fractions, then apply the Pell group action to generate all solutions from finitely many base solutions.",
                    })
        except Exception:
            pass

    # ── Mordell / Weierstrass detection ──────────────────────────────────
    if n == 2 and deg == 3:
        for a_s, b_s in [(vars_list[0], vars_list[1]), (vars_list[1], vars_list[0])]:
            try:
                pb = Poly(expanded, b_s)
                if pb.degree() == 2:
                    c2 = int(pb.nth(2))
                    c1 = int(pb.nth(1))
                    c0 = pb.nth(0)
                    if c1 == 0 and abs(c2) == 1:
                        pa = Poly(expand(-c0), a_s)
                        if pa.degree() == 3:
                            cards.append({
                                "headline": "Elliptic curve in Weierstrass form",
                                "body": (
                                    "This is an elliptic curve y² = f(x) (or x² = f(y)). "
                                    "The rational points form a finitely generated abelian group E(ℚ) ≅ ℤʳ ⊕ T. "
                                    "The rank r ∈ {0,1,2,...} determines whether there are finitely (r=0) or "
                                    "infinitely many (r≥1) rational points."
                                ),
                                "formula": "E(ℚ) ≅ ℤʳ ⊕ T,   T ∈ {15 possibilities} (Mazur 1977)",
                                "intuition": (
                                    "Use the Solver with the Mathematician's Lens for deep analysis. "
                                    "The LMFDB (lmfdb.org) has the complete arithmetic profile "
                                    "of every elliptic curve over ℚ with small conductor."
                                ),
                            })
                            break
            except Exception:
                pass

    # ── Pythagorean triple detection ──────────────────────────────────────
    if n == 3 and deg == 2:
        try:
            p = Poly(expanded, *vars_list)
            ms = p.monoms()
            pure2 = [tuple(2 if i == j else 0 for i in range(3)) for j in range(3)]
            if all(m in pure2 or m == (0, 0, 0) for m in ms):
                cs = [int(p.nth(*pp)) for pp in pure2]
                pos_cs = [c for c in cs if c > 0]
                neg_cs = [c for c in cs if c < 0]
                if len(pos_cs) == 2 and len(neg_cs) == 1 and all(abs(c) == 1 for c in cs if c != 0):
                    cards.append({
                        "headline": "Pythagorean triple equation: x² + y² = z²",
                        "body": (
                            "Complete parametrisation: all primitive Pythagorean triples are "
                            "(m²−n², 2mn, m²+n²) for gcd(m,n)=1, m>n>0, m−n odd. "
                            "Infinitely many solutions exist. "
                            "The rational points on the unit circle x²+y²=z² are dense."
                        ),
                        "formula": "(x,y,z) = k·(m²−n², 2mn, m²+n²),  m>n>0, gcd(m,n)=1, m−n odd",
                        "intuition": "Stereographic projection from (−1,0,0) maps the unit circle to the rational line ℚ, giving the complete parametrisation. This is the simplest instance of the 'rational points on a conic via a known point' method.",
                    })
        except Exception:
            pass

    # ── Markov equation ───────────────────────────────────────────────────
    try:
        p = Poly(expanded, *vars_list)
        if n == 3 and deg == 3:
            # Check for x²+y²+z²-3xyz=0 pattern
            ps = {m: int(c) for m, c in zip(p.monoms(), p.coeffs())}
            pure2 = {tuple(2 if i == j else 0 for i in range(3)) for j in range(3)}
            cubic_xyz = tuple(sorted([(1, 0, 2), (0, 1, 2), (2, 1, 0), (2, 0, 1), (0, 2, 1), (1, 2, 0)]))
            # x²y is (2,1,0) etc. 3xyz is coefficient -3 on (1,1,1)
            if frozenset(ps.keys()) <= {(2, 0, 0), (0, 2, 0), (0, 0, 2), (1, 1, 1)}:
                sq_coeffs = {ps.get((2, 0, 0), 0), ps.get((0, 2, 0), 0), ps.get((0, 0, 2), 0)}
                xyz_c = ps.get((1, 1, 1), 0)
                if sq_coeffs == {1} and xyz_c == -3:
                    cards.append({
                        "headline": "Markov equation: x² + y² + z² = 3xyz",
                        "body": (
                            "The Markov equation generates the Markov tree: "
                            "starting from (1,1,1) and applying (x,y,z)→(3yz−x, y, z), "
                            "every Markov triple is reachable. "
                            "The Markov uniqueness conjecture (Frobenius 1913, still open!) "
                            "asks: is each Markov number the largest element of a unique triple?"
                        ),
                        "formula": "Markov tree: (x,y,z) → (3yz−x, y, z) generates infinitely many solutions",
                        "intuition": (
                            "Markov triples are related to Farey sequences, "
                            "hyperbolic geometry, and the theory of quadratic forms. "
                            "The uniqueness conjecture has been verified up to Markov numbers ~10¹⁸⁰ "
                            "but remains one of the most stubborn open problems in number theory."
                        ),
                    })
    except Exception:
        pass

    # ── Homogeneity note ──────────────────────────────────────────────────
    try:
        t = Symbol("_t_")
        scaled = expr.subs([(v, t * v) for v in vars_list])
        if deg > 0 and bool(simplify(scaled - t**deg * expr) == 0):
            cards.append({
                "headline": "Homogeneous equation — projective symmetry",
                "body": (
                    "f(λx₁,...,λxₙ) = λᵈ f(x₁,...,xₙ). "
                    "Scaling all variables by λ multiplies the LHS by λᵈ. "
                    "If (x₁,...,xₙ) is a solution, so is (λx₁,...,λxₙ) for any λ ∈ ℤ. "
                    "The natural domain is projective space ℙⁿ⁻¹(ℚ): "
                    "look for primitive integer solutions (gcd(x₁,...,xₙ)=1)."
                ),
                "formula": "f(λx₁,...,λxₙ) = λᵈ · f(x₁,...,xₙ)   ⟹  solutions closed under scaling",
                "intuition": "Projective solutions over ℚ correspond to primitive integer points up to sign. This reduces the search space and makes the problem purely projective geometry.",
            })
    except Exception:
        pass

    if not cards:
        cards.append({
            "headline": "Polynomial Diophantine equation",
            "body": (
                "This is a polynomial equation in integer unknowns. "
                "Structure depends on degree, variable count, and coefficient patterns. "
                "For degree ≤ 2: classical results (conics, quadrics) are complete. "
                "For degree ≥ 3 with ≥ 2 variables: each family requires its own toolkit."
            ),
            "intuition": "The 'right' framework is determined by genus (for curves) or Kodaira dimension (for surfaces). Both require algebraic geometry to compute rigorously.",
        })

    return {"id": "structure", "title": "Mathematical Structure", "icon": "≅", "cards": cards}


def _explore_literature_section(expr, var_syms, param_name):
    from sympy import total_degree, expand

    vars_list = list(var_syms.values())
    var_names = list(var_syms.keys())
    n = len(vars_list)
    cards = []

    try:
        deg = total_degree(expand(expr), *vars_list)
    except Exception:
        deg = -1

    # Hasse principle + Brauer-Manin
    cards.append({
        "headline": "The Hasse principle and when it fails",
        "body": (
            "The Hasse principle: does local solvability (real + p-adic for all p) imply global? "
            "For quadrics: YES (Hasse-Minkowski, 1923). "
            "For cubics: NOT IN GENERAL. Selmer's cubic 3x³+4y³+5z³=0 has local solutions everywhere "
            "but no rational point (1951). "
            "The Brauer-Manin obstruction (Manin 1970) explains most known failures: "
            "the Brauer group Br(X) provides an obstruction map from local adelic points to ℚ/ℤ."
        ),
        "formula": "X(ℚ) ⊆ X(𝔸ℚ)^{Br}  ⊆  X(ℚp) × X(ℝ)  for all p",
        "intuition": (
            "Brauer-Manin is the most powerful known obstruction beyond congruences. "
            "For smooth cubic surfaces, it is conjectured to be the ONLY obstruction "
            "(weak approximation). For higher degree, counterexamples to Brauer-Manin "
            "being the only obstruction are known (Skorobogatov 1999)."
        ),
    })

    if n >= 3 and deg == 3:
        cards.append({
            "headline": "Exponential sums and the circle method (Hardy-Littlewood-Vinogradov)",
            "body": (
                "The circle method writes the number of solutions as an integral over ℝ/ℤ "
                "of exponential sums e^{2πif(x)/q}. "
                "For the sum-of-cubes equation with n ≥ 9 terms, Waring's problem is fully solved: "
                "every integer is a sum of 9 cubes (proved) and 7 cubes suffice for all but finitely many n. "
                "For n=3 cubes, the circle method gives only partial results."
            ),
            "intuition": "The exponential sum S(α) = Σ_x e^{2πiαx³} is the key object. Its L²-norm equals the count of solutions. Major arcs (|α − a/q| small) give the main term; minor arcs are bounded by Weyl estimates.",
        })

    if n == 2 and deg >= 3:
        cards.append({
            "headline": "Thue equations (homogeneous, 2 variables, deg ≥ 3)",
            "body": (
                "If the equation is homogeneous in x,y of degree ≥ 3 (Thue equation F(x,y)=c): "
                "Thue (1909) proved finitely many solutions. "
                "Baker's method (1966) via linear forms in logarithms gives effective bounds. "
                "Algorithms exist (Bilu-Hanrot, Tzanakis-de Weger) to find ALL solutions computationally."
            ),
            "formula": "F(x,y) = c,  F irred., deg ≥ 3  ⟹  finitely many (x,y) ∈ ℤ²  (Thue 1909)",
            "intuition": (
                "Thue's finiteness is proved via Roth's theorem: algebraic numbers can't be "
                "well-approximated by rationals (|α − p/q| > 1/q^{2+ε}). "
                "If the Thue equation had many solutions, it would give too-good rational approximations."
            ),
        })

    cards.append({
        "headline": "Baker's theorem: linear forms in logarithms",
        "body": (
            "Baker (1966-1967): for algebraic numbers α₁,...,αₙ and integers b₁,...,bₙ, "
            "|b₁log α₁ + ... + bₙ log αₙ| > exp(−C(log B)^{n+1}) "
            "where B = max|bᵢ|. "
            "This gives effective height bounds for integer points on elliptic curves (Siegel's theorem), "
            "Thue equations, and many other Diophantine problems. "
            "Baker received the Fields Medal (1970) for this work."
        ),
        "formula": "|Λ| = |b₁log α₁ + ··· + bₙlog αₙ| > exp(−C · (log B)^{n+1})",
        "intuition": (
            "Before Baker, finiteness results were non-effective (no computable bound). "
            "Baker's theorem made them effective: for the first time, one could compute "
            "an explicit bound H such that all integer solutions satisfy |x|,|y| ≤ H. "
            "LLL reduction then cuts this astronomical bound to a practical search range."
        ),
    })

    cards.append({
        "headline": "Recommended tools and databases",
        "body": (
            "• LMFDB (lmfdb.org) — curves, L-functions, modular forms, number fields. "
            "• SageMath — free CAS with Diophantine solvers, descent, LMFDB interface. "
            "• Magma — most comprehensive descent algorithms (commercial). "
            "• PARI/GP — fast number theory, excellent for Diophantine experimentation. "
            "• References: Cohen 'Number Theory' I-II; Silverman 'Arithmetic of Elliptic Curves'; "
            "Smart 'The Algorithmic Resolution of Diophantine Equations'."
        ),
        "intuition": "The LMFDB has over 3 million elliptic curves catalogued. Every elliptic curve over ℚ is modular (Wiles 1995) — the LMFDB is the meeting point of arithmetic geometry and analytic number theory.",
    })

    return {"id": "literature", "title": "Theory & Literature", "icon": "∞", "cards": cards}


# ── Equation Explorer endpoint ────────────────────────────────────────────────

@app.route("/api/explore", methods=["POST"])
def api_explore():
    """
    Explore any Diophantine equation: congruence obstructions, small solutions,
    structural classification, and theory connections — all computed by SymPy.

    Request body (JSON):
        {
          "equation": "x**3 + y**3 + z**3 - k"  or  "x**3 + y**3 + z**3 = k",
          "param":    "k",          # optional: which variable is the RHS parameter
          "bound":    12            # optional: search bound per variable [3..20]
        }
    """
    import re
    from sympy import symbols, sympify, expand

    data = request.get_json(silent=True) or {}
    eq_str = data.get("equation", "").strip()
    param_name = data.get("param", "").strip()
    bound = max(3, min(int(data.get("bound", 12)), 500))

    if not eq_str:
        return jsonify({"ok": False, "error": "No equation provided."}), 400

    try:
        # Normalise "LHS = RHS" → "LHS - (RHS)"
        if "=" in eq_str:
            lhs, rhs = eq_str.split("=", 1)
            eq_expr_str = f"({lhs.strip()}) - ({rhs.strip()})"
        else:
            eq_expr_str = eq_str

        # Auto-detect single-letter variable names
        raw_names = sorted(set(re.findall(r"\b([a-zA-Z])\b", eq_expr_str)))
        _SKIP = {"e", "E"}  # avoid confusing with Euler's number
        raw_names = [n for n in raw_names if n not in _SKIP]

        if not raw_names:
            return jsonify({"ok": False, "error": "No variables detected. Use single-letter names (x, y, z, k, …)."}), 400
        if len(raw_names) > 6:
            return jsonify({"ok": False, "error": f"Too many variables ({len(raw_names)}). Maximum 6."}), 400

        var_syms = {name: symbols(name, integer=True) for name in raw_names}

        try:
            expr = sympify(eq_expr_str, locals=var_syms)
            expr = expand(expr)
        except Exception as exc:
            return jsonify({"ok": False, "error": f"Could not parse equation: {exc}"}), 400

        if param_name and param_name not in var_syms:
            param_name = ""

        sections = [
            _explore_profile_section(expr, var_syms),
            _explore_obstruction_section(expr, var_syms, param_name),
            _explore_search_section(expr, var_syms, param_name, bound),
            _explore_structure_section(expr, var_syms, param_name),
            _explore_literature_section(expr, var_syms, param_name),
        ]

        return jsonify({
            "ok": True,
            "sections": sections,
            "vars": raw_names,
            "param": param_name,
        })

    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 500


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5001))
    app.run(debug=False, port=port, threaded=True)
