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
const skipZeroNChk   = document.getElementById("skip-zero-n");
const skipZeroXChk   = document.getElementById("skip-zero-x");

/* ═══════════════════════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════════════════════ */
let evtSource   = null;   // active EventSource
let allSolutions= [];     // [{n, x, y}, …]
let rowIndex    = 0;      // global row counter for table
let nTotalCount = 0;      // total n-values in last search (for n-summary)
let lastGroupN  = null;   // n-value of the current table group header

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
  solCount.textContent = "0 solutions";
  tableWrap.style.display = "none";
  emptyState.style.display = "none";
  progressArea.style.display = "none";
  progressFill.style.width = "0%";
  const ns = document.getElementById("n-summary-section");
  if (ns) ns.style.display = "none";
  const wb = document.getElementById("search-warning");
  if (wb) { wb.style.display = "none"; wb.textContent = ""; }
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
      <td class="cell-valid">✓ verified</td>`;
    resultsBody.appendChild(tr);
  });
  // keep newest in view
  resultsBody.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function escHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildSearchURL() {
  const p = new URLSearchParams({
    expr:    exprInput.value.trim(),
    n_min:   nMinIn.value,
    n_max:   nMaxIn.value,
    n_denom: nDenomIn.value,
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
  setStatus("Starting search…", "status-running");
  progressArea.style.display = "block";
  btnSearch.disabled = true;
  btnStop.disabled   = false;

  evtSource = new EventSource(buildSearchURL());

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
        if (msg.x_scale > 0) {
          setStatus(
            `Searching ${msg.n_count.toLocaleString()} n-values, auto-scaled x (k=${msg.x_scale})`
            + ` — ${msg.total_evals.toLocaleString()} evaluations…`,
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
        solCount.textContent =
          `${allSolutions.length} solution${allSolutions.length !== 1 ? "s" : ""}`;
        break;

      case "done":
        evtSource.close(); evtSource = null;
        btnSearch.disabled = false;
        btnStop.disabled   = true;
        progressFill.style.width = "100%";
        renderNSummary(msg.n_with_solutions || [], nTotalCount);
        if (allSolutions.length === 0) {
          emptyState.style.display  = "block";
          tableWrap.style.display  = "none";
          setStatus("Search complete — no integer points found.", "status-done");
        } else {
          setStatus(
            `Done! Found ${allSolutions.length} integer point${allSolutions.length !== 1 ? "s" : ""}.`,
            "status-done",
          );
        }
        progressStats.textContent =
          `Complete — ${msg.total_solutions} total solution${msg.total_solutions !== 1 ? "s" : ""}.`;
        break;

      case "error":
        evtSource.close(); evtSource = null;
        btnSearch.disabled = false;
        btnStop.disabled   = true;
        setStatus("Error: " + msg.message, "status-error");
        progressArea.style.display = "none";
        break;
    }
  };

  evtSource.onerror = () => {
    // Only treat as an error if the stream wasn't already closed cleanly by
    // the 'done' handler (which sets evtSource = null before the server drops
    // the connection, causing browsers to fire onerror spuriously).
    if (evtSource) {
      evtSource.close();
      evtSource = null;
      btnSearch.disabled = false;
      btnStop.disabled   = true;
      setStatus("Connection error — search interrupted.", "status-error");
    }
  };
}

function stopSearch() {
  if (evtSource) { evtSource.close(); evtSource = null; }
  btnSearch.disabled = false;
  btnStop.disabled   = true;
  setStatus("Search stopped by user.", "status-idle");
  progressFill.style.width = "0%";
}

btnSearch.addEventListener("click", startSearch);
btnStop.addEventListener("click",   stopSearch);
btnClear.addEventListener("click",  () => {
  stopSearch();
  clearResults();
  setStatus('Enter a curve expression and click Run Search.', "status-idle");
});

xModeSelect.addEventListener("change", () => {
  const m = xModeSelect.value;
  xFixedRange.style.display  = m === "fixed"     ? "block" : "none";
  xScaleWrap.style.display   = m === "autoscale" ? "block" : "none";
  xWindowWrap.style.display  = m === "window"    ? "block" : "none";
  xDivisorWrap.style.display = m === "divisor"   ? "block" : "none";
});

/* ═══════════════════════════════════════════════════════════════════════════
   CSV EXPORT
   ═══════════════════════════════════════════════════════════════════════════ */
btnExport.addEventListener("click", () => {
  if (!allSolutions.length) return;
  const expr = exprInput.value.trim();
  const header = "n,x,y,curve_expr\n";
  const rows = allSolutions
    .map(({ n, x, y }) => `${n},${x},${y},"${expr.replace(/"/g, '""')}"`)
    .join("\n");
  const blob = new Blob([header + rows], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "elliptic_curve_solutions.csv";
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
  card.innerHTML = `
    <div class="example-name">${escHtml(ex.name)}</div>
    <div class="example-expr"><code>y² = ${escHtml(ex.expr)}</code></div>
    <div class="example-math" id="ex-math-${EXAMPLES.indexOf(ex)}"></div>
    <div class="example-desc">${escHtml(ex.desc)}</div>
    <div class="example-load">↗ Load this example</div>`;
  exampleGrid.appendChild(card);

  function loadExample() {
    exprInput.value = ex.expr;
    nMinIn.value    = ex.nm;
    nMaxIn.value    = ex.nx;
    nDenomIn.value  = ex.nd;
    const mode = ex.xMode || (ex.autoScale ? "autoscale" : "fixed");
    xModeSelect.value = mode;
    xFixedRange.style.display  = mode === "fixed"     ? "block" : "none";
    xScaleWrap.style.display   = mode === "autoscale" ? "block" : "none";
    xWindowWrap.style.display  = mode === "window"    ? "block" : "none";
    xDivisorWrap.style.display = mode === "divisor"   ? "block" : "none";
    if (mode === "autoscale") {
      xScaleFactorIn.value = ex.xScale || 15;
    } else if (mode === "window") {
      xCenterExprIn.value = ex.xCenterExpr || "12*n";
      xHalfWidthIn.value  = ex.xHalfWidth  || 5000;
    } else if (mode === "divisor") {
      xDivisorPolyIn.value = ex.xDivisorPoly || "";
      xDivisorMaxIn.value  = ex.xDivisorMax  || 1000000;
    } else {
      xMinIn.value = ex.xm ?? -100;
      xMaxIn.value = ex.xx ?? 100;
    }
    skipZeroNChk.checked = !!ex.skipZeroN;
    skipZeroXChk.checked = !!ex.skipZeroX;
    fetchLatex(ex.expr);
    document.querySelector(".main-grid").scrollIntoView({ behavior: "smooth" });
  }

  card.addEventListener("click",   loadExample);
  card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") loadExample(); });
});

// Render KaTeX in example cards after the library is available
window.addEventListener("load", () => {
  EXAMPLES.forEach((ex, i) => {
    const el = document.getElementById("ex-math-" + i);
    if (!el) return;
    try {
      katex.render("y^2 = " + ex.expr.replace(/\*\*/g, "^").replace(/\*/g, "\\cdot "), el, {
        throwOnError: false, displayMode: false,
      });
    } catch (_) {
      el.textContent = "y² = " + ex.expr;
    }
  });
});
