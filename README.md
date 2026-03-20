# Elliptic Curve Integer Point Finder

A Flask web app that searches for integer points on parametric elliptic curve
families **y² = f(n, x)**, streaming results live to the browser.  
**[Live demo →](https://elliptic-curve-solver.onrender.com)**

---

## Features

- **Arbitrary curve families** — enter any expression `f(n, x)` in Python syntax  
- **LaTeX import** — paste a LaTeX equation and convert it to the required Python expression automatically  
- **Rational n support** — set a denominator to scan fractions like ½, ⅓, ⅙, …  
- **Big-integer n** — n-min / n-max accept arbitrarily large integers (23+ digits)  
- **Three x-scan modes** — fixed range, auto-scale (range grows with |n|), or centered window around a symbolic expression  
- **Skip-zeros filters** — exclude n = 0 and/or x = 0 from results with a single checkbox  
- **N Summary panel** — after search, instantly see which rational n-values yielded integral points  
- **Live streaming** — results appear in real time via Server-Sent Events (SSE)  
- **NumPy-vectorised backend** — the entire x range is evaluated in a single NumPy call per n  
- **LaTeX preview** — the curve is rendered with KaTeX as you type  
- **Table grouped by n** — solutions are visually grouped under their n-header row  
- **CSV export** — download all discovered integer points  
- **10 built-in examples** — including the congruent number curve, Hardy–Ramanujan 1729, and Weierstrass families  

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

Then open **http://localhost:5001** in your browser.

---

## Deploy to Render

The repo ships with a `Procfile` and `render.yaml` so you can deploy in minutes:

1. Sign in to [render.com](https://render.com) with your GitHub account  
2. **New +** → **Web Service** → connect this repository  
3. Render auto-detects `render.yaml` — confirm the settings and click **Create Web Service**  
4. After the ~3 min build your app is live at `https://<your-service>.onrender.com`

> **Note:** the free tier spins down after 15 min of inactivity (cold-start ~30 s).  
> Upgrade to the Starter plan ($7/month) for an always-on instance.

---

## How It Works

| Step | What happens |
|------|-------------|
| **Parse** | SymPy parses `f(n, x)` and compiles it to a fast NumPy-vectorised function via `lambdify` |
| **Scan** | For each rational `n` in `[n_min, n_max]` (step `1/n_denom`), all integers `x` in the selected range are evaluated **in one NumPy call** |
| **Check** | RHS values are filtered for non-negative integers; integer square-roots are computed in bulk |
| **Summarise** | After the search, a dedicated panel lists every rational `n` that had at least one integral point |
| **Stream** | Solutions and progress are streamed back to the browser as JSON Server-Sent Events |

A soft warning is shown when a search exceeds 100 million evaluations; no hard cap is enforced.

---

## Project Structure

```
.
├── app.py                   # Flask backend + SSE search endpoint + LaTeX converter
├── Procfile                 # gunicorn start command for Render / Heroku
├── render.yaml              # Render deployment config
├── requirements.txt
├── templates/
│   └── index.html           # Single-page UI
└── static/
    ├── css/
    │   └── main.css
    └── js/
        └── main.js
```

---

## Example Curves

| Name | Expression | Notes |
|------|-----------|-------|
| Congruent number curve | `x**3 - n**2*x` | Integer points ↔ n is a congruent number |
| Weierstrass y²=x³+n | `x**3 + n` | Classic constant-shift family |
| y²=x³−x+n | `x**3 - x + n` | Linear shift |
| y²=x³−n³ | `x**3 - n**3` | Fermat-adjacent |
| Torsion only | `x**3 - x` | Fixed curve; torsion points (−1, 0), (0, 0), (1, 0) |
| Hardy–Ramanujan 1729 | `x**3 + n**3` | Taxicab number family |
| Weierstrass large-coeff | `x**3 - 27*n**4*x + 54*n**6` | Large-coefficient family |
| General Weierstrass | `(36*n + 27)**2` family | Parameterised by 6n+... |

---

## Security

- Expression parsing is done through SymPy's `sympify` with an explicit allow-list of symbols (`n`, `x`)  
- A regex blocklist rejects any use of `import`, `eval`, `exec`, `os`, `sys`, etc.  
- The LaTeX converter validates that only `n` and `x` appear in the parsed expression before returning it  
- Production server runs gunicorn with `debug=False`; the `PORT` is read from the environment  

---
