"use client";
import "./conjecture.css";
import { useState, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { useMemory, type MemoryType } from "@/hooks/useMemory";

/* ── Types ────────────────────────────────────────────────────────────────── */
interface Conjecture {
  type: "modular" | "invariant" | "asymptotic" | "structural";
  confidence: "strong" | "moderate" | "weak";
  statement: string;
  evidence: string;
  formula: string;
}
interface ConjectureResult {
  ok: boolean;
  conjectures: Conjecture[];
  solution_count: number;
  var_names: string[];
  sample: Record<string, number>[];
  message?: string;
  error?: string;
}

/* ── Constants ────────────────────────────────────────────────────────────── */
const CONFIDENCE = {
  strong:   { stars: "★★★", label: "STRONG",   cls: "conj-card--strong" },
  moderate: { stars: "★★☆", label: "MODERATE", cls: "conj-card--moderate" },
  weak:     { stars: "★☆☆", label: "WEAK",     cls: "conj-card--weak" },
} as const;

const TYPE_LABELS: Record<string, string> = {
  modular:    "⊕ Modular",
  invariant:  "∞ Invariant",
  asymptotic: "∿ Asymptotic",
  structural: "◇ Structural",
};

/* Map conjecture type → memory type */
const TO_MEM_TYPE: Record<string, MemoryType> = {
  modular:    "result",
  invariant:  "lemma",
  asymptotic: "result",
  structural: "lemma",
};

const LOADING_MSGS = [
  "Collecting integer solutions…",
  "Analyzing modular patterns…",
  "Testing residue classes…",
  "Computing growth rates…",
  "Detecting invariants…",
  "Generating conjectures…",
];

const EXAMPLES = [
  { label: "x²+y²=n",        eq: "x**2 + y**2 - n",            param: "n",  bound: 50 },
  { label: "x²+xy+y²=n",     eq: "x**2 + x*y + y**2 - n",      param: "n",  bound: 40 },
  { label: "x³+y³=n",        eq: "x**3 + y**3 - n",            param: "n",  bound: 30 },
  { label: "x²+y²+z²=n",     eq: "x**2 + y**2 + z**2 - n",    param: "n",  bound: 20 },
  { label: "x²-2y²=1",       eq: "x**2 - 2*y**2 - 1",         param: "",   bound: 50 },
  { label: "x²-ny²=1 (Pell)", eq: "x**2 - n*y**2 - 1",         param: "n",  bound: 30 },
  { label: "x⁴+y⁴=z²",       eq: "x**4 + y**4 - z**2",        param: "",   bound: 20 },
  { label: "x²-y³=k",        eq: "x**2 - y**3 - k",           param: "k",  bound: 25 },
];

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function ConjecturePage() {
  const { theme, toggle } = useTheme();
  const { add } = useMemory();

  const [equation, setEquation] = useState("x**2 + y**2 - n");
  const [param, setParam]       = useState("n");
  const [bound, setBound]       = useState(50);

  const [loading, setLoading]   = useState(false);
  const [loadMsg, setLoadMsg]   = useState(LOADING_MSGS[0]);
  const [result, setResult]     = useState<ConjectureResult | null>(null);
  const [error, setError]       = useState<string | null>(null);

  const [openEvidence, setOpenEvidence] = useState<Set<number>>(new Set());
  const [showSample, setShowSample]     = useState(false);
  const [savedIdx, setSavedIdx]         = useState<Set<number>>(new Set());

  const msgTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── Loading message cycling ── */
  const startMsgCycle = useCallback(() => {
    let i = 0;
    setLoadMsg(LOADING_MSGS[0]);
    msgTimer.current = setInterval(() => {
      i = (i + 1) % LOADING_MSGS.length;
      setLoadMsg(LOADING_MSGS[i]);
    }, 1400);
  }, []);

  const stopMsgCycle = useCallback(() => {
    if (msgTimer.current) { clearInterval(msgTimer.current); msgTimer.current = null; }
  }, []);

  useEffect(() => () => stopMsgCycle(), [stopMsgCycle]);

  /* ── Run conjecture engine ── */
  const handleRun = useCallback(async () => {
    if (!equation.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setOpenEvidence(new Set());
    setSavedIdx(new Set());
    setShowSample(false);
    startMsgCycle();

    try {
      const res = await fetch("/api/conjecture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equation, param, bound }),
      });
      const json: ConjectureResult = await res.json();
      if (!json.ok) {
        setError(json.error ?? "Unknown error");
      } else {
        setResult(json);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      stopMsgCycle();
      setLoading(false);
    }
  }, [equation, param, bound, loading, startMsgCycle, stopMsgCycle]);

  /* ── Save conjecture to memory ── */
  const saveToMemory = useCallback(
    (c: Conjecture, idx: number) => {
      const vars = [...new Set((c.formula + " " + c.statement).match(/\b[a-zA-Z]\b/g) ?? [])].filter(
        (v) => !["e", "E"].includes(v)
      );
      add({
        type: TO_MEM_TYPE[c.type] ?? "result",
        title: c.statement.slice(0, 80),
        content: `${c.formula}\n\n${c.evidence}`,
        variables: vars,
        pinned: c.confidence === "strong",
      });
      setSavedIdx((prev) => new Set(prev).add(idx));
    },
    [add]
  );

  const toggleEvidence = (idx: number) =>
    setOpenEvidence((prev) => {
      const s = new Set(prev);
      s.has(idx) ? s.delete(idx) : s.add(idx);
      return s;
    });

  return (
    <div className="conj-page">
      {/* ── Header ── */}
      <header className="conj-header">
        <div className="conj-header-inner">
          <Link href="/" className="conj-logo">
            <span className="conj-logo-icon">◈</span>
            <span>
              <span className="conj-logo-title">Conjecture Engine</span>
              <span className="conj-logo-sub">research-grade pattern detection</span>
            </span>
          </Link>
          <nav className="conj-nav">
            <Link href="/explore" className="conj-nav-link">Explore</Link>
            <Link href="/memory"  className="conj-nav-link">Memory</Link>
            <Link href="/app"     className="conj-nav-link">Solver</Link>
            <a
              href="https://github.com/JAgbanwa/elliptic-curve-solver-app-or-website"
              className="conj-nav-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <button className="conj-theme-btn" onClick={toggle}>
              {theme === "dark" ? "Light" : "Dark"}
            </button>
          </nav>
        </div>
      </header>

      <main className="conj-main">
        {/* ── Hero ── */}
        <div className="conj-hero">
          <h1 className="conj-title">◈ Conjecture Engine</h1>
          <p className="conj-subtitle">
            Enter any Diophantine equation. The engine scans integer solutions,
            detects patterns, and surfaces plausible mathematical conjectures —
            modular obstructions, invariants, asymptotics, and structure.
          </p>
          <ul className="conj-bullets">
            <li>Modular obstructions — which residue classes are unsolvable?</li>
            <li>GCD invariants — are all solutions primitive?</li>
            <li>Asymptotic density — how does the solution count grow?</li>
            <li>Inter-variable relationships — parity, sum divisibility</li>
          </ul>
        </div>

        {/* ── Input block ── */}
        <div className="conj-input-block">
          <label className="conj-input-label">Diophantine equation</label>
          <input
            className="conj-eq-input"
            value={equation}
            onChange={(e) => setEquation(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRun()}
            placeholder="e.g. x**2 + y**2 - n  or  x**3 + y**3 = z**3"
            spellCheck={false}
          />

          <div className="conj-params-row">
            <div className="conj-param-field conj-param-field--sm">
              <label className="conj-input-label">Param variable</label>
              <input
                className="conj-param-input"
                value={param}
                onChange={(e) => setParam(e.target.value.trim())}
                placeholder="e.g. n"
                spellCheck={false}
              />
            </div>
            <div className="conj-param-field conj-param-field--bound">
              <label className="conj-input-label">Bound</label>
              <input
                className="conj-param-input"
                type="number"
                min={5}
                max={200}
                value={bound}
                onChange={(e) => setBound(Math.max(5, Math.min(200, +e.target.value)))}
              />
            </div>
            <div className="conj-param-field" style={{ flex: 1 }} />
            <button
              className="conj-run-btn"
              onClick={handleRun}
              disabled={loading || !equation.trim()}
            >
              {loading ? "Running…" : "Generate Conjectures ▶"}
            </button>
          </div>

          <span className="conj-examples-label">Examples</span>
          <div className="conj-examples-row">
            {EXAMPLES.map((ex) => (
              <button
                key={ex.label}
                className="conj-example-btn"
                onClick={() => {
                  setEquation(ex.eq);
                  setParam(ex.param);
                  setBound(ex.bound);
                }}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="conj-loading">
            <p className="conj-loading-msg">{loadMsg}</p>
            <div className="conj-loading-bar" />
          </div>
        )}

        {/* ── Error ── */}
        {error && <div className="conj-error">Error: {error}</div>}

        {/* ── Results ── */}
        {result && !loading && (
          <div className="conj-results">
            {/* Summary */}
            <div className="conj-summary">
              <span className="conj-summary-stat">
                <strong>{result.solution_count.toLocaleString()}</strong> solutions analyzed
              </span>
              <span className="conj-summary-stat">
                <strong>{result.conjectures.length}</strong> conjecture{result.conjectures.length !== 1 ? "s" : ""} found
              </span>
              {result.var_names.length > 0 && (
                <span className="conj-summary-stat">
                  variables: <strong>{result.var_names.join(", ")}</strong>
                </span>
              )}
            </div>

            {/* Sample solutions */}
            {result.sample.length > 0 && (
              <div className="conj-sample">
                <button
                  className="conj-sample-toggle"
                  onClick={() => setShowSample((v) => !v)}
                >
                  <span>Sample solutions (first {result.sample.length})</span>
                  <span>{showSample ? "−" : "+"}</span>
                </button>
                {showSample && (
                  <div className="conj-sample-body">
                    <div className="conj-sample-list">
                      {result.sample.map((sol, i) => (
                        <span key={i} className="conj-sample-item">
                          ({Object.entries(sol).map(([k, v]) => `${k}=${v}`).join(", ")})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Empty message */}
            {result.conjectures.length === 0 ? (
              <div className="conj-empty">
                <p>No strong patterns detected in {result.solution_count} solutions.</p>
                {result.message && <p style={{ marginTop: 8, fontSize: ".75rem" }}>{result.message}</p>}
                <p style={{ marginTop: 8 }}>
                  Try a larger bound, or visit{" "}
                  <Link href="/explore" style={{ color: "inherit" }}>Explore</Link>{" "}
                  for congruence obstruction analysis.
                </p>
              </div>
            ) : (
              <>
                <p className="conj-section-title">
                  Discovered conjectures — sorted by evidence strength
                </p>
                <div className="conj-list">
                  {result.conjectures.map((c, idx) => {
                    const conf = CONFIDENCE[c.confidence] ?? CONFIDENCE.weak;
                    const isSaved = savedIdx.has(idx);
                    const evidOpen = openEvidence.has(idx);
                    return (
                      <div key={idx} className={`conj-card ${conf.cls}`}>
                        <div className="conj-card-head">
                          <span className="conj-confidence">
                            {conf.stars} {conf.label}
                          </span>
                          <span className="conj-type-badge">
                            {TYPE_LABELS[c.type] ?? c.type}
                          </span>
                          <button
                            className={`conj-save-btn${isSaved ? " conj-save-btn--saved" : ""}`}
                            onClick={() => !isSaved && saveToMemory(c, idx)}
                            disabled={isSaved}
                          >
                            {isSaved ? "◉ Saved" : "◉ Save to Memory"}
                          </button>
                        </div>
                        <p className="conj-statement">{c.statement}</p>
                        {c.formula && (
                          <code className="conj-formula">{c.formula}</code>
                        )}
                        <button
                          className="conj-evidence-toggle"
                          onClick={() => toggleEvidence(idx)}
                        >
                          {evidOpen ? "▾ Hide evidence" : "▸ Show evidence"}
                        </button>
                        {evidOpen && (
                          <div className="conj-evidence">{c.evidence}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </main>

      <footer className="conj-footer">
        all computation by SymPy · no external API · results are data-driven conjectures, not proofs
      </footer>
    </div>
  );
}
