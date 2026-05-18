"use client";
import "./explore.css";
import { useState, useCallback, useMemo, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import { MemoryWidget } from "@/components/MemoryWidget";

/* ── Types ──────────────────────────────────────────────────────────────────── */
interface ExploreCard {
  headline: string;
  body: string;
  formula?: string;
  intuition?: string;
}
interface ExploreSection {
  id: string;
  title: string;
  icon: string;
  cards: ExploreCard[];
}
interface ExploreResult {
  ok: boolean;
  sections?: ExploreSection[];
  vars?: string[];
  param?: string;
  error?: string;
}

/* ── Quick example presets ──────────────────────────────────────────────────── */
const EXAMPLES = [
  { label: "Sum of 3 cubes",      eq: "x**3 + y**3 + z**3 - k",    param: "k" },
  { label: "Pythagorean triples", eq: "x**2 + y**2 - z**2",        param: "" },
  { label: "Pell equation",       eq: "x**2 - 2*y**2 - 1",         param: "" },
  { label: "Taxicab numbers",     eq: "x**3 + y**3 - z**3 - w**3", param: "" },
  { label: "Mordell curves",      eq: "y**2 - x**3 - k",           param: "k" },
  { label: "Markov equation",     eq: "x**2 + y**2 + z**2 - 3*x*y*z", param: "" },
  { label: "Congruent number",    eq: "y**2 - x**3 + n**2*x",      param: "n" },
  { label: "Fermat n=4",          eq: "x**4 + y**4 - z**2",        param: "" },
];

/* ── Icons ───────────────────────────────────────────────────────────────────── */
const GithubIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0a12 12 0 0 0-3.79 23.39c.6.11.82-.26.82-.58v-2.17c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.8 1.3 3.49 1 .11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.31-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.24 2.87.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.81 5.63-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12 12 0 0 0 12 0z"/>
  </svg>
);

