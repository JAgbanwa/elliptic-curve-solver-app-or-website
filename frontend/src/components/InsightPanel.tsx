"use client";
import { useState, useCallback } from "react";

interface InsightCard {
  headline: string;
  body: string;
  formula?: string;
  intuition?: string;
}

interface InsightSection {
  id: string;
  title: string;
  icon: string;
  cards: InsightCard[];
}

interface InsightData {
  ok: boolean;
  sections?: InsightSection[];
  error?: string;
}

interface Props {
  expr: string;
  solutions: { n: string | number; x: string | number; y: string | number }[];
  nMin: string;
  nMax: string;
}

export default function InsightPanel({ expr, solutions, nMin, nMax }: Props) {
  const [open, setOpen]               = useState(false);
  const [loading, setLoading]         = useState(false);
  const [data, setData]               = useState<InsightData | null>(null);
  const [loadedFor, setLoadedFor]     = useState("");
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["curve", "strategy"]));
  const [openCards, setOpenCards]     = useState<Set<string>>(new Set());

  // Key that captures what we last analysed — used to detect stale data
  const currentKey = `${expr}::${solutions.length}`;
  const stale = data !== null && loadedFor !== currentKey;

  const load = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expr,
          solutions: solutions.slice(0, 200).map(s => ({
            n: String(s.n), x: String(s.x), y: String(s.y),
          })),
          n_min: nMin,
          n_max: nMax,
        }),
      });
      const d: InsightData = await res.json();
      setData(d);
      setLoadedFor(currentKey);
      setOpenSections(new Set(["curve", "strategy"]));
      setOpenCards(new Set());
    } catch (e) {
      setData({ ok: false, error: String(e) });
    } finally {
      setLoading(false);
    }
  }, [expr, solutions, nMin, nMax, loading, currentKey]);

  const handleOpen = useCallback(async () => {
    setOpen(true);
    if (!data || stale) await load();
  }, [data, stale, load]);

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
    <div className="insight-root">
      {/* ── Trigger bar ─────────────────────────────────────────────────── */}
      <button
        className={`insight-trigger${open ? " insight-trigger--open" : ""}`}
        onClick={open ? () => setOpen(false) : handleOpen}
      >
        <span className="insight-trigger-left">
          <span className="insight-trigger-icon">⊢</span>
          <span className="insight-trigger-label">Mathematician&apos;s Lens</span>
          {stale && !loading && (
            <span className="insight-stale-badge">refresh available</span>
          )}
        </span>
        <span className="insight-trigger-right">
          {open ? "Close ▴" : "Open ▾"}
        </span>
      </button>

      {/* ── Expanded panel ──────────────────────────────────────────────── */}
      {open && (
        <div className="insight-body">
          {loading && (
            <div className="insight-loading">
              <span className="insight-spinner">◐</span>
              Analysing curve structure…
            </div>
          )}

          {!loading && data?.error && (
            <div className="insight-error">{data.error}</div>
          )}

          {!loading && data?.ok && data.sections?.map(section => (
            <div key={section.id} className="insight-section">
              <button
                className={`insight-section-btn${openSections.has(section.id) ? " insight-section-btn--open" : ""}`}
                onClick={() => toggleSection(section.id)}
              >
                <span className="insight-section-icon">{section.icon}</span>
                <span className="insight-section-title">{section.title}</span>
                <span className="insight-section-count">
                  {section.cards.length} insight{section.cards.length !== 1 ? "s" : ""}
                </span>
                <span className="insight-section-arrow">
                  {openSections.has(section.id) ? "−" : "+"}
                </span>
              </button>

              {openSections.has(section.id) && (
                <div className="insight-cards">
                  {section.cards.map((card, ci) => {
                    const key = `${section.id}-${ci}`;
                    const expanded = openCards.has(key);
                    return (
                      <div
                        key={key}
                        className={`insight-card${expanded ? " insight-card--open" : ""}`}
                      >
                        <button
                          className="insight-card-btn"
                          onClick={() => toggleCard(key)}
                        >
                          <span className="insight-card-headline">{card.headline}</span>
                          <span className="insight-card-arrow">{expanded ? "−" : "+"}</span>
                        </button>

                        {expanded && (
                          <div className="insight-card-body">
                            <p className="insight-card-text">{card.body}</p>
                            {card.formula && (
                              <div className="insight-formula">{card.formula}</div>
                            )}
                            {card.intuition && (
                              <div className="insight-intuition">
                                <span className="insight-intuition-label">The intuition: </span>
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

          {!loading && data?.ok && (
            <button className="insight-refresh-btn" onClick={load}>
              ↺ Refresh analysis
            </button>
          )}
        </div>
      )}
    </div>
  );
}
