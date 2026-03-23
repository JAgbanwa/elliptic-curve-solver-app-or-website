/**
 * Elliptic Curve Integer Point Finder — frontend logic
 * Handles: LaTeX preview, SSE-based search, results table, CSV export, examples
 */

/* ═══════════════════════════════════════════════════════════════════════════
   EXAMPLE CURVES
   ═══════════════════════════════════════════════════════════════════════════ */
const EXAMPLES = [
  {
    name: "Congruent Number Curve",
    expr: "x**3 - n**2*x",
    nm: -10, nx: 10, xm: -100, xx: 100, nd: 1,
    desc: "y² = x³ − n²x. Integer points exist iff n is a congruent number.",
  },
  {
    name: "Weierstrass y²=x³+n",
    expr: "x**3 + n",
    nm: -5, nx: 20, xm: -50, xx: 50, nd: 1,
    desc: "Classic family. For n=1: Fermat's last theorem (n=1 case).",
  },
  {
    name: "y²=x³−x+n",
    expr: "x**3 - x + n",
    nm: -8, nx: 8, xm: -30, xx: 30, nd: 1,
    desc: "Varies the constant shift n across a fixed cubic.",
  },
  {
    name: "Congruent (rational n)",
    expr: "x**3 - n**2*x",
    nm: 0, nx: 6, xm: -200, xx: 200, nd: 6,
    desc: "Same curve but n runs over multiples of 1/6 — tests rational n.",
  },
  {
    name: "y²=x³+n²x+n",
    expr: "x**3 + n**2*x + n",
    nm: -5, nx: 5, xm: -50, xx: 50, nd: 1,
    desc: "Both linear and quadratic n-dependence in the cubic.",
  },
  {
    name: "y²=x³−n³",
    expr: "x**3 - n**3",
    nm: -6, nx: 6, xm: -80, xx: 80, nd: 1,
    desc: "Related to Fermat: asks when x³−n³ is a perfect square.",
  },
  {
    name: "Torsion test y²=x³−x",
    expr: "x**3 - x",
    nm: 0, nx: 0, xm: -10, xx: 10, nd: 1,
    desc: "Fixed curve (n ignored). Torsion points only: (−1,0),(0,0),(1,0).",
  },
  {
    name: "y²=x³+x²−n",
    expr: "x**3 + x**2 - n",
    nm: -10, nx: 10, xm: -40, xx: 40, nd: 1,
    desc: "Node cubic family; integer points vary richly with n.",
  },
  {
    name: "General Weierstrass (36n+27)² family",
    expr: "x**3 + (36*n + 27)**2 * x**2 + (15552*n**3 + 34992*n**2 + 26244*n + 6561)*x + (46656*n**4 + 139968*n**3 + 157464*n**2 + 78713*n + 14748)",
    nm: 1, nx: 10, xm: -50000, xx: 50000, nd: 1,
    desc: "y\u00b2 = x\u00b3 + (36n+27)\u00b2x\u00b2 + \u2026 General Weierstrass form with x\u00b2 term. Large x range needed for small n.",
  },
  {
    name: "Weierstrass (large-coeff family)",
    expr: "x**3 + (-45349632*n**4 + 419904*n**3)*x + 3*(39182082048*n**6 - 544195584*n**5 + 1259712*n**4 - 19*n)",
    nm: 1, nx: 10, xm: -5000, xx: 5000, nd: 1,
    skipZeroN: true, skipZeroX: true,
    desc: "y\u00b2 = x\u00b3 + (\u221245349632n\u2074 + 419904n\u00b3)x + 3(39182082048n\u2076 \u2212 \u2026). Excludes trivial n=0, x=0 solutions.",
  },
  {
    name: "Hardy–Ramanujan 1729 family",
    expr: "x**3 - 1729*n**3",
    nm: 1, nx: 50, nd: 1,
    xMode: "window", xCenterExpr: "icbrt(1729*n**3)", xHalfWidth: 5000,
    desc: "1729 = 12³+1³ = 10³+9³. Smart Window mode centres on ∛(1729n³) — correct for any n, including 20+ digit values.",
  },
  {
    name: "y\u00b2 = (6n+3+x)\u00b2 + P(n)/x",
    expr: "(6*n + 3 + x)**2 + (36*n**3 + 54*n**2 + 27*n - 4)/x",
    nm: 1, nx: 100, nd: 1,
    xMode: "divisor",
    xDivisorPoly: "36*n**3 + 54*n**2 + 27*n - 4",
    xDivisorMax: 10000000,
    skipZeroX: true,
    desc: "y\u00b2 = (6n+3+x)\u00b2 + (36n\u00b3+54n\u00b2+27n\u22124)/x. Divisor search: tests only x values that exactly divide the numerator P(n). Known solution: n=77, x=97, y=\u00b1699.",
  },
  {
    name: "Large-solution demo: y\u00b2=x\u00b3+(x\u2212n)\u00b2",
    expr: "x**3 + (x - n)**2",
    nm: "10000000000", nx: "10000000000", nd: 1,
    xMode: "exprrange",
    xStartExpr: "n - 5",
    xEndExpr:   "n + 5",
    xStepExpr:  "1",
    desc: "y\u00b2 = x\u00b3 + (x\u2212n)\u00b2. At x=n with n=k\u00b2: y=\u00b1k\u00b3. With n=10\u00b9\u2070=(10\u2075)\u00b2, finds x=10\u00b9\u2070, y=\u00b110\u00b9\u2075 in seconds via Expression Range. Change n to any perfect square.",
  },
  {
    name: "Stepped coarse scan: y\u00b2=x\u00b3+17",
    expr: "x**3 + 17",
    nm: 0, nx: 0, nd: 1,
    xMode: "exprrange",
    xStartExpr: "0",
    xEndExpr:   "100",
    xStepExpr:  "1",
    desc: "y\u00b2=x\u00b3+17 (n unused). Expression range finds all integral x up to 100: x=2 (y=5), x=4 (y=9), x=8 (y=23), x=43 (y=282), x=52 (y=375). Set start=\"10**10\", end=\"10**10+10**6\" to probe a trillion-scale region.",
  },
  // ──── General Diophantine examples ───────────────────────────────────────────
  {
    name: "y\u00b2 + y = x\u00b3 \u2212 x  (gen. poly.)",
    solverMode: "gen",
    eq: "y**2 + y = x**3 - x",
    nm: 0, nx: 0, xm: -20, xx: 20, ym: -100, yx: 100,
    desc: "y(y+1) = x(x\u00b2\u22121). Solutions: (0,0),(0,\u22121),(1,0),(1,\u22121),(\u22121,0),(\u22121,\u22121),(2,2),(2,\u22123),(\u22122,1),(\u22122,\u22122). Polynomial degree 2 in y \u2014 two solutions per x.",
  },
  {
    name: "Pythagorean triples: x\u00b2 + y\u00b2 = n\u00b2",
    solverMode: "gen",
    eq: "x**2 + y**2 = n**2",
    nm: 1, nx: 30, xm: 0, xx: 30, ym: -100, yx: 100,
    desc: "All Pythagorean triples with legs up to 30. Finds (3,4,5), (5,12,13), (8,15,17), (20,21,29), etc. n is the hypotenuse; x,y are the legs.",
  },
  {
    name: "Sum of two cubes: x\u00b3 + y\u00b3 = n",
    solverMode: "gen",
    eq: "x**3 + y**3 = n",
    nm: 1, nx: 2000, xm: -15, xx: 15, ym: -100, yx: 100,
    desc: "Which n are a sum of two integer cubes? Finds n=1729=12\u00b3+1\u00b3=10\u00b3+9\u00b3 (Hardy\u2013Ramanujan taxi-cab), n=1=1+0, n=2=1+1, n=9=2+1, etc.",
  },
  {
    name: "y\u00b3 \u2212 y = x\u2074 \u2212 2x \u2212 2",
    solverMode: "gen",
    eq: "y**3 - y = x**4 - 2*x - 2",
    nm: 0, nx: 0, xm: -100, xx: 100, ym: -100, yx: 100,
    desc: "The equation from the user request. Degree 3 in y, degree 4 in x. For each x, numpy solves y\u00b3\u2212y\u2212(x\u2074\u22122x\u22122) = 0 exactly. Widen x range if no solutions found here.",
  },
  {
    name: "Perfect powers: x^y = n  (3D brute-force)",
    solverMode: "gen",
    eq: "x**y = n",
    nm: 1, nx: 1024, nd: 1, xm: 2, xx: 32, ym: 1, yx: 10,
    desc: "Find all (n, x, y) with x^y = n. y appears in the exponent \u2014 not polynomial in y \u2014 so the solver uses 3D brute-force. Discovers all perfect squares, cubes, 4th-powers, etc. up to 1024.",
  },
];


/* ═══════════════════════════════════════════════════════════════════════════
   DOM REFERENCES
   ═══════════════════════════════════════════════════════════════════════════ */