/* ── Main page component ─────────────────────────────────────────────────────── */
export default function ExplorePage() {
  const { theme, toggle } = useTheme();
  const searchParams = useSearchParams();

  // Input state — seed from ?eq= query param if present
  const [equation, setEquation]   = useState(() => searchParams.get("eq") ?? "x**3 + y**3 + z**3 - k");
  const [param, setParam]         = useState("k");
  const [bound, setBound]         = useState(12);

  // Result state
  const [result, setResult]           = useState<ExploreResult | null>(null);
  const [loading, setLoading]         = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(["profile", "obstruction"])
  );
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());

  // Auto-run when arriving via ?eq= deep-link
  useEffect(() => {
    const eq = searchParams.get("eq");
    if (eq) { handleExplore(); }
    // Only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Extract single-letter variable names from the equation for MemoryWidget
  const detectedVars = useMemo(() => {
    const names = [...new Set((equation.match(/\b[a-zA-Z]\b/g) ?? []))].filter(
      (n) => !["e", "E"].includes(n)
    );
    return names.sort();
  }, [equation]);

  const handleExplore = useCallback(async () => {
    if (!equation.trim() || loading) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/explore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equation, param, bound }),
      });
      const data: ExploreResult = await res.json();
      setResult(data);
      if (data.ok) {
        setOpenSections(new Set(["profile", "obstruction"]));
        setOpenCards(new Set());
      }
    } catch (e) {
      setResult({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  }, [equation, param, bound, loading]);

  const loadExample = (ex: (typeof EXAMPLES)[0]) => {
    setEquation(ex.eq);
    setParam(ex.param);
    setResult(null);
  };

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleCard = (key: string) => {
    setOpenCards(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="explore-page">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="explore-header">
        <div className="explore-header-inner">
          <Link href="/" className="explore-logo">
            <span className="explore-logo-icon">∇</span>
            <span>
              <span className="explore-logo-title">Equation Explorer</span>
              <span className="explore-logo-sub">Diophantine research copilot</span>
            </span>
          </Link>
          <nav className="explore-nav">
            <Link href="/app" className="explore-nav-link">← Solver</Link>
            <Link href="/conjecture" className="explore-nav-link">Conjecture</Link>
            <Link href="/memory" className="explore-nav-link">Memory</Link>
            <a
              href="https://github.com/JAgbanwa/elliptic-curve-solver-app-or-website"
              className="explore-nav-link"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: "5px" }}
            >
              <GithubIcon /> GitHub
            </a>
            <button className="explore-theme-btn" onClick={toggle}>
              {theme === "dark" ? "Light" : "Dark"}
            </button>
          </nav>
        </div>
      </header>

      {/* ── Main ────────────────────────────────────────────────────────── */}
      <main className="explore-main">

        {/* Hero */}
        <div className="explore-hero">
          <h1 className="explore-title">∇ Explore the Problem Space</h1>
          <p className="explore-subtitle">
            Enter any Diophantine equation. Get congruence obstructions, small
            solutions, structural classification, and theory connections —
            computed entirely by SymPy, zero API cost.
          </p>
        </div>

        {/* Input block */}
        <div className="explore-input-block">
          {/* Equation input */}
          <div className="explore-eq-row">
            <label className="explore-label">
              Equation &mdash; use Python syntax (** for powers, * for multiply, = supported)
            </label>
            <input
              className="explore-eq-input"
              value={equation}
              onChange={e => setEquation(e.target.value)}
              placeholder="e.g.  x**3 + y**3 + z**3 = k"
              onKeyDown={e => e.key === "Enter" && handleExplore()}
              spellCheck={false}
            />
          </div>

          {/* Controls */}
          <div className="explore-controls-row">
            <div className="explore-field">
              <label className="explore-label">Parameter (RHS variable)</label>
              <input
                className="explore-small-input"
                value={param}
                onChange={e => setParam(e.target.value.trim())}
                placeholder="e.g. k"
                maxLength={2}
              />
            </div>
            <div className="explore-field">
              <label className="explore-label">Search bound</label>
              <input
                type="number"
                className="explore-small-input"
                value={bound}
                min={3}
                max={500}
                onChange={e =>
                  setBound(Math.max(3, Math.min(500, parseInt(e.target.value) || 12)))
                }
              />
            </div>
            <button
              className="explore-btn"
              onClick={handleExplore}
              disabled={loading || !equation.trim()}
            >
              {loading ? "Analysing…" : "Explore →"}
            </button>
          </div>

          {/* Examples */}
          <div>
            <div className="explore-examples-label">Quick examples</div>
            <div className="explore-examples">
              {EXAMPLES.map(ex => (
                <button
                  key={ex.eq}
                  className="explore-example-btn"
                  onClick={() => loadExample(ex)}
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Memory widget */}
        <MemoryWidget vars={detectedVars} equation={equation} />

        {/* Results */}
        {(loading || result) && (
          <div className="explore-results">
            {/* Meta bar */}
            {!loading && result?.ok && result.vars && (
              <div className="explore-results-meta">
                <span>Variables detected:</span>
                {result.vars.map(v => (
                  <span
                    key={v}
                    className={`explore-var-chip${v === result.param ? " explore-var-chip--param" : ""}`}
                  >
                    {v}{v === result.param ? " (param)" : ""}
                  </span>
                ))}
              </div>
            )}

            {loading && (
              <div className="explore-loading">
                <span className="explore-spinner">◐</span>
                Computing obstructions &amp; searching for solutions…
              </div>
            )}

            {!loading && result?.error && (
              <div className="explore-error">{result.error}</div>
            )}

            {!loading && result?.ok && result.sections?.map(section => (
              <div key={section.id} className="explore-section">
                <button
                  className={`explore-section-btn${openSections.has(section.id) ? " explore-section-btn--open" : ""}`}
                  onClick={() => toggleSection(section.id)}
                >
                  <span className="explore-section-icon">{section.icon}</span>
                  <span className="explore-section-title">{section.title}</span>
                  <span className="explore-section-count">
                    {section.cards.length} insight{section.cards.length !== 1 ? "s" : ""}
                  </span>
                  <span className="explore-section-arrow">
                    {openSections.has(section.id) ? "−" : "+"}
                  </span>
                </button>

                {openSections.has(section.id) && (
                  <div className="explore-cards">
                    {section.cards.map((card, ci) => {
                      const key = `${section.id}-${ci}`;
                      const expanded = openCards.has(key);
                      return (
                        <div
                          key={key}
                          className={`explore-card${expanded ? " explore-card--open" : ""}`}
                        >
                          <button
                            className="explore-card-btn"
                            onClick={() => toggleCard(key)}
                          >
                            <span className="explore-card-headline">{card.headline}</span>
                            <span className="explore-card-arrow">{expanded ? "−" : "+"}</span>
                          </button>
                          {expanded && (
                            <div className="explore-card-body">
                              <p className="explore-card-text">{card.body}</p>
                              {card.formula && (
                                <div className="explore-formula">{card.formula}</div>
                              )}
                              {card.intuition && (
                                <div className="explore-intuition">
                                  <span className="explore-intuition-label">The intuition: </span>
                                  {card.intuition}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      <footer className="explore-footer">
        Flask · SymPy · Next.js
      </footer>
    </div>
  );
}
