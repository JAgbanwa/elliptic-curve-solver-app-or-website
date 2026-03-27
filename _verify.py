import sys, math, importlib
import numpy as np

sys.path.insert(0, "/Users/jamalmac/elliptic-curve-solver-app-or-website")
app = importlib.import_module("app")

ok = True

def chk(label, cond, detail=""):
    global ok
    status = "PASS" if cond else "FAIL"
    if not cond:
        ok = False
    print(status + "  " + label + ("  [" + detail + "]" if detail else ""))

chk("_KEEPALIVE_SEC = 9",    getattr(app,"_KEEPALIVE_SEC",None) == 9)
chk("_SOFT_TIMEOUT = 245",   getattr(app,"_SOFT_TIMEOUT",None) == 245)
chk("_EXACT_THRESH = 9e15",  getattr(app,"_EXACT_THRESH",None) == 9_000_000_000_000_000)
chk("_SIEVE_MIN_X = 5000",   getattr(app,"_SIEVE_MIN_X",None) == 5_000)
chk("_MPMATH = True",        getattr(app,"_MPMATH",None) is True)

try:
    import mpmath
    r = mpmath.polyroots([1, 0, -4])
    ok2 = any(abs(float(ri.real) - 2) < 0.01 for ri in r)
    chk("mpmath.polyroots", ok2)
except Exception as e:
    chk("mpmath.polyroots", False, str(e))

try:
    from sympy import symbols, lambdify
    n_s, x_s = symbols("n x")
    f = lambdify((n_s, x_s), n_s + x_s**2, modules=[])
    x_arr = np.arange(-100, 101, dtype=np.int64)
    mask = app._compute_qr_sieve(f, 5, x_arr)
    passed = int(mask.sum())
    chk("QR sieve filters",  passed < len(x_arr), str(passed) + "/" + str(len(x_arr)))
except Exception as e:
    chk("QR sieve", False, str(e))

import inspect
src = inspect.getsource(app)
chk("yield _SSE_KEEPALIVE x4+", src.count("yield _SSE_KEEPALIVE") >= 4, "count=" + str(src.count("yield _SSE_KEEPALIVE")))
chk("timed_out sent x4+",       src.count('"timed_out": True') >= 4,    "count=" + str(src.count('"timed_out": True')))
chk("mpmath.polyroots in src",  "mpmath.polyroots" in src)
chk("_compute_qr_sieve called", "_compute_qr_sieve" in src)

big = 10**30
chk("math.isqrt exact on 10^60", math.isqrt(big*big) == big)

print()
print("ALL PASSED" if ok else "SOME FAILED")
sys.exit(0 if ok else 1)
