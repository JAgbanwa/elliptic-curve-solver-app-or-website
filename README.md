# Elliptic Curve Integer Point Finder

A Flask web app that searches for rational values of **n** for which the
elliptic curve **y² = f(n, x)** has integer points, streaming results live
to the browser.

---

## Features

- **Arbitrary curve families** — enter any expression `f(n, x)` in Python syntax  
- **Rational n support** — set a denominator to scan fractions like ½, ⅓, ⅙, …  
- **Live streaming** — results appear in real time via Server-Sent Events (SSE)  
- **LaTeX preview** — the curve is rendered with KaTeX as you type  
- **CSV export** — download all discovered integer points  
- **8 built-in examples** — including the congruent number curve and Weierstrass families  

---

## Quick Start

```bash
# 1. Clone
git clone https://github.com/JAgbanwa/elliptic-curve-solver-app-or-website.git
cd elliptic-curve-solver-app-or-website

# 2. Install dependencies (Python 3.10+)
pip install -r requirements.txt

# 3. Run
python app.py
```

Then open **http://localhost:5000** in your browser.

---

## How It Works

| Step | What happens |
|------|--------------|
| **Parse** | SymPy parses `f(n, x)` and compiles it to a fast numeric function via `lambdify` |
| **Scan** | For each rational `n` in `[n_min, n_max]` (step `1/n_denom`), every integer `x` in `[x_min, x_max]` is tested |
| **Check** | `f(n, x)` is computed; if it is a non-negative perfect square, `(n, x, ±y)` is a solution |
| **Stream** | Solutions and progress are streamed back to the browser as JSON Server-Sent Events |

**Budget:** up to 20 million evaluations per request (n-count × x-range).

---

## Project Structure

```
.
├── app.py                   # Flask backend + SSE search endpoint
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
| Torsion only | `x**3 - x` | Fixed curve; torsion points (−1,0),(0,0),(1,0) |

---

## Security

- Expression parsing is done through SymPy's `sympify` with an explicit allow-list of symbols (`n`, `x`)  
- A regex blocklist rejects any use of `import`, `eval`, `exec`, `os`, `sys`, etc.  
- Search budget is capped server-side at 20 M evaluations per request  

---
