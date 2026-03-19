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
    except (ValueError, TypeError) as exc:
        def _err():
            yield f"data: {json.dumps({'type':'error','message':str(exc)})}\n\n"
        return Response(stream_with_context(_err()), mimetype="text/event-stream")

    MAX_EVALS = 20_000_000  # 20 M evaluations per request

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
            f_fast = lambdify((n_sym, x_sym), expr, modules="math")
        except Exception as exc:  # noqa: BLE001
            yield sse({"type": "error", "message": f"Cannot compile expression: {exc}"})
            return

        # ── build list of n values (integer or rational) ──────────────────────
        if n_denom == 1:
            n_pairs: list[tuple[float, str]] = [
                (float(i), str(i)) for i in range(n_min, n_max + 1)
            ]
        else:
            from fractions import Fraction  # noqa: PLC0415

            seen: set = set()
            fracs: list[Fraction] = []
            for p in range(n_min * n_denom, n_max * n_denom + 1):
                frac = Fraction(p, n_denom)  # auto-reduces
                if frac not in seen and n_min <= frac <= n_max:
                    seen.add(frac)
                    fracs.append(frac)
            fracs.sort()
            n_pairs = [(float(f), str(f)) for f in fracs]

        x_count     = x_max - x_min + 1
        n_count     = len(n_pairs)
        total_evals = n_count * x_count

        if total_evals > MAX_EVALS:
            yield sse({
                "type": "error",
                "message": (
                    f"Search space is {total_evals:,} evaluations "
                    f"(max {MAX_EVALS:,}). Please reduce the range."
                ),
            })
            return

        yield sse({"type": "start", "n_count": n_count,
                   "x_count": x_count, "total_evals": total_evals})

        solutions_found = 0
        report_step = max(1, n_count // 200)  # emit progress ≈ 200 times

        for idx, (n_float, n_disp) in enumerate(n_pairs):
            batch: list[dict] = []

            for x_val in range(x_min, x_max + 1):
                try:
                    rhs = f_fast(n_float, x_val)
                    if not math.isfinite(rhs) or rhs < -0.5:
                        continue
                    rhs_rounded = round(rhs)
                    if abs(rhs - rhs_rounded) > 1e-6:
                        continue        # not close enough to an integer
                    rhs_int = int(rhs_rounded)
                    if rhs_int < 0:
                        continue
                    y_pos = math.isqrt(rhs_int)
                    if y_pos * y_pos == rhs_int:
                        batch.append({"n": n_disp, "x": x_val, "y":  y_pos})
                        if y_pos > 0:
                            batch.append({"n": n_disp, "x": x_val, "y": -y_pos})
                        solutions_found += 1
                except (ZeroDivisionError, OverflowError, ValueError, TypeError):
                    continue

            if batch:
                yield sse({"type": "solutions", "data": batch})

            if idx % report_step == 0 or idx == n_count - 1:
                yield sse({
                    "type":      "progress",
                    "pct":       round(100 * (idx + 1) / n_count, 1),
                    "n":         n_disp,
                    "solutions": solutions_found,
                })

        yield sse({"type": "done", "total_solutions": solutions_found})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000, threaded=True)
