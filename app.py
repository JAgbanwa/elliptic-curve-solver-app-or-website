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

n_sym, x_sym = symbols("n x")

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
    """Convert a LaTeX equation (or RHS expression) to a Python-syntax expression."""
    data = request.get_json(silent=True) or {}
    latex_raw = data.get("latex", "").strip()
    if not latex_raw:
        return {"ok": False, "error": "No LaTeX provided."}

    # Strip leading  y^2 =  /  y² =  /  y^{2} =  so users can paste whole equations
    cleaned = re.sub(
        r'^\s*y\s*(?:\^\{?2\}?|²|\*\*2)\s*=\s*', '', latex_raw, flags=re.IGNORECASE
    ).strip()
    if not cleaned:
        return {"ok": False, "error": "Expression is empty after stripping y² = prefix."}

    try:
        from sympy.parsing.latex import parse_latex  # noqa: PLC0415
        sym_expr = parse_latex(cleaned)
    except ImportError:
        return {"ok": False, "error": "LaTeX parsing requires antlr4-python3-runtime==4.11 (pip install antlr4-python3-runtime==4.11)."}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"Cannot parse LaTeX: {exc}"}

    # Validate: only n and x symbols allowed
    from sympy import symbols as _syms, expand as _expand, collect as _collect  # noqa: PLC0415
    allowed = {n_sym, x_sym}
    unknown = sym_expr.free_symbols - allowed
    if unknown:
        return {"ok": False, "error": f"Unknown symbol(s) in LaTeX: {', '.join(str(s) for s in unknown)}. Only n and x are allowed."}

    # Produce a clean, human-readable Python expression: expand then collect by x
    # so coefficients are grouped by x power (x**3 + A*x**2 + B*x + C form)
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


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5001))
    app.run(debug=False, port=port, threaded=True)