const exprInput    = document.getElementById("expr-input");
const latexPreview = document.getElementById("latex-preview");
const latexPasteInput   = document.getElementById("latex-paste-input");
const btnConvertLatex   = document.getElementById("btn-convert-latex");
const latexConvertStatus = document.getElementById("latex-convert-status");
const nMinIn       = document.getElementById("n-min");
const nMaxIn       = document.getElementById("n-max");
const nDenomIn     = document.getElementById("n-denom");
const xMinIn       = document.getElementById("x-min");
const xMaxIn       = document.getElementById("x-max");
const btnSearch    = document.getElementById("btn-search");
const btnStop      = document.getElementById("btn-stop");
const btnClear     = document.getElementById("btn-clear");
const btnExport    = document.getElementById("btn-export");
const progressArea = document.getElementById("progress-area");
const progressFill = document.getElementById("progress-fill");
const progressStats= document.getElementById("progress-stats");
const statusArea   = document.getElementById("status-area");
const tableWrap    = document.getElementById("table-wrap");
const resultsBody  = document.getElementById("results-tbody");
const solCount     = document.getElementById("solution-count");
const emptyState   = document.getElementById("empty-state");
const exampleGrid    = document.getElementById("example-grid");
const xModeSelect    = document.getElementById("x-mode-select");
const xFixedRange    = document.getElementById("x-fixed-range");
const xScaleWrap     = document.getElementById("x-scale-wrap");
const xWindowWrap    = document.getElementById("x-window-wrap");
const xScaleFactorIn = document.getElementById("x-scale-factor");
const xCenterExprIn  = document.getElementById("x-center-expr");
const xHalfWidthIn   = document.getElementById("x-half-width");
const xDivisorWrap   = document.getElementById("x-divisor-wrap");
const xDivisorPolyIn = document.getElementById("x-divisor-poly");
const xDivisorMaxIn  = document.getElementById("x-divisor-max");
const xExprRangeWrap = document.getElementById("x-exprrange-wrap");
const xStartExprIn   = document.getElementById("x-start-expr");
const xEndExprIn     = document.getElementById("x-end-expr");
const xStepExprIn    = document.getElementById("x-step-expr");
const skipZeroNChk   = document.getElementById("skip-zero-n");
const skipZeroXChk   = document.getElementById("skip-zero-x");
// Mode tabs & general Diophantine inputs
const tabEC          = document.getElementById("tab-ec");
const tabGen         = document.getElementById("tab-gen");
const ecExprSection  = document.getElementById("ec-expr-section");
const ecXSection     = document.getElementById("ec-x-section");
const genInputs      = document.getElementById("gen-inputs");
const genEqIn        = document.getElementById("gen-eq-input");
const genEqPreview   = document.getElementById("gen-eq-preview");
const genXMinIn      = document.getElementById("gen-x-min");
const genXMaxIn      = document.getElementById("gen-x-max");
const genYMinIn      = document.getElementById("gen-y-min");
const genYMaxIn      = document.getElementById("gen-y-max");
const thVerify       = document.getElementById("th-verify");
const btnThemeToggle = document.getElementById("btn-theme-toggle");
// Unknowns sub-tab elements — EC mode
const ecVarTabsEl      = document.getElementById("ec-var-tabs");
const ecTab2Var        = document.getElementById("ec-tab-2var");
const ecTab3Var        = document.getElementById("ec-tab-3var");
const ecNSingleSection = document.getElementById("ec-n-single-section");
const ecNSingleIn      = document.getElementById("ec-n-single");
const nRangeSection    = document.getElementById("n-range-section");
// Unknowns sub-tab elements — Gen mode
const genTab2Var       = document.getElementById("gen-tab-2var");
const genTab3Var       = document.getElementById("gen-tab-3var");
const genYRangeSection = document.getElementById("gen-y-range-section");
const ecEqLabelVars    = document.getElementById("ec-eq-label-vars");
const genEqLabelVars   = document.getElementById("gen-eq-label-vars");

/* ═══════════════════════════════════════════════════════════════════════════
   THEME
   ═══════════════════════════════════════════════════════════════════════════ */
(function initTheme() {
  if (!btnThemeToggle) return;
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  _applyThemeBtn(current);
})();

function _applyThemeBtn(theme) {
  if (!btnThemeToggle) return;
  const icon  = btnThemeToggle.querySelector(".theme-icon");
  const label = btnThemeToggle.querySelector(".theme-label");
  if (theme === "light") {
    if (icon)  icon.textContent  = "\uD83C\uDF19"; // 🌙
    if (label) label.textContent = (typeof t === "function") ? t("theme-dark")  : "Dark mode";
    btnThemeToggle.title = "Switch to dark mode";
  } else {
    if (icon)  icon.textContent  = "\u2600\uFE0F"; // ☀️
    if (label) label.textContent = (typeof t === "function") ? t("theme-light") : "Light mode";
    btnThemeToggle.title = "Switch to light mode";
  }
}

if (btnThemeToggle) {
  btnThemeToggle.addEventListener("click", function () {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    _applyThemeBtn(next);
    if (plotData) renderPlot();
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════════════════════ */
let evtSource   = null;   // active EventSource
let allSolutions= [];     // [{n, x, y}, …]
let rowIndex    = 0;      // global row counter for table
let nTotalCount = 0;      // total n-values in last search (for n-summary)
let lastGroupN  = null;   // n-value of the current table group header
let currentSolverMode = "ec";  // "ec" | "gen"
let ecVarMode  = "3var";       // "2var" | "3var"  — for y² = f mode
let genVarMode = "3var";       // "2var" | "3var"  — for General Diophantine
let plotData    = null;   // last successful /api/plot response
let viewport    = null;   // {xMin, xMax, yMin, yMax} — current zoom/pan view
let showPointLabels = true;   // show (x,y) labels next to solution dots
let _canvasEventsReady = false; // guard: interaction events attached once
// Search metadata — captured at search start, used by PDF/LaTeX export
let searchMeta = {};      // snapshot of search parameters
/* ═══════════════════════════════════════════════════════════════════════════
   LATEX PREVIEW
   ═══════════════════════════════════════════════════════════════════════════ */
let previewTimer = null;

function renderPreview(latexStr) {
  latexPreview.classList.remove("error");
  try {
    latexPreview.innerHTML = "";
    katex.render("y^2 = " + latexStr, latexPreview, {
      throwOnError: false, displayMode: true,
    });
  } catch (_) {
    latexPreview.textContent = "y² = " + latexStr;
  }
}

async function fetchLatex(expr) {
  try {
    const resp = await fetch("/api/latex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expr }),
    });
    const data = await resp.json();
    if (data.ok) {
      renderPreview(data.latex);
    } else {
      latexPreview.classList.add("error");
      latexPreview.textContent = data.error;
    }
  } catch (_) {
    latexPreview.textContent = "Preview unavailable";
  }
}

exprInput.addEventListener("input", () => {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => fetchLatex(exprInput.value), 400);
});

// Initial render
fetchLatex(exprInput.value);

/* ═══════════════════════════════════════════════════════════════════════════
   LATEX IMPORT
   ═══════════════════════════════════════════════════════════════════════════ */
btnConvertLatex.addEventListener("click", async () => {
  const raw = latexPasteInput.value.trim();
  if (!raw) { latexConvertStatus.textContent = "Paste a LaTeX expression first."; latexConvertStatus.className = "latex-convert-status error"; return; }
  latexConvertStatus.textContent = "Converting…";
  latexConvertStatus.className = "latex-convert-status";
  try {
    const resp = await fetch("/api/from_latex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latex: raw }),
    });
    const data = await resp.json();
    if (data.ok) {
      exprInput.value = data.expr;
      latexConvertStatus.textContent = "✓ Loaded into expression field!";
      latexConvertStatus.className = "latex-convert-status ok";
      fetchLatex(data.expr);
      document.getElementById("latex-import").open = false;
    } else {
      latexConvertStatus.textContent = "Error: " + data.error;
      latexConvertStatus.className = "latex-convert-status error";
    }
  } catch (_) {
    latexConvertStatus.textContent = "Request failed — is the server running?";
    latexConvertStatus.className = "latex-convert-status error";
  }
});

/* General Diophantine "Paste LaTeX equation → Convert to Python" */
const btnConvertLatexGen    = document.getElementById("btn-convert-latex-gen");
const genLatexPasteInput    = document.getElementById("gen-latex-paste-input");
const genLatexConvertStatus = document.getElementById("gen-latex-convert-status");

