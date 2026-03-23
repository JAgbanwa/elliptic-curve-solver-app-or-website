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

import numpy as np

from flask import Flask, render_template, request, Response, stream_with_context
from sympy import symbols, sympify, lambdify, latex as sym_latex
from sympy.core.sympify import SympifyError

app = Flask(__name__)
# Disable static-file caching so browsers always fetch the latest CSS/JS
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0

n_sym, x_sym, y_sym = symbols("n x y")

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
                    "Results stream as found — click Stop any time."
                ),
            })
        # No hard limit: search always proceeds.

        yield sse({"type": "start", "n_count": n_count,
                   "x_count": x_count, "total_evals": total_evals,
                   "x_scale": x_scale})

        solutions_found = 0
        report_step = max(1, n_count // 200)  # emit progress ≈ 200 times

        n_with_solutions: list[str] = []

        # Pre-allocate fixed x arrays when not auto-scaling
        if x_scale == 0:
            x_arr = np.arange(x_min, x_max + 1, dtype=np.float64)
            x_int = np.arange(x_min, x_max + 1, dtype=np.int64)

        for idx, (n_float, n_disp) in enumerate(n_pairs):
            if skip_zero_n and n_float == 0.0:
                continue
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

            try:
                rhs_raw = f_fast(n_float, x_arr)
                rhs_arr = np.asarray(rhs_raw, dtype=np.float64)
                if rhs_arr.ndim == 0:          # expression independent of x
                    rhs_arr = np.full(len(x_arr), float(rhs_arr))
            except Exception:  # noqa: BLE001
                pass
            else:
                rhs_round = np.rint(rhs_arr)
                mask = (
                    np.isfinite(rhs_arr)
                    & (rhs_round >= 0)
                    & (np.abs(rhs_arr - rhs_round) <= 1e-6)
                )
                if np.any(mask):
                    cand_rhs = rhs_round[mask].astype(np.int64)
                    cand_x   = x_int[mask]
                    # Robust integer sqrt: round avoids floating-point under/over-estimate
                    y_cand   = np.round(
                        np.sqrt(cand_rhs.astype(np.float64))
                    ).astype(np.int64)
                    sq_mask  = y_cand * y_cand == cand_rhs
                    for j in np.where(sq_mask)[0]:
                        x_val = int(cand_x[j])
                        if skip_zero_x and x_val == 0:
                            continue
                        y_pos = int(y_cand[j])
                        batch.append({"n": n_disp, "x": x_val, "y":  y_pos})
                        if y_pos > 0:
                            batch.append({"n": n_disp, "x": x_val, "y": -y_pos})
                    solutions_found += int(np.sum(sq_mask))

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

        yield sse({"type": "done", "total_solutions": solutions_found,
                   "n_with_solutions": n_with_solutions})

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
                                  "Results stream live \u2014 click Stop any time."})

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

        # ══════════════════════════════════════════════════════════════════════
        # STRATEGY: poly_y — polynomial-root fast path (unchanged behaviour)
        # ══════════════════════════════════════════════════════════════════════
        if strategy == "poly_y":
            for idx, (n_raw_val, n_disp) in enumerate(n_raw):
                if skip_zero_n and n_raw_val == 0:
                    continue

                batch: list[dict] = []
                seen_xy: set      = set()
                n_float = float(n_raw_val)

                for x_val in range(x_min, x_max + 1):
                    if skip_zero_x and x_val == 0:
                        continue
                    x_float = float(x_val)

                    try:
                        flt_c: list[float] = []
                        for cf in coeff_fns_flt:
                            v = cf(n_float, x_float)
                            flt_c.append(
                                float(v) if np.isscalar(v)
                                else float(np.asarray(v).flat[0])
                            )
                        while len(flt_c) > 1 and flt_c[0] == 0.0:
                            flt_c.pop(0)
                        if len(flt_c) < 2:
                            continue
                        approx_roots = np.roots(flt_c)
                        y_cands: set[int] = set()
                        for r in approx_roots:
                            if abs(r.imag) < 0.5:
                                yr = r.real
                                y_cands.add(math.floor(yr))
                                y_cands.add(math.ceil(yr))
                    except Exception:  # noqa: BLE001
                        continue

                    for y_cand in y_cands:
                        key = (x_val, y_cand)
                        if key in seen_xy:
                            continue
                        try:
                            val = f_exact(n_raw_val, x_val, y_cand)
                            ok  = (abs(val) < 0.5) if isinstance(val, float) \
                                  else (val == 0)
                            if ok:
                                seen_xy.add(key)
                                batch.append({"n": n_disp, "x": str(x_val),
                                              "y": str(y_cand)})
                                solutions_found += 1
                        except Exception:  # noqa: BLE001
                            pass

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

                batch: list[dict] = []
                seen_set: set     = set()
                n_float = float(n_raw_val)

                for x_val in range(x_min, x_max + 1):
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

                batch: list[dict] = []
                n_float = float(n_raw_val)

                for x_val in range(x_min, x_max + 1):
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


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5001))
    app.run(debug=False, port=port, threaded=True)
