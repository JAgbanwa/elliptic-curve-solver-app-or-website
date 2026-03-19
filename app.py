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
        x_scale = max(0.0, float(request.args.get("x_scale", 0)))
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
            f_fast = lambdify((n_sym, x_sym), expr, modules=["numpy", "math"])
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
            batch: list[dict] = []

            # Build per-n x range when auto-scaling
            if x_scale > 0:
                half = max(10, math.ceil(x_scale * abs(n_float)))
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
    app.run(debug=True, port=5001, threaded=True)