btnConvertLatexGen.addEventListener("click", async () => {
  const raw = genLatexPasteInput.value.trim();
  if (!raw) {
    genLatexConvertStatus.textContent = "Paste a LaTeX equation first.";
    genLatexConvertStatus.className = "latex-convert-status error";
    return;
  }
  genLatexConvertStatus.textContent = "Converting…";
  genLatexConvertStatus.className = "latex-convert-status";
  try {
    const resp = await fetch("/api/from_latex", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ latex: raw, mode: "gen" }),
    });
    const data = await resp.json();
    if (data.ok) {
      genEqIn.value = data.eq;
      genLatexConvertStatus.textContent = "✓ Loaded into equation field!";
      genLatexConvertStatus.className = "latex-convert-status ok";
      renderGenPreview(data.eq);
      document.getElementById("gen-latex-import").open = false;
    } else {
      genLatexConvertStatus.textContent = "Error: " + data.error;
      genLatexConvertStatus.className = "latex-convert-status error";
    }
  } catch (_) {
    genLatexConvertStatus.textContent = "Request failed — is the server running?";
    genLatexConvertStatus.className = "latex-convert-status error";
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   N SUMMARY
   ═══════════════════════════════════════════════════════════════════════════ */
function renderNSummary(nList, nTested) {
  const section = document.getElementById("n-summary-section");
  const wrap    = document.getElementById("n-summary-wrap");
  if (!section || !wrap) return;
  if (!nList || nList.length === 0) {
    wrap.innerHTML = `<p class="dim">No rational <em>n</em> yielded integral points in the searched range.</p>`;
  } else {
    const chips = nList
      .map(n => `<span class="n-chip">${escHtml(String(n))}</span>`)
      .join("");
    wrap.innerHTML = `
      <div class="n-summary-header">
        <span class="n-summary-count">${nList.length}</span>
        of ${nTested.toLocaleString()} n-values tested yielded integral points:
      </div>
      <div class="n-chips-row">${chips}</div>`;
  }
  section.style.display = "block";
}

/* ═══════════════════════════════════════════════════════════════════════════
   SEARCH
   ═══════════════════════════════════════════════════════════════════════════ */
function setStatus(msg, cls) {
  statusArea.textContent = msg;
  statusArea.className = cls || "status-idle";
}

function clearResults() {
  allSolutions = [];
  rowIndex     = 0;
  lastGroupN   = null;
  nTotalCount  = 0;
  resultsBody.innerHTML = "";
  solCount.textContent = "0 " + ((typeof t === "function") ? t("sol-plural") : "solutions");
  tableWrap.style.display = "none";
  emptyState.style.display = "none";
  progressArea.style.display = "none";
  progressFill.style.width = "0%";
  const ns = document.getElementById("n-summary-section");
  if (ns) ns.style.display = "none";
  const wb = document.getElementById("search-warning");
  if (wb) { wb.style.display = "none"; wb.textContent = ""; }
  plotData = null;
  viewport = null;
  const ps = document.getElementById("plot-section");
  if (ps) ps.style.display = "none";
}

function addRows(batch) {
  batch.forEach(({ n, x, y }) => {
    allSolutions.push({ n, x, y });
    rowIndex++;

    // Insert a visual group-header row whenever n changes
    if (String(n) !== lastGroupN) {
      lastGroupN = String(n);
      const gtr = document.createElement("tr");
      gtr.className = "n-group-row";
      gtr.innerHTML = `<td colspan="5">n = ${escHtml(String(n))}</td>`;
      resultsBody.appendChild(gtr);
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${rowIndex}</td>
      <td>${escHtml(String(n))}</td>
      <td>${escHtml(String(x))}</td>
      <td>${escHtml(String(y))}</td>
      <td class="cell-valid">${(typeof t === "function") ? t("cell-verified") : "✓ verified"}</td>`;
    resultsBody.appendChild(tr);
  });
  // keep newest in view
  resultsBody.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildSearchURL() {
  const ec2var = ecVarMode === "2var";
  const p = new URLSearchParams({
    expr:    exprInput.value.trim(),
    n_min:   ec2var ? ecNSingleIn.value : nMinIn.value,
    n_max:   ec2var ? ecNSingleIn.value : nMaxIn.value,
    n_denom: ec2var ? "1"               : nDenomIn.value,
  });
  const mode = xModeSelect.value;
  if (mode === "autoscale") {
    p.set("x_scale", xScaleFactorIn.value);
  } else if (mode === "window") {
    p.set("x_center_expr", xCenterExprIn.value.trim());
    p.set("x_window", xHalfWidthIn.value);
  } else if (mode === "divisor") {
    p.set("x_divisor_poly", xDivisorPolyIn.value.trim());
    p.set("x_divisor_max",  parseInt(xDivisorMaxIn.value, 10) || 1000000);
  } else if (mode === "exprrange") {
    p.set("x_start_expr", xStartExprIn.value.trim());
    p.set("x_end_expr",   xEndExprIn.value.trim());
    p.set("x_step_expr",  xStepExprIn.value.trim() || "1");
  } else {
    p.set("x_min", xMinIn.value);
    p.set("x_max", xMaxIn.value);
  }
  if (skipZeroNChk.checked) p.set("skip_zero_n", "1");
  if (skipZeroXChk.checked) p.set("skip_zero_x", "1");
  return "/api/search?" + p.toString();
}

function startSearch() {
  if (evtSource) { evtSource.close(); evtSource = null; }

  clearResults();
  setStatus((typeof t === "function") ? t("status-starting") : "Starting search…", "status-running");
  progressArea.style.display = "block";
  btnSearch.disabled = true;
  btnStop.disabled   = false;

  // Snapshot all search parameters for later use in PDF / LaTeX export
  const isGen = currentSolverMode === "gen";
  const isEC2var = !isGen && ecVarMode === "2var";
  searchMeta = {
    mode:        currentSolverMode,   // "ec" | "gen"
    ecVarMode:   ecVarMode,
    genVarMode:  genVarMode,
    equation:    isGen ? genEqIn.value.trim() : `y\u00b2 = ${exprInput.value.trim()}`,
    startedAt:   Date.now(),
    finishedAt:  null,
    // n range
    nMin:        isEC2var ? ecNSingleIn.value : nMinIn.value,
    nMax:        isEC2var ? ecNSingleIn.value : nMaxIn.value,
    nDenom:      isEC2var ? "1"               : nDenomIn.value,
    // x range
    xMode:       isGen ? "fixed" : xModeSelect.value,
    xMin:        isGen ? genXMinIn.value : xMinIn.value,
    xMax:        isGen ? genXMaxIn.value : xMaxIn.value,
    xScaleFactor: xScaleFactorIn.value,
    xCenterExpr:  xCenterExprIn.value,
    xHalfWidth:   xHalfWidthIn.value,
    xDivisorPoly: xDivisorPolyIn.value,
    xDivisorMax:  xDivisorMaxIn.value,
    xStartExpr:   xStartExprIn.value,
    xEndExpr:     xEndExprIn.value,
    xStepExpr:    xStepExprIn.value,
    // y range (gen mode only)
    yMin:        isGen ? genYMinIn.value : null,
    yMax:        isGen ? genYMaxIn.value : null,
    // constraints
    skipZeroN:   skipZeroNChk.checked,
    skipZeroX:   skipZeroXChk.checked,
    // filled in from SSE "start" and "done" messages
    nCount:      0,
    totalEvals:  0,
    strategy:    "",
    exhaustive:  true,
  };

  const searchUrl = currentSolverMode === "gen" ? buildDiophURL() : buildSearchURL();
  evtSource = new EventSource(searchUrl);

  evtSource.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); }
    catch { return; }

    switch (msg.type) {
      case "warning": {
        const wb = document.getElementById("search-warning");
        if (wb) { wb.textContent = "\u26a0 " + msg.message; wb.style.display = "block"; }
        break;
      }

      case "start":
        nTotalCount = msg.n_count;
        searchMeta.nCount     = msg.n_count;
        searchMeta.totalEvals = msg.total_evals || 0;
        searchMeta.strategy   = msg.strategy || "fixed";
        if (msg.x_scale > 0) {
          setStatus(
            `Searching ${msg.n_count.toLocaleString()} n-values, auto-scaled x (k=${msg.x_scale})`
            + ` — ${msg.total_evals.toLocaleString()} evaluations…`,
            "status-running",
          );
        } else if (msg.strategy === "brute3") {
          setStatus(
            `3D brute-force: ${msg.n_count.toLocaleString()} n × `
            + `${msg.x_count.toLocaleString()} x × `
            + `${msg.y_count.toLocaleString()} y`
            + ` = ${msg.total_evals.toLocaleString()} evaluations…`,
            "status-running",
          );
        } else if (msg.strategy === "brute2") {
          setStatus(
            `2-variable scan: ${msg.n_count.toLocaleString()} n × `
            + `${msg.x_count.toLocaleString()} x`
            + ` = ${msg.total_evals.toLocaleString()} evaluations…`,
            "status-running",
          );
        } else {
          setStatus(
            `Searching ${msg.n_count.toLocaleString()} n-values × `
            + `${msg.x_count.toLocaleString()} x-values `
            + `= ${msg.total_evals.toLocaleString()} evaluations…`,
            "status-running",
          );
        }
        break;

      case "progress":
        progressFill.style.width = msg.pct + "%";
        progressStats.textContent =
          `Progress: ${msg.pct}%  |  n = ${msg.n}  |  solutions found: ${msg.solutions}`;
        solCount.textContent = `${msg.solutions} solution${msg.solutions !== 1 ? "s" : ""}`;
        break;

      case "solutions":
        if (!msg.data || !msg.data.length) break;
        tableWrap.style.display = "block";
        addRows(msg.data);
        const _sp2 = (typeof t === "function") ? (allSolutions.length !== 1 ? t("sol-plural") : t("sol-singular")) : (allSolutions.length !== 1 ? "solutions" : "solution");
        solCount.textContent = `${allSolutions.length} ${_sp2}`;
        break;

      case "curve_info": {
        const ci = msg;
        const def = v => v !== undefined && v !== null ? escHtml(String(v)) : "";

        const badPrimes = Array.isArray(ci.primes_bad_reduction)
          ? (ci.primes_bad_reduction.length ? ci.primes_bad_reduction.join(", ") : "none")
          : def(ci.primes_bad_reduction);

        const errNote = ci.error
          ? `<div class="ci-error">⚠ ${def(ci.error)}</div>`
          : "";

        let body = errNote;

        if (ci.A !== undefined) {
          body += `
            <div class="ci-section">
              <div class="ci-sh">Short Weierstrass form</div>
              <div class="ci-kv"><span class="ci-key">Equation</span><span class="ci-val">${def(ci.short_weierstrass)}</span></div>
              <div class="ci-kv"><span class="ci-key">A</span><span class="ci-val">${def(ci.A)}</span></div>
              <div class="ci-kv"><span class="ci-key">B</span><span class="ci-val">${def(ci.B)}</span></div>
            </div>`;
        }

        if (ci.discriminant !== undefined) {
          body += `
            <div class="ci-section">
              <div class="ci-sh">Invariants</div>
              <div class="ci-kv"><span class="ci-key">Discriminant \u0394</span><span class="ci-val">${def(ci.discriminant)}</span></div>
              <div class="ci-kv"><span class="ci-key"><i>j</i>-invariant</span><span class="ci-val">${def(ci.j_invariant)}</span></div>
              <div class="ci-kv"><span class="ci-key">c\u2084</span><span class="ci-val">${def(ci.c4)}</span></div>
              <div class="ci-kv"><span class="ci-key">c\u2086</span><span class="ci-val">${def(ci.c6)}</span></div>
              <div class="ci-kv"><span class="ci-key">Primes of bad reduction</span><span class="ci-val">${escHtml(badPrimes)}</span></div>
            </div>`;
        }

        if (ci.rank !== undefined) {
          body += `
            <div class="ci-section">
              <div class="ci-sh">Rank &amp; Conductor</div>
              <div class="ci-kv"><span class="ci-key">Algebraic rank</span><span class="ci-val ci-na">${def(ci.rank)} \u2014 <em>${def(ci.rank_note)}</em></span></div>
              <div class="ci-kv"><span class="ci-key">Analytic rank</span><span class="ci-val ci-na">${def(ci.analytic_rank)} \u2014 <em>${def(ci.analytic_rank_note)}</em></span></div>
              <div class="ci-kv"><span class="ci-key">Conductor</span><span class="ci-val ci-na">${def(ci.conductor)} \u2014 <em>${def(ci.conductor_note)}</em></span></div>
            </div>`;
        }

        if (ci.lmfdb_ainvs) {
          body += `
            <div class="ci-actions">
              <span class="ci-lmfdb-label">LMFDB a-invariants:</span>
              <code class="ci-lmfdb-ainv">${def(ci.lmfdb_ainvs)}</code>
              <a href="https://www.lmfdb.org/EllipticCurve/Q/" class="ci-lmfdb-btn"
                 target="_blank" rel="noopener noreferrer">Search LMFDB \u2197</a>
            </div>`;
        }

        const tr = document.createElement("tr");
        tr.className = "curve-info-row";
        tr.innerHTML = `<td colspan="5">
          <details class="curve-info-card">
            <summary class="ci-summary">
              <span class="ci-chevron">\u25b8</span>
              <span class="ci-label">Curve invariants \u2014 n\u202f=\u202f${escHtml(String(ci.n))}</span>
              <span class="ci-badge">${def(ci.curve_class)}</span>
            </summary>
            <div class="ci-body">${body}</div>
          </details>
        </td>`;
        resultsBody.appendChild(tr);
        break;
      }

      case "done":
        evtSource.close(); evtSource = null;
        searchMeta.finishedAt = Date.now();
        btnSearch.disabled = false;
        btnStop.disabled   = true;
        progressFill.style.width = "100%";
        renderNSummary(msg.n_with_solutions || [], nTotalCount);
        if (allSolutions.length === 0) {
          emptyState.style.display  = "block";
          tableWrap.style.display  = "none";
          setStatus((typeof t === "function") ? t("status-no-results") : "Search complete — no integer points found.", "status-done");
        } else {
          const _sp3 = (typeof t === "function") ? (allSolutions.length !== 1 ? t("sol-plural") : t("sol-singular")) : (allSolutions.length !== 1 ? "solutions" : "solution");
          setStatus(
            `${(typeof t === "function") ? t("done-found") || "Done! Found" : "Done! Found"} ${allSolutions.length} ${_sp3}.`,
            "status-done",
          );
        }
        const _ts = msg.total_solutions;
        const _tsp = (typeof t === "function") ? (_ts !== 1 ? t("sol-plural") : t("sol-singular")) : (_ts !== 1 ? "solutions" : "solution");
        progressStats.textContent =
          `Complete — ${_ts} total ${_tsp}.`;
        setTimeout(loadPlot, 80);
        break;

      case "error":
        evtSource.close(); evtSource = null;
        btnSearch.disabled = false;
        btnStop.disabled   = true;
        setStatus((typeof t === "function") ? ("Error: " + msg.message) : ("Error: " + msg.message), "status-error");
        progressArea.style.display = "none";
        break;
    }
  };

  evtSource.onerror = () => {
    // Browsers sometimes fire onerror BEFORE dispatching the final onmessage
    // ("done") event when the server closes the connection cleanly.  Delaying
    // by one macrotask (setTimeout 0) lets any pending onmessage events fire
    // first — the done handler sets evtSource = null, so the check below
    // correctly suppresses the spurious error in that case.
    const capturedSource = evtSource;
    setTimeout(() => {
      if (evtSource && evtSource === capturedSource) {
        evtSource.close();
        evtSource = null;
        btnSearch.disabled = false;
        btnStop.disabled   = true;
        setStatus((typeof t === "function") ? t("status-conn-error") : "Connection error — search interrupted.", "status-error");
      }
    }, 0);
  };
}

function stopSearch() {
  if (evtSource) { evtSource.close(); evtSource = null; }
  btnSearch.disabled = false;
  btnStop.disabled   = true;
  setStatus((typeof t === "function") ? t("status-stopped") : "Search stopped by user.", "status-idle");
  progressFill.style.width = "0%";
}

btnSearch.addEventListener("click", startSearch);
btnStop.addEventListener("click",   stopSearch);
btnClear.addEventListener("click",  () => {
  stopSearch();
  clearResults();
  setStatus((typeof t === "function") ? t('status-idle') : 'Enter a curve expression and click Run Search.', "status-idle");
});

xModeSelect.addEventListener("change", () => {
  const m = xModeSelect.value;
  xFixedRange.style.display   = m === "fixed"     ? "block" : "none";
  xScaleWrap.style.display    = m === "autoscale" ? "block" : "none";
  xWindowWrap.style.display   = m === "window"    ? "block" : "none";
  xDivisorWrap.style.display  = m === "divisor"   ? "block" : "none";
  xExprRangeWrap.style.display= m === "exprrange" ? "block" : "none";
});

/* ═════════════════════════════════════════════════════════════════════════════
   SOLVER MODE SWITCH
   ═════════════════════════════════════════════════════════════════════════════ */
function switchSolverMode(mode) {
  currentSolverMode = mode;
  const isEC = mode === "ec";
  ecExprSection.style.display = isEC ? "" : "none";
  ecXSection.style.display    = isEC ? "" : "none";
  genInputs.style.display     = isEC ? "none" : "";
  if (ecVarTabsEl) ecVarTabsEl.style.display = isEC ? "" : "none";
  tabEC.classList.toggle("active", isEC);
  tabGen.classList.toggle("active", !isEC);
  if (thVerify) thVerify.textContent =
    isEC ? (typeof t === "function" ? t("th-verify-ec") : "Verify\u00a0(y\u00b2\u00a0=\u00a0f(n,x))") : (typeof t === "function" ? t("th-verify-gen") : "Verify\u00a0(F\u00a0=\u00a00)");
  // Sync single-n / n-range visibility with the current EC var mode
  if (isEC) {
    if (ecNSingleSection) ecNSingleSection.style.display = ecVarMode === "2var" ? "" : "none";
    if (nRangeSection)    nRangeSection.style.display    = ecVarMode === "2var" ? "none" : "";
  } else {
    if (ecNSingleSection) ecNSingleSection.style.display = "none";
    if (nRangeSection)    nRangeSection.style.display    = "";
  }
  clearResults();
}

tabEC.addEventListener("click",  () => switchSolverMode("ec"));
tabGen.addEventListener("click", () => switchSolverMode("gen"));

/* ═══════════════════════════════════════════════════════════════════════════
   UNKNOWNS COUNT SUB-TABS
   ═══════════════════════════════════════════════════════════════════════════ */
function switchECVarMode(mode) {
  ecVarMode = mode;
  const is2var = mode === "2var";
  if (ecNSingleSection) ecNSingleSection.style.display = is2var ? "" : "none";
  if (nRangeSection)    nRangeSection.style.display    = is2var ? "none" : "";
  if (ecTab2Var) ecTab2Var.classList.toggle("active", is2var);
  if (ecTab3Var) ecTab3Var.classList.toggle("active", !is2var);
  if (ecEqLabelVars) ecEqLabelVars.textContent = is2var ? "f(x)" : "f(n, x)";
  clearResults();
}

function switchGenVarMode(mode) {
  genVarMode = mode;
  const is3var = mode === "3var";
  if (genYRangeSection) genYRangeSection.style.display = is3var ? "" : "none";
  if (genTab2Var) genTab2Var.classList.toggle("active", !is3var);
  if (genTab3Var) genTab3Var.classList.toggle("active", is3var);
  if (genEqLabelVars) genEqLabelVars.innerHTML =
    is3var ? "F(n,&thinsp;x,&thinsp;y)" : "F(n,&thinsp;x)";
  clearResults();
}

ecTab2Var.addEventListener("click",  () => switchECVarMode("2var"));
ecTab3Var.addEventListener("click",  () => switchECVarMode("3var"));
genTab2Var.addEventListener("click", () => switchGenVarMode("2var"));
genTab3Var.addEventListener("click", () => switchGenVarMode("3var"));

/* LaTeX preview for general Diophantine equation */
let genPreviewTimer = null;

function renderGenPreview(eq) {
  if (!eq) {
    genEqPreview.innerHTML = '<span class="dim">LaTeX preview loads here\u2026</span>';
    return;
  }
  try {
    const tex = eq.replace(/\^/g, "**").replace(/\*\*/g, "^").replace(/\*/g, " \\cdot ");
    katex.render(tex, genEqPreview, { throwOnError: false });
  } catch (_) {
    genEqPreview.textContent = eq;
  }
}

genEqIn.addEventListener("input", () => {
  clearTimeout(genPreviewTimer);
  genPreviewTimer = setTimeout(() => renderGenPreview(genEqIn.value), 400);
});

/* ═════════════════════════════════════════════════════════════════════════════
   GENERAL DIOPHANTINE URL BUILDER
   ═════════════════════════════════════════════════════════════════════════════ */
function buildDiophURL() {
  const p = new URLSearchParams({
    eq:      genEqIn.value.trim(),
    x_min:   genXMinIn.value,
    x_max:   genXMaxIn.value,
    y_min:   genYMinIn.value,
    y_max:   genYMaxIn.value,
    n_min:   nMinIn.value,
    n_max:   nMaxIn.value,
    n_denom: nDenomIn.value,
  });
  if (skipZeroNChk.checked) p.set("skip_zero_n", "1");
  if (skipZeroXChk.checked) p.set("skip_zero_x", "1");
  return "/api/diophantine?" + p.toString();
}

/* ═══════════════════════════════════════════════════════════════════════════
   CURVE VISUALIZATION
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Fetch plot data from /api/plot and render the canvas chart.
 * Called 80 ms after a search completes (to allow the DOM to settle).
 */
async function loadPlot() {
  const isGen = currentSolverMode === "gen";

  // Choose n value for the curve: first solution's n, or midpoint of n range
  let plotN;
  if (allSolutions.length > 0) {
    plotN = String(allSolutions[0].n);
  } else {
    const nm = parseFloat(searchMeta.nMin || "0");
    const nx = parseFloat(searchMeta.nMax || "0");
    plotN = String(Math.round((nm + nx) / 2));
  }

  // Compute x plot range from search params, then expand to include solutions
  let xMin, xMax;
  if (isGen) {
    xMin = parseFloat(genXMinIn.value) || -50;
    xMax = parseFloat(genXMaxIn.value) ||  50;
  } else {
    const mode = xModeSelect.value;
    if (mode === "fixed") {
      xMin = parseFloat(xMinIn.value) || -100;
      xMax = parseFloat(xMaxIn.value) ||  100;
    } else {
      xMin = -100; xMax = 100;
    }
  }

  // Expand range to fully contain all found solution x values
  const solXs = allSolutions.map(s => parseFloat(s.x)).filter(Number.isFinite);
  if (solXs.length) {
    const lo = Math.min(...solXs), hi = Math.max(...solXs);
    const pad = Math.max(5, (hi - lo) * 0.15);
    xMin = Math.min(xMin, lo - pad);
    xMax = Math.max(xMax, hi + pad);
  }

  // Clamp to a sensible plotting span
  const span = xMax - xMin;
  if (span > 4000) {
    const cx = (xMin + xMax) / 2;
    xMin = cx - 200; xMax = cx + 200;
  }

  // Solutions for the chosen n value only (so points lie on the drawn curve)
  const solsForN = allSolutions
    .filter(s => String(s.n) === plotN)
    .map(s => ({ x: s.x, y: s.y }));

  const body = { mode: isGen ? "gen" : "ec", n_val: plotN,
                 x_min: xMin, x_max: xMax, solutions: solsForN };
  if (isGen) { body.eq   = genEqIn.value.trim(); }
  else        { body.expr = exprInput.value.trim(); }

  try {
    const resp = await fetch("/api/plot", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    const data = await resp.json();
    if (data.ok) {
      // Don't open an empty panel — nothing useful to render
      const hasAnything = data.pos_segments.length > 0
                       || data.neg_segments.length > 0
                       || data.sol_points.length  > 0;
      if (!hasAnything) return;
      plotData = data;
      viewport = { xMin: data.x_min, xMax: data.x_max, yMin: data.y_min, yMax: data.y_max };
      const _lblBtn = document.getElementById("btn-toggle-labels");
      if (_lblBtn) _lblBtn.textContent = showPointLabels ? "Hide labels" : "Show labels";
      searchMeta.pgfplots = data.pgfplots;
      searchMeta.eqLatex  = data.eq_latex;
      const sec = document.getElementById("plot-section");
      if (sec) sec.style.display = "";
      const lbl = document.getElementById("plot-n-label");
      if (lbl) lbl.textContent = `n\u202f=\u202f${plotN}`;
      renderPlot();
    }
  } catch (_) {
    // Visualization is optional
  }
}

/** Draw the curve + integer points on the canvas using the 2D API. */
function renderPlot() {
  if (!plotData || !viewport) return;
  const canvas = document.getElementById("curve-canvas");
  if (!canvas) return;
  _setupCanvasInteraction();

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const container = canvas.parentElement;
  const W = Math.max(300, Math.min((container ? container.clientWidth - 24 : 700), 860));
  const H = Math.round(W * 0.5);   // 2:1 aspect

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + "px";
  canvas.style.height = H + "px";

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);

  const PAD_L = 54, PAD_R = 20, PAD_T = 24, PAD_B = 38;
  const PW = W - PAD_L - PAD_R;
  const PH = H - PAD_T - PAD_B;

  const { pos_segments, neg_segments, sol_points } = plotData;
  const { xMin: x_min, xMax: x_max, yMin: y_min, yMax: y_max } = viewport;

  const isDark = document.documentElement.getAttribute("data-theme") !== "light";
  const tx = x => PAD_L + (x - x_min) / (x_max - x_min) * PW;
  const ty = y => PAD_T + (1 - (y - y_min) / (y_max - y_min)) * PH;

  // Background
  ctx.fillStyle = isDark ? "#161b22" : "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Grid lines
  ctx.strokeStyle = isDark ? "#21262d" : "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 4]);
  const NX = 8, NY = 6;
  for (let i = 0; i <= NX; i++) {
    const gx = PAD_L + (i / NX) * PW;
    ctx.beginPath(); ctx.moveTo(gx, PAD_T); ctx.lineTo(gx, PAD_T + PH); ctx.stroke();
  }
  for (let i = 0; i <= NY; i++) {
    const gy = PAD_T + (i / NY) * PH;
    ctx.beginPath(); ctx.moveTo(PAD_L, gy); ctx.lineTo(PAD_L + PW, gy); ctx.stroke();
  }
  ctx.setLineDash([]);

  // Axis lines through origin
  ctx.strokeStyle = isDark ? "#8b949e" : "#9ca3af";
  ctx.lineWidth = 1.2;
  if (x_min <= 0 && 0 <= x_max) {
    const ax = tx(0);
    ctx.beginPath(); ctx.moveTo(ax, PAD_T); ctx.lineTo(ax, PAD_T + PH); ctx.stroke();
  }
  if (y_min <= 0 && 0 <= y_max) {
    const ay = ty(0);
    ctx.beginPath(); ctx.moveTo(PAD_L, ay); ctx.lineTo(PAD_L + PW, ay); ctx.stroke();
  }

  // Axis tick labels
  ctx.fillStyle = isDark ? "#8b949e" : "#6b7280";
  ctx.font = "11px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (let i = 0; i <= NX; i += 2) {
    const gx  = PAD_L + (i / NX) * PW;
    const val = x_min + (i / NX) * (x_max - x_min);
    ctx.fillText(_fmtNum(val), gx, PAD_T + PH + 5);
  }
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (let i = 0; i <= NY; i += 2) {
    const gy  = PAD_T + (i / NY) * PH;
    const val = y_max - (i / NY) * (y_max - y_min);
    ctx.fillText(_fmtNum(val), PAD_L - 5, gy);
  }

  // Axis labels
  ctx.fillStyle = isDark ? "#8b949e" : "#6b7280";
  ctx.font = "bold 11px sans-serif";
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  ctx.fillText("x", PAD_L + PW + 10, PAD_T + PH / 2 - 6);
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  ctx.fillText("y", PAD_L + 4, PAD_T - 10);

  // Curve segments (clipped to plot area)
  const curveColor = isDark ? "#60a5fa" : "#2563eb";
  ctx.save();
  ctx.beginPath();
  ctx.rect(PAD_L, PAD_T, PW, PH);
  ctx.clip();

  ctx.strokeStyle = curveColor;
  ctx.lineWidth   = 2;
  ctx.lineJoin    = "round";

  const drawSeg = seg => {
    if (seg.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(tx(seg[0][0]), ty(seg[0][1]));
    for (let i = 1; i < seg.length; i++) ctx.lineTo(tx(seg[i][0]), ty(seg[i][1]));
    ctx.stroke();
  };
  for (const seg of pos_segments) drawSeg(seg);
  for (const seg of neg_segments) drawSeg(seg);

  // Integer solution points + labels (also clipped to plot area)
  for (const [sx, sy] of sol_points) {
    const px = tx(sx), py = ty(sy);
    // dot
    ctx.fillStyle   = "#ef4444";
    ctx.strokeStyle = isDark ? "#161b22" : "#ffffff";
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // (x, y) label
    if (showPointLabels) {
      const lx = _fmtNum(sx), ly = _fmtNum(sy);
      const label = `(${lx}, ${ly})`;
      ctx.font = "bold 11px sans-serif";
      const tw = ctx.measureText(label).width;
      // position label: prefer above-right; nudge left if near right edge
      const lpad = 4;
      let lxPos = px + 8;
      let lyPos = py - 10;
      if (lxPos + tw + lpad > PAD_L + PW) lxPos = px - tw - 8;
      // background pill for readability
      ctx.fillStyle = isDark ? "rgba(22,27,34,0.82)" : "rgba(255,255,255,0.82)";
      ctx.fillRect(lxPos - 2, lyPos - 11, tw + 4, 14);
      ctx.fillStyle = isDark ? "#f0f6fc" : "#111827";
      ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
      ctx.fillText(label, lxPos, lyPos);
    }
  }

  ctx.restore();

  // Plot border
  ctx.strokeStyle = isDark ? "#30363d" : "#d1d5db";
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD_L, PAD_T, PW, PH);

  // Caption
  const cap = document.getElementById("plot-caption");
  if (cap) {
    const hasCurve = pos_segments.length > 0 || neg_segments.length > 0;
    let capText = `Curve for n\u202f=\u202f${plotData.n_val}\u2002|\u2002`
      + `${sol_points.length} integer point${sol_points.length !== 1 ? "s" : ""} highlighted`;
    if (!hasCurve) {
      const s = plotData.curve_strategy || "";
      const reason = s === "brute3"          ? "equation is not polynomial in y \u2014 curve shape unavailable"
                   : s === "poly_y_no_real"   ? "no real branches in this x range"
                   : s === "ec_no_real"       ? "no real branches in this x range"
                   : "curve shape unavailable";
      capText += `\u2002\u2014\u2002\u26a0 ${reason}`;
    } else if (sol_points.length < allSolutions.length) {
      capText += ` (${allSolutions.length} total across all n)`;
    }
    cap.textContent = capText;
  }
}

function _fmtNum(v) {
  if (!Number.isFinite(v)) return "";
  const a = Math.abs(v);
  if (a >= 1e15)  return v.toExponential(2);
  if (a >= 10000) return v.toExponential(1);
  if (a >= 100)   return Math.round(v).toString();
  if (Number.isInteger(v)) return v.toString();
  return v.toFixed(1);
}

/** Zoom the current viewport in or out centered on the plot midpoint. */
function _zoomCenter(factor) {
  if (!viewport) return;
  const cx = (viewport.xMin + viewport.xMax) / 2;
  const cy = (viewport.yMin + viewport.yMax) / 2;
  viewport = {
    xMin: cx - (cx - viewport.xMin) * factor,
    xMax: cx + (viewport.xMax - cx) * factor,
    yMin: cy - (cy - viewport.yMin) * factor,
    yMax: cy + (viewport.yMax - cy) * factor,
  };
  renderPlot();
}

/** Attach zoom/pan mouse & touch events to the canvas once. */
function _setupCanvasInteraction() {
  if (_canvasEventsReady) return;
  const canvas = document.getElementById("curve-canvas");
  if (!canvas) return;
  _canvasEventsReady = true;

  const _getPadding = () => ({ PAD_L: 54, PAD_R: 20, PAD_T: 24, PAD_B: 38 });

  // ── Mouse-wheel zoom (centered on cursor) ──────────────────────────────
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    if (!viewport) return;
    const rect          = canvas.getBoundingClientRect();
    const W             = parseFloat(canvas.style.width)  || canvas.offsetWidth;
    const H             = parseFloat(canvas.style.height) || canvas.offsetHeight;
    const { PAD_L, PAD_R, PAD_T, PAD_B } = _getPadding();
    const PW = W - PAD_L - PAD_R, PH = H - PAD_T - PAD_B;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    // Only zoom when the cursor is inside the plot area
    if (mx < PAD_L || mx > PAD_L + PW || my < PAD_T || my > PAD_T + PH) return;
    const { xMin, xMax, yMin, yMax } = viewport;
    const cx = xMin + (mx - PAD_L) / PW * (xMax - xMin);
    const cy = yMax - (my - PAD_T) / PH * (yMax - yMin);
    const factor = e.deltaY > 0 ? 1.25 : 0.8;
    viewport = {
      xMin: cx - (cx - xMin) * factor, xMax: cx + (xMax - cx) * factor,
      yMin: cy - (cy - yMin) * factor, yMax: cy + (yMax - cy) * factor,
    };
    renderPlot();
  }, { passive: false });

  // ── Mouse drag — pan ────────────────────────────────────────────────────
  let _drag = null;
  canvas.style.cursor = "grab";

  canvas.addEventListener("mousedown", (e) => {
    if (!viewport || e.button !== 0) return;
    _drag = { x: e.clientX, y: e.clientY, vp: { ...viewport } };
    canvas.style.cursor = "grabbing";
    e.preventDefault();
  });

  canvas.addEventListener("mousemove", (e) => {
    if (!_drag) return;
    const W  = parseFloat(canvas.style.width)  || canvas.offsetWidth;
    const H  = parseFloat(canvas.style.height) || canvas.offsetHeight;
    const { PAD_L, PAD_R, PAD_T, PAD_B } = _getPadding();
    const PW = W - PAD_L - PAD_R, PH = H - PAD_T - PAD_B;
    const { xMin, xMax, yMin, yMax } = _drag.vp;
    const dx = (e.clientX - _drag.x) / PW * (xMax - xMin);
    const dy = (e.clientY - _drag.y) / PH * (yMax - yMin);
    viewport = { xMin: xMin - dx, xMax: xMax - dx, yMin: yMin + dy, yMax: yMax + dy };
    renderPlot();
  });

  const _endDrag = () => { _drag = null; canvas.style.cursor = "grab"; };
  canvas.addEventListener("mouseup",    _endDrag);
  canvas.addEventListener("mouseleave", _endDrag);

  // ── Touch — single-finger pan, two-finger pinch zoom ───────────────────
  let _lastTouches = null;

  canvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    _lastTouches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
  }, { passive: false });

  canvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (!viewport || !_lastTouches) return;
    const rect = canvas.getBoundingClientRect();
    const W    = parseFloat(canvas.style.width)  || canvas.offsetWidth;
    const H    = parseFloat(canvas.style.height) || canvas.offsetHeight;
    const { PAD_L, PAD_R, PAD_T, PAD_B } = _getPadding();
    const PW   = W - PAD_L - PAD_R, PH = H - PAD_T - PAD_B;
    const cur  = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
    const { xMin, xMax, yMin, yMax } = viewport;

    if (cur.length === 1 && _lastTouches.length >= 1) {
      // Pan
      const dx = (cur[0].x - _lastTouches[0].x) / PW * (xMax - xMin);
      const dy = (cur[0].y - _lastTouches[0].y) / PH * (yMax - yMin);
      viewport = { xMin: xMin - dx, xMax: xMax - dx, yMin: yMin + dy, yMax: yMax + dy };
      renderPlot();
    } else if (cur.length === 2 && _lastTouches.length === 2) {
      // Pinch zoom
      const oldD = Math.hypot(_lastTouches[0].x - _lastTouches[1].x,
                              _lastTouches[0].y - _lastTouches[1].y);
      const newD = Math.hypot(cur[0].x - cur[1].x, cur[0].y - cur[1].y);
      if (oldD < 1) { _lastTouches = cur; return; }
      const factor = oldD / newD;
      const midX   = (cur[0].x + cur[1].x) / 2 - rect.left;
      const midY   = (cur[0].y + cur[1].y) / 2 - rect.top;
      const cx     = xMin + Math.max(0, midX - PAD_L) / PW * (xMax - xMin);
      const cy     = yMax - Math.max(0, midY - PAD_T) / PH * (yMax - yMin);
      viewport = {
        xMin: cx - (cx - xMin) * factor, xMax: cx + (xMax - cx) * factor,
        yMin: cy - (cy - yMin) * factor, yMax: cy + (yMax - cy) * factor,
      };
      renderPlot();
    }
    _lastTouches = cur;
  }, { passive: false });

  canvas.addEventListener("touchend", (e) => {
    _lastTouches = Array.from(e.touches).map(t => ({ x: t.clientX, y: t.clientY }));
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   EXPORT  (CSV + PDF + LaTeX)
   ═══════════════════════════════════════════════════════════════════════════ */
const btnExportPdf   = document.getElementById("btn-export-pdf");
const btnExportLatex  = document.getElementById("btn-export-latex");
const btnTogglePlot   = document.getElementById("btn-toggle-plot");
const curveCanvas     = document.getElementById("curve-canvas");

// Toggle plot visibility
if (btnTogglePlot) {
  btnTogglePlot.addEventListener("click", () => {
    const pc = document.getElementById("plot-container");
    if (!pc) return;
    const hidden = pc.style.display === "none";
    pc.style.display = hidden ? "" : "none";
    btnTogglePlot.textContent = hidden
      ? ((typeof t === "function") ? t("btn-toggle-plot-hide") : "Hide plot")
      : ((typeof t === "function") ? t("btn-toggle-plot-show") : "Show plot");
    if (hidden && plotData) renderPlot();
  });
}

// Zoom controls
const btnZoomIn       = document.getElementById("btn-zoom-in");
const btnZoomOut      = document.getElementById("btn-zoom-out");
const btnZoomReset    = document.getElementById("btn-zoom-reset");
const btnToggleLabels = document.getElementById("btn-toggle-labels");

if (btnZoomIn)    btnZoomIn.addEventListener("click",    () => _zoomCenter(0.7));
if (btnZoomOut)   btnZoomOut.addEventListener("click",   () => _zoomCenter(1 / 0.7));
if (btnZoomReset) btnZoomReset.addEventListener("click", () => {
  if (plotData) {
    viewport = { xMin: plotData.x_min, xMax: plotData.x_max,
                 yMin: plotData.y_min, yMax: plotData.y_max };
    renderPlot();
  }
});
if (btnToggleLabels) {
  btnToggleLabels.addEventListener("click", () => {
    showPointLabels = !showPointLabels;
    btnToggleLabels.textContent = showPointLabels
      ? ((typeof t === "function") ? t("btn-hide-labels") : "Hide labels")
      : ((typeof t === "function") ? t("btn-show-labels") : "Show labels");
    if (plotData) renderPlot();
  });
}

// Re-render on window resize
window.addEventListener("resize", () => { if (plotData) renderPlot(); });

function buildExportMeta() {
  const isGen = currentSolverMode === "gen";
  const eqStr = isGen ? genEqIn.value.trim() : `y\u00b2 = ${exprInput.value.trim()}`;
  return { isGen, eqStr };
}

/* ── Shared helper: builds human-readable search-bounds block ── */
function buildBoundsLines(forLatex) {
  const m   = searchMeta;
  const isG = m.mode === "gen";
  const lines = [];

  // Equation
  if (forLatex) {
    const eqTex = m.equation
      .replace(/\*\*/g, "^").replace(/\*/g, " \\cdot ")
      .replace(/y\u00b2/g, "y^2");
    lines.push(`\\textbf{Equation:} $${eqTex}$`);
  } else {
    lines.push(`Equation: ${m.equation}`);
  }

  // n range
  const nDesc = m.nDenom && m.nDenom !== "1"
    ? ` (step 1/${m.nDenom})`
    : "";
  if (m.nMin === m.nMax) {
    lines.push(forLatex
      ? `\\textbf{Parameter } $n$\\textbf{:} fixed at $n = ${m.nMin}$${nDesc}`
      : `Parameter n: fixed at n = ${m.nMin}${nDesc}`);
  } else {
    lines.push(forLatex
      ? `\\textbf{Parameter } $n$\\textbf{:} $${m.nMin} \\leq n \\leq ${m.nMax}$${nDesc ? ` ${nDesc}` : ""}`
      : `Parameter n: ${m.nMin} \u2264 n \u2264 ${m.nMax}${nDesc}`);
  }
  if (m.nCount) {
    lines.push(forLatex
      ? `\\textbf{Curves searched:} ${m.nCount.toLocaleString()}`
      : `Curves searched: ${m.nCount.toLocaleString()}`);
  }

  // x range
  if (!isG) {
    switch (m.xMode) {
      case "fixed":
        lines.push(forLatex
          ? `\\textbf{Variable } $x$\\textbf{:} $${m.xMin} \\leq x \\leq ${m.xMax}$`
          : `Variable x: ${m.xMin} \u2264 x \u2264 ${m.xMax}`);
        break;
      case "autoscale":
        lines.push(forLatex
          ? `\\textbf{Variable } $x$\\textbf{:} auto-scaled, $|x| \\leq k|n|$ with $k = ${m.xScaleFactor}$`
          : `Variable x: auto-scaled, |x| \u2264 k|n| with k = ${m.xScaleFactor}`);
        break;
      case "window":
        lines.push(forLatex
          ? `\\textbf{Variable } $x$\\textbf{:} smart window centred on $${m.xCenterExpr}$, half-width $${m.xHalfWidth}$`
          : `Variable x: smart window centred on ${m.xCenterExpr} \u00b1 ${m.xHalfWidth}`);
        break;
      case "divisor":
        lines.push(forLatex
          ? `\\textbf{Variable } $x$\\textbf{:} divisor search, $x \\mid P(n) = ${m.xDivisorPoly}$, $|x| \\leq ${m.xDivisorMax}$`
          : `Variable x: divisor search, x | P(n) = ${m.xDivisorPoly}, |x| \u2264 ${m.xDivisorMax}`);
        break;
      case "exprrange":
        lines.push(forLatex
          ? `\\textbf{Variable } $x$\\textbf{:} expression range $[${m.xStartExpr},\\, ${m.xEndExpr}]$, step $${m.xStepExpr}$`
          : `Variable x: expression range [${m.xStartExpr}, ${m.xEndExpr}], step ${m.xStepExpr}`);
        break;
    }
  } else {
    lines.push(forLatex
      ? `\\textbf{Variable } $x$\\textbf{:} $${m.xMin} \\leq x \\leq ${m.xMax}$`
      : `Variable x: ${m.xMin} \u2264 x \u2264 ${m.xMax}`);
  }

  // y range (gen mode)
  if (isG && m.yMin !== null) {
    lines.push(forLatex
      ? `\\textbf{Variable } $y$\\textbf{:} $${m.yMin} \\leq y \\leq ${m.yMax}$`
      : `Variable y: ${m.yMin} \u2264 y \u2264 ${m.yMax}`);
  }

  // Height bound note
  const xAbsMax = isG ? (m.xMax ? Math.max(Math.abs(+m.xMax), Math.abs(+m.xMin)) : "?")
                      : (m.xMode === "fixed" ? Math.max(Math.abs(+m.xMax), Math.abs(+m.xMin)) : "\u221e (adaptive)");
  if (m.xMode === "fixed" || isG) {
    lines.push(forLatex
      ? `\\textbf{Naive height bound:} $|x| \\leq ${xAbsMax}$${isG && m.yMax !== null ? `, $|y| \\leq ${Math.max(Math.abs(+m.yMax), Math.abs(+m.yMin))}$` : ""}`
      : `Naive height bound: |x| \u2264 ${xAbsMax}${isG && m.yMax !== null ? `, |y| \u2264 ${Math.max(Math.abs(+m.yMax), Math.abs(+m.yMin))}` : ""}`);
    lines.push(forLatex
      ? `\\textbf{Search is exhaustive} within the stated bounds`
      : `Search is exhaustive within the stated bounds`);
  } else {
    lines.push(forLatex
      ? `\\textbf{Search is exhaustive} within the stated $x$-range for each $n$`
      : `Search is exhaustive within the stated x-range for each n`);
  }

  // Constraints
  const constraints = [];
  if (m.skipZeroN) constraints.push("n \u2260 0");
  if (m.skipZeroX) constraints.push("x \u2260 0");
  if (constraints.length) {
    lines.push(forLatex
      ? `\\textbf{Constraints:} $${constraints.join(",\\; ")}$`
      : `Constraints: ${constraints.join(", ")}`);
  }

  // Strategy
  const strategyLabel = {
    "": "fixed-range y²=f(n,x) scan",
    "fixed": "fixed-range y²=f(n,x) scan",
    "autoscale": "auto-scaled x range",
    "window": "smart window (exact big-integer)",
    "divisor": "divisor search",
    "exprrange": "expression range (exact big-integer)",
    "poly_y": "polynomial-in-y solve (general Diophantine)",
    "brute3": "3D brute-force (general Diophantine)",
    "brute2": "2-variable scan (general Diophantine)",
  }[m.strategy] || m.strategy;
  lines.push(forLatex
    ? `\\textbf{Search strategy:} ${strategyLabel}`
    : `Search strategy: ${strategyLabel}`);

  // Total evals
  if (m.totalEvals) {
    lines.push(forLatex
      ? `\\textbf{Total evaluations:} ${m.totalEvals.toLocaleString()}`
      : `Total evaluations: ${m.totalEvals.toLocaleString()}`);
  }

  // Compute time
  if (m.finishedAt && m.startedAt) {
    const ms = m.finishedAt - m.startedAt;
    const timeStr = ms < 1000 ? `${ms} ms`
                  : ms < 60000 ? `${(ms / 1000).toFixed(2)} s`
                  : `${Math.floor(ms / 60000)} min ${((ms % 60000) / 1000).toFixed(1)} s`;
    lines.push(forLatex
      ? `\\textbf{Compute time:} ${timeStr}`
      : `Compute time: ${timeStr}`);
  }

  return lines;
}

/* ── CSV ── */
btnExport.addEventListener("click", () => {
  if (!allSolutions.length) return;
  const { isGen, eqStr } = buildExportMeta();
  const rawEq = isGen ? genEqIn.value.trim() : exprInput.value.trim();
  const header = isGen ? "n,x,y,equation\n" : "n,x,y,curve_expr\n";
  const rows = allSolutions
    .map(({ n, x, y }) => `${n},${x},${y},"${rawEq.replace(/"/g, '""')}"`)
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (typeof t === "function") ? t("export-filename-csv") : "diophantine_solutions.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

/* ── PDF (browser print-to-PDF) ── */
btnExportPdf.addEventListener("click", () => {
  if (!allSolutions.length) return;
  const { eqStr } = buildExportMeta();
  const date  = new Date().toLocaleString();
  const count = allSolutions.length;
  const boundsLines = buildBoundsLines(false);

  let hdr = document.getElementById("print-header");
  if (!hdr) {
    hdr = document.createElement("div");
    hdr.id = "print-header";
    hdr.style.display = "none";
    const tableWrapEl = document.getElementById("table-wrap");
    tableWrapEl.parentNode.insertBefore(hdr, tableWrapEl);
  }
  const _intPts  = (typeof t === "function") ? t("export-int-points")    : "Integer Points";
  const _gen     = (typeof t === "function") ? t("export-generated")     : "Generated";
  const _solFnd  = (typeof t === "function") ? t("export-solutions-found") : "solution(s) found";
  const _srchPrm = (typeof t === "function") ? t("export-search-params") : "Search parameters";
  const _curvViz = (typeof t === "function") ? t("export-curve-viz")     : "Curve Visualization";

  hdr.innerHTML =
    `<h2>${_intPts} &mdash; ${escHtml(eqStr)}</h2>` +
    `<p class="ph-generated">${_gen}: ${escHtml(date)} &nbsp;&bull;&nbsp; ` +
    `${escHtml(count.toLocaleString())} ${escHtml(_solFnd)}</p>` +
    `<div class="ph-meta"><strong>${_srchPrm}</strong><ul>` +
    boundsLines.map(l => `<li>${escHtml(l)}</li>`).join("") +
    `</ul></div>`;

  // Include curve plot image if visible
  const _canvas = document.getElementById("curve-canvas");
  const _plotSec = document.getElementById("plot-section");
  if (_canvas && plotData && _plotSec && _plotSec.style.display !== "none") {
    const _imgData = _canvas.toDataURL("image/png");
    hdr.innerHTML +=
      '<div class="ph-plot"><strong>' + ((typeof t === "function") ? t("export-curve-viz") : "Curve Visualization") + '</strong>'
      + '<br/><img class="ph-plot-img" src="' + _imgData + '"/></div>';
  }
  window.print();
});

/* ── LaTeX (.tex file download) ── */
btnExportLatex.addEventListener("click", () => {
  if (!allSolutions.length) return;
  const { eqStr } = buildExportMeta();
  const date  = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const count = allSolutions.length;
  const boundsLines = buildBoundsLines(true);
  const isGen = currentSolverMode === "gen";

  // Equation in TeX
  const rawEq = isGen ? genEqIn.value.trim() : exprInput.value.trim();
  const eqTex = rawEq
    .replace(/\*\*/g, "^").replace(/\*/g, " \\cdot ")
    .replace(/y\u00b2/g, "y^2");

  // Solutions table rows
  const tableRows = allSolutions
    .map(({ n, x, y }) =>
      `  ${String(n).replace(/-/g, "$-$")} & ${String(x).replace(/-/g, "$-$")} & ${String(y).replace(/-/g, "$-$")} \\\\`)
    .join("\n");

  const _secEq  = (typeof t === "function") ? t("latex-sec-equation")   || "Equation"  : "Equation";
  const _secSP  = (typeof t === "function") ? t("latex-sec-search")     || "Search Parameters" : "Search Parameters";
  const _secRes = (typeof t === "function") ? t("latex-sec-results")    || "Results"   : "Results";
  const _secCV  = (typeof t === "function") ? t("latex-sec-curve")      || "Curve Visualization" : "Curve Visualization";
  const _secNt  = (typeof t === "function") ? t("latex-sec-notes")      || "Notes"     : "Notes";

  const tex = `% Elliptic Curve Solver — Integer Points Report
% Generated: ${date}
\\documentclass[12pt,a4paper]{article}
\\usepackage{amsmath,amssymb,booktabs,geometry,hyperref,pgfplots}
\\pgfplotsset{compat=1.18}
\\geometry{margin=25mm}
\\hypersetup{colorlinks=true,urlcolor=blue}
\\title{Integer Points on Diophantine Equation}
\\date{${date}}
\\author{Elliptic Curve Solver}
\\begin{document}
\\maketitle

\\section*{${_secEq}}
\\[
  ${eqTex}
\\]

\\section*{${_secSP}}
\\begin{itemize}
${boundsLines.map(l => `  \\item ${l}`).join("\n")}
\\end{itemize}

\\section*{${_secRes}}
${count === 0
  ? "\\textit{No integer solutions found within the stated bounds.}"
  : `${count.toLocaleString()} integer point${count !== 1 ? "s" : ""} found:

\\begin{center}
\\begin{tabular}{rrr}
\\toprule
$n$ & $x$ & $y$ \\\\
\\midrule
${tableRows}
\\bottomrule
\\end{tabular}
\\end{center}`}

\\section*{${_secCV}}
${searchMeta.pgfplots
  ? `\\medskip\n${searchMeta.pgfplots}\n\\medskip`
  : '\\textit{(Plot not available.)}'}

\\section*{${_secNt}}
\\begin{itemize}
  \\item All solutions listed have been verified by exact arithmetic.
  \\item The search is exhaustive within the bounds stated above;
        solutions outside these bounds may exist.
  \\item Tool: \\href{https://github.com/JAgbanwa/elliptic-curve-solver-app-or-website}{Elliptic Curve Solver} — powered by NumPy, SymPy, Flask.
\\end{itemize}

\\end{document}
`;

  const blob = new Blob([tex], { type: "text/x-tex" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = ((typeof t === "function") ? t("export-filename-tex") : "diophantine_solutions") + ".tex";
  a.click();
  URL.revokeObjectURL(a.href);
});

/* ═══════════════════════════════════════════════════════════════════════════
   EXAMPLE CARDS
   ═══════════════════════════════════════════════════════════════════════════ */
EXAMPLES.forEach((ex) => {
  const card = document.createElement("div");
  card.className = "example-card";
  card.setAttribute("role", "button");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-label", "Load example: " + ex.name);

  // render KaTeX inside the card (after the DOM is ready)
  const isGenMode = ex.solverMode === "gen";
  const modeBadge = isGenMode
    ? `<span class="example-mode-badge">General Dioph.</span>`
    : "";
  const exprLine  = isGenMode
    ? `<code>${escHtml(ex.eq || "")}</code>`
    : `<code>y\u00b2 = ${escHtml(ex.expr || "")}</code>`;
  card.innerHTML = `
    <div class="example-name">${escHtml(ex.name)}${modeBadge}</div>
    <div class="example-expr">${exprLine}</div>
    <div class="example-math" id="ex-math-${EXAMPLES.indexOf(ex)}"></div>
    <div class="example-desc">${escHtml(ex.desc)}</div>
    <div class="example-load">↗ Load this example</div>`;
  exampleGrid.appendChild(card);

  function loadExample() {
    // ── General Diophantine mode ──────────────────────────────────────────
    if (ex.solverMode === "gen") {
      switchSolverMode("gen");
      switchGenVarMode(/\by\b/.test(ex.eq || "") ? "3var" : "2var");
      genEqIn.value   = ex.eq || "";
      nMinIn.value    = ex.nm ?? 0;
      nMaxIn.value    = ex.nx ?? 0;
      nDenomIn.value  = ex.nd ?? 1;
      genXMinIn.value = ex.xm ?? -1000;
      genXMaxIn.value = ex.xx ?? 1000;
      genYMinIn.value = ex.ym ?? -1000;
      genYMaxIn.value = ex.yx ?? 1000;
      skipZeroNChk.checked = !!ex.skipZeroN;
      skipZeroXChk.checked = !!ex.skipZeroX;
      renderGenPreview(ex.eq || "");
      document.querySelector(".main-grid").scrollIntoView({ behavior: "smooth" });
      startSearch();
      return;
    }
    // ── y² = f(n,x) mode ─────────────────────────────────────────────────
    switchSolverMode("ec");
    switchECVarMode("3var");
    exprInput.value = ex.expr;
    nMinIn.value    = ex.nm;
    nMaxIn.value    = ex.nx;
    nDenomIn.value  = ex.nd;
    const mode = ex.xMode || (ex.autoScale ? "autoscale" : "fixed");
    xModeSelect.value = mode;
    xFixedRange.style.display   = mode === "fixed"     ? "block" : "none";
    xScaleWrap.style.display    = mode === "autoscale" ? "block" : "none";
    xWindowWrap.style.display   = mode === "window"    ? "block" : "none";
    xDivisorWrap.style.display  = mode === "divisor"   ? "block" : "none";
    xExprRangeWrap.style.display= mode === "exprrange" ? "block" : "none";
    if (mode === "autoscale") {
      xScaleFactorIn.value = ex.xScale || 15;
    } else if (mode === "window") {
      xCenterExprIn.value = ex.xCenterExpr || "12*n";
      xHalfWidthIn.value  = ex.xHalfWidth  || 5000;
    } else if (mode === "divisor") {
      xDivisorPolyIn.value = ex.xDivisorPoly || "";
      xDivisorMaxIn.value  = ex.xDivisorMax  || 1000000;
    } else if (mode === "exprrange") {
      xStartExprIn.value = ex.xStartExpr || "-100";
      xEndExprIn.value   = ex.xEndExpr   || "100";
      xStepExprIn.value  = ex.xStepExpr  || "1";
    } else {
      xMinIn.value = ex.xm ?? -1000;
      xMaxIn.value = ex.xx ?? 1000;
    }
    skipZeroNChk.checked = !!ex.skipZeroN;
    skipZeroXChk.checked = !!ex.skipZeroX;
    fetchLatex(ex.expr);
    document.querySelector(".main-grid").scrollIntoView({ behavior: "smooth" });
    startSearch();
  }

  card.addEventListener("click",   loadExample);
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") loadExample(); });
});

// Render KaTeX in example cards after the library is available
window.addEventListener("load", () => {
  EXAMPLES.forEach((ex, i) => {
    const el = document.getElementById("ex-math-" + i);
    if (!el) return;
    const raw = ex.solverMode === "gen" ? (ex.eq || "") : ("y^2 = " + (ex.expr || ""));
    try {
      katex.render(raw.replace(/\*\*/g, "^").replace(/\*/g, "\\cdot "), el, {
        throwOnError: false, displayMode: false,
      });
    } catch (_) {
      el.textContent = raw;
    }
  });
});
