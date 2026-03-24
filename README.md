# Elliptic Curve & Diophantine Equation Solver

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A Flask web app for finding integer solutions to polynomial Diophantine equations.
Supports the classical **y² = f(n, x)** elliptic-curve family mode **and** a
fully general **F(x, y, n) = 0** mode for arbitrary polynomial equations
like `y³ − y = x⁴ − 2x − 2`. Results stream live to the browser.

**Live (planned): `https://www.ecades.com`**

> Until the custom domain is configured, your Render deploy will be available at
> `https://<your-service>.onrender.com`.

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

The repo ships `Procfile` and `render.yaml` for one-click deployment.

### Option A: Blueprint deploy (recommended)

1. Sign in to Render and connect your GitHub account.
2. Render Dashboard → **New +** → **Blueprint**.
3. Select this repository: `JAgbanwa/elliptic-curve-solver-app-or-website`.
4. Render reads `render.yaml` automatically — confirm and click **Apply** / **Create**.
5. Wait for the build to finish → your app will be live at:

   - `https://<your-service>.onrender.com`

### Option B: Web Service deploy

1. Render Dashboard → **New +** → **Web Service**.
2. Connect this repository.
3. Use:
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn app:app --timeout 300 --workers 2 --worker-class gthread --threads 4 --bind 0.0.0.0:$PORT`

> Note: Render free tier web services may spin down after inactivity.

---

## Custom domain: `www.ecades.com`

Recommended setup:

- Use **`www.ecades.com`** as the canonical domain.
- Redirect **`ecades.com` → `www.ecades.com`**.

### 1) Buy the domain

Purchase `ecades.com` from a registrar (Cloudflare Registrar, Namecheap, GoDaddy, etc.).

### 2) Add domains in Render

Render service → **Settings** → **Custom Domains**:

- Add `www.ecades.com`
- (Optional but recommended) Add `ecades.com`

Render will show the exact DNS records to create.

### 3) Configure DNS records

Your DNS provider will typically need:

- `www.ecades.com`: a **CNAME** record pointing to the target Render provides.
- `ecades.com` (apex/root): either
  - an **ALIAS/ANAME / CNAME flattening** record (if your DNS provider supports it), or
  - an HTTP redirect rule sending `ecades.com` → `https://www.ecades.com`.

After DNS propagates and Render verifies the records, `https://www.ecades.com` will serve over HTTPS.

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
- **Curve visualization** — immediately after every search a 2D canvas chart appears showing the real locus of the equation and highlighting found integer points as red dots; the plot panel is **only shown when there is something to draw** (hidden for equations with no real branches or no y variable):
  - **y² = f(n, x)** — both positive and negative branches traced over the search x-range
  - **General polynomial in y** — all real root-branches traced via `numpy.roots()`
  - **Non-polynomial y** (e.g. `x^y = n`) — integer points plotted as a scatter with a note explaining the curve shape is unavailable
  - Caption identifies the strategy (`ec`, `poly_y`, `brute3`, …) so you always know what was drawn and why
- **CSV, PDF & LaTeX export** — download results as a spreadsheet, print to PDF, or export a ready-to-compile `.tex` file with full search-parameter metadata (bounds, compute time, strategy, exhaustiveness statement); PDF export embeds the curve plot as a PNG image; LaTeX export includes a full `pgfplots` tikzpicture
- **Light / Dark mode** — toggle in the header; remembers your preference via localStorage; curve colours re-render automatically on theme change
- **21 built-in examples** spanning both solver modes — click any card to instantly load and run the search

---

## Curve Visualization Coverage

The plot panel's behaviour adapts to every equation type the solver handles:

| Equation type | Curve drawn? | Integer points? | Panel shown? |
|---|---|---|---|
| **y² = f(n, x)** with real branches | ✅ Both ±√f branches | ✅ Red dots | ✅ |
| **y² = f(n, x)** no real branches in range | — | — | Hidden |
| **Gen poly_y** (polynomial in y) | ✅ All real root-branches | ✅ Red dots | ✅ |
| **Gen poly_y** no real roots in range | — | — | Hidden |
| **Gen brute3** (e.g. `x^y = n`, y in exponent) | — not polynomial | ✅ Scatter dots | ✅ with note |
| **Gen brute2** (y absent, e.g. `x² = n`) | — no y axis | — | Hidden |

The `/api/plot` endpoint returns a `curve_strategy` field (`ec`, `ec_no_real`, `poly_y`, `poly_y_no_real`, `brute3`, `brute2`) so the frontend caption always explains what was drawn and why.

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
├── app.py                   # Flask backend — /api/search, /api/diophantine, /api/latex,
│                            #   /api/from_latex, /api/plot (curve data + pgfplots)
├── Procfile                 # gunicorn command for Render / Heroku
├── render.yaml              # Render deployment config
├── requirements.txt
├── templates/
│   └── index.html           # Single-page UI (two solver modes, KaTeX, hero section,
│                            #   canvas curve plot, export buttons)
└── static/
    ├── css/main.css         # Includes plot-section, legend and print/PDF plot styles
    └── js/main.js           # loadPlot(), renderPlot(), _fmtNum(); LaTeX pgfplots export
```

---

## Security

- SymPy `sympify` with explicit symbol allow-list (`n`, `x`, `y`)
- Regex blocklist rejects `import`, `eval`, `exec`, `os`, `sys`, `__builtins__`, etc.
- LaTeX converter validates parsed symbols before returning Python expression
- `_eval_center` uses a sandboxed `eval` with `{"__builtins__": {}}` plus only `abs`, `round`, `int`, `icbrt`
- Production: gunicorn, `debug=False`, `PORT` from environment

---

This tool is free and open forever. Improvements welcome — feel free to open issues or PRs!