# Elliptic Curve & Diophantine Equation Solver

A Flask web app for finding integer solutions to polynomial Diophantine equations.
Supports the classical **y² = f(n, x)** elliptic-curve family mode **and** a
fully general **F(x, y, n) = 0** mode for arbitrary polynomial equations
like `y³ − y = x⁴ − 2x − 2`. Results stream live to the browser.  
**[Live demo →](https://elliptic-curve-solver.onrender.com)**

---

## Features

### Two solver modes

| Mode | Equation form | How y is found |
|------|--------------|---------------|
| **y² = f(n, x)** | `f(n, x)` entered as RHS only | `math.isqrt()` perfect-square check — exact, works for 30+ digit numbers |
| **General Diophantine** | Full equation `LHS = RHS` or `F = 0` | `numpy.roots()` finds all roots of the y-polynomial, then exact integer verification |

### Core capabilities

- **Arbitrary equations** — any polynomial in `x`, `y` (and optional parameter `n`)
- **LaTeX import** — paste LaTeX, auto-converted to Python syntax
- **Rational n** — set a denominator to scan fractions ½, ⅓, ⅙, …
- **Big-integer arithmetic** — n and x up to 10⁵⁰ and beyond, no float precision loss
- **5 x-scan modes** (y² = f mode):
  - Fixed range
  - Auto-scale (x range grows with |n|)
  - Smart window — center expression + half-width, exact big-integer
  - Divisor search — tests only x values that divide P(n) exactly
  - Expression range + step — scan `[f(n), g(n)]` with step `h(n)`, all exact big-int
- **Curve invariants panel** — for every n with solutions, auto-computes:
  - Short Weierstrass form `y² = x³ + Ax + B`
  - Discriminant Δ, j-invariant, c₄, c₆
  - Primes of bad reduction
  - Algebraic & analytic rank (N/A with explanation), conductor, LMFDB a-invariants
- **N Summary panel** — see all n-values with integral points at a glance
- **Live streaming** via Server-Sent Events (SSE)
- **Table grouped by n** with collapsible invariant cards
- **CSV & PDF export** — download results as a spreadsheet or print to PDF
- **Light / Dark mode** — toggle in the header; remembers your preference via localStorage
- **18 built-in examples** spanning both solver modes

---

## Quick Start (local)

```bash
# 1. Clone
git clone https://github.com/JAgbanwa/elliptic-curve-solver-app-or-website.git
cd elliptic-curve-solver-app-or-website

# 2. Install dependencies (Python 3.10+)
pip install -r requirements.txt

# 3. Run
python app.py
```

Open **http://localhost:5001**.

---

## Deploy to Render

The repo ships `Procfile` and `render.yaml` for one-click deployment:

1. Sign in to [render.com](https://render.com) with your GitHub account
2. **New +** → **Web Service** → connect this repository
3. Render reads `render.yaml` automatically — confirm and click **Create Web Service**
4. ~3 min build → live at `https://<your-service>.onrender.com`

> The free tier spins down after 15 min of inactivity (cold-start ~30 s).  
> Upgrade to Starter ($7/month) for always-on.

---

## How It Works

### y² = f(n, x) mode

| Step | Detail |
|------|--------|
| Parse | SymPy `sympify` → `lambdify(..., modules=["numpy","math"])` |
| Scan | Fixed/autoscale: vectorised NumPy over entire x range per n |
| Scan | Window/exprrange/divisor: exact Python big-integer `while` loop |
| Check | `math.isqrt(rhs)² == rhs` — exact perfect-square test |
| Invariants | Tschirnhaus substitution → short Weierstrass → Δ, j, c₄, c₆, bad primes |
| Stream | JSON SSE events: `start → solutions → curve_info → progress → done` |

### General Diophantine mode (`F(x, y, n) = 0`)

| Step | Detail |
|------|--------|
| Parse | `parse_general_eq` splits on `=`, forms `LHS − RHS`, validates symbols |
| Coefficient extraction | SymPy `Poly(F, y)` gives `[c_d(n,x), …, c_0(n,x)]` |
| Root-finding | `numpy.roots(coeffs_at_x)` → all complex roots of the y-polynomial |
| Candidate generation | Round each real root to `⌊r⌋` and `⌈r⌉` |
| Exact verification | `F(n, x, y_cand) == 0` using Python arbitrary-precision integers |

---

## Project Structure

```
.
├── app.py                   # Flask backend — /api/search, /api/diophantine, /api/latex, /api/from_latex
├── Procfile                 # gunicorn command for Render / Heroku
├── render.yaml              # Render deployment config
├── requirements.txt
├── templates/
│   └── index.html           # Single-page UI (two solver modes, KaTeX, hero section)
└── static/
    ├── css/main.css
    └── js/main.js
```

---

## Example Curves & Equations

### y² = f(n, x) examples

| Name | Expression | Notes |
|------|-----------|-------|
| Congruent number curve | `x**3 - n**2*x` | Integer points ↔ n is a congruent number |
| Weierstrass y²=x³+n | `x**3 + n` | Classic constant-shift family |
| Hardy–Ramanujan 1729 | `x**3 - 1729*n**3` | Smart window centred on ∛(1729n³) |
| Divisor mode | `(6n+3+x)² + P(n)/x` | Solution: n=77, x=97, y=±699 |
| Large-solution demo | `x**3 + (x-n)**2` | Expression range finds y=10¹⁵ in seconds |

### General Diophantine examples

| Equation | Notes |
|----------|-------|
| `y**2 + y = x**3 - x` | 8 solutions in x ∈ [−5, 5] |
| `x**2 + y**2 = n**2` | Pythagorean triples — n is the hypotenuse |
| `x**3 + y**3 = n` | Sum-of-two-cubes; finds 1729 = 12³+1³ = 10³+9³ |
| `y**3 - y = x**4 - 2*x - 2` | Degree-4 in x, degree-3 in y |

---

## Security

- SymPy `sympify` with explicit symbol allow-list (`n`, `x`, `y`)
- Regex blocklist rejects `import`, `eval`, `exec`, `os`, `sys`, `__builtins__`, etc.
- LaTeX converter validates parsed symbols before returning Python expression
- `_eval_center` uses a sandboxed `eval` with `{"__builtins__": {}}` plus only `abs`, `round`, `int`, `icbrt`
- Production: gunicorn, `debug=False`, `PORT` from environment

---
