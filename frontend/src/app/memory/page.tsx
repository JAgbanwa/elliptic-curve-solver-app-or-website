"use client";
import "./memory.css";
import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import {
  useMemory,
  TYPE_META,
  type MathMemory,
  type MemoryType,
} from "@/hooks/useMemory";

const ALL_TYPES = Object.keys(TYPE_META) as MemoryType[];

/* ── Blank form state ─────────────────────────────────────────────────────── */
const BLANK = {
  type: "assumption" as MemoryType,
  title: "",
  content: "",
  variables: "",
  pinned: false,
};

/* ── Main page ────────────────────────────────────────────────────────────── */
export default function MemoryPage() {
  const { theme, toggle } = useTheme();
  const { memories, ready, add, update, remove, togglePin, exportText, clearAll } =
    useMemory();

  /* Form state (shared add / edit) */
  const [showForm, setShowForm]     = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [form, setForm]             = useState(BLANK);

  /* Filter state */
  const [search, setSearch]         = useState("");
  const [typeFilter, setTypeFilter] = useState<MemoryType | "all">("all");

  /* Confirm-clear state */
  const [confirmClear, setConfirmClear] = useState(false);

  /* ── Derived stats ── */
  const pinCount = memories.filter((m) => m.pinned).length;

  /* ── Filtered list (pinned first) ── */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return memories
      .filter((m) => {
        if (typeFilter !== "all" && m.type !== typeFilter) return false;
        if (q && !m.title.toLowerCase().includes(q) && !m.content.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updated - a.updated;
      });
  }, [memories, search, typeFilter]);

  /* ── Form helpers ── */
  const openAdd = () => {
    setEditingId(null);
    setForm(BLANK);
    setShowForm(true);
  };

  const openEdit = (m: MathMemory) => {
    setEditingId(m.id);
    setForm({
      type: m.type,
      title: m.title,
      content: m.content,
      variables: m.variables.join(", "),
      pinned: m.pinned,
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(BLANK);
  };

  const saveForm = useCallback(() => {
    if (!form.title.trim()) return;
    const vars = form.variables
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const fields = {
      type: form.type,
      title: form.title.trim(),
      content: form.content.trim(),
      variables: vars,
      pinned: form.pinned,
    };
    if (editingId) {
      update(editingId, fields);
    } else {
      add(fields);
    }
    cancelForm();
  }, [form, editingId, add, update]);

  const handleExport = () => {
    const text = exportText();
    navigator.clipboard.writeText(text).then(() => alert("Copied to clipboard!"));
  };

  if (!ready) return null;

  return (
    <div className="mem-page">
      {/* ── Header ── */}
      <header className="mem-header">
        <div className="mem-header-inner">
          <Link href="/" className="mem-logo">
            <span className="mem-logo-icon">◉</span>
            <span>
              <span className="mem-logo-title">Mathematical Memory</span>
              <span className="mem-logo-sub">persistent session context</span>
            </span>
          </Link>
          <nav className="mem-nav">
            <Link href="/explore" className="mem-nav-link">Explore</Link>
            <Link href="/app"     className="mem-nav-link">Solver</Link>
            <a
              href="https://github.com/JAgbanwa/elliptic-curve-solver-app-or-website"
              className="mem-nav-link"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            <button className="mem-theme-btn" onClick={toggle}>
              {theme === "dark" ? "Light" : "Dark"}
            </button>
          </nav>
        </div>
      </header>

      <main className="mem-main">
        {/* ── Hero ── */}
        <div className="mem-hero">
          <h1 className="mem-title">◉ Mathematical Memory</h1>
          <p className="mem-subtitle">
            Save assumptions, notation conventions, definitions, and results.
            Tag entries with variable names and they surface automatically when
            you explore equations containing those variables.
          </p>
          <div className="mem-stats">
            <span className="mem-stat">
              <strong>{memories.length}</strong> entries
            </span>
            <span className="mem-stat">
              <strong>{pinCount}</strong> pinned
            </span>
            <span className="mem-stat">
              <strong>{ALL_TYPES.filter(t => memories.some(m => m.type === t)).length}</strong> types
            </span>
          </div>
        </div>

        {/* ── Add / Edit form ── */}
        {!showForm ? (
          <div className="mem-add-toggle">
            <button className="mem-add-btn" onClick={openAdd}>
              + New memory
            </button>
            {memories.length > 0 && (
              <button className="mem-add-btn mem-add-btn--secondary" onClick={handleExport}>
                Export all
              </button>
            )}
          </div>
        ) : (
          <div className="mem-form">
            <p className="mem-form-title">
              {editingId ? "Edit memory" : "New memory"}
            </p>

            {/* Type selector */}
            <div className="mem-type-row">
              {ALL_TYPES.map((t) => (
                <button
                  key={t}
                  className={`mem-type-btn${form.type === t ? " mem-type-btn--active" : ""}`}
                  onClick={() => setForm((f) => ({ ...f, type: t }))}
                >
                  {TYPE_META[t].icon} {TYPE_META[t].label}
                </button>
              ))}
            </div>
            <p className="mem-form-hint">{TYPE_META[form.type].desc}</p>

            {/* Title */}
            <label className="mem-form-label" style={{ marginTop: 12 }}>Title</label>
            <input
              className="mem-form-input"
              placeholder="e.g. 'n is squarefree' or 'Δ notation'"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && saveForm()}
            />

            {/* Content */}
            <label className="mem-form-label">Content</label>
            <textarea
              className="mem-form-textarea"
              placeholder="Full statement, formula, or note. Use Unicode: ℤ ℚ ℝ ≤ ≥ ⊢ ∴ ≝ ∷"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              rows={4}
            />

            {/* Variables + pin */}
            <div className="mem-form-row">
              <div className="mem-form-field mem-form-field--grow">
                <label className="mem-form-label">Variables (comma-separated)</label>
                <input
                  className="mem-form-input"
                  style={{ marginBottom: 0 }}
                  placeholder="e.g. n, k, x"
                  value={form.variables}
                  onChange={(e) => setForm((f) => ({ ...f, variables: e.target.value }))}
                />
                <span className="mem-form-hint">
                  This memory surfaces automatically when these variables appear in an equation.
                </span>
              </div>
              <label className="mem-pin-label">
                <input
                  type="checkbox"
                  checked={form.pinned}
                  onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
                />
                Always visible (pinned)
              </label>
            </div>

            <div className="mem-form-actions">
              <button
                className="mem-form-save"
                onClick={saveForm}
                disabled={!form.title.trim()}
              >
                {editingId ? "Save changes" : "Save memory"}
              </button>
              <button className="mem-form-cancel" onClick={cancelForm}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Controls / filter bar ── */}
        {memories.length > 0 && (
          <div className="mem-controls">
            <input
              className="mem-search"
              placeholder="Search memories…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="mem-filter-row">
              <button
                className={`mem-filter-btn${typeFilter === "all" ? " mem-filter-btn--active" : ""}`}
                onClick={() => setTypeFilter("all")}
              >
                All ({memories.length})
              </button>
              {ALL_TYPES.filter((t) => memories.some((m) => m.type === t)).map((t) => (
                <button
                  key={t}
                  className={`mem-filter-btn${typeFilter === t ? " mem-filter-btn--active" : ""}`}
                  onClick={() => setTypeFilter(t)}
                >
                  {TYPE_META[t].icon} {TYPE_META[t].label} (
                  {memories.filter((m) => m.type === t).length})
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Memory list ── */}
        {memories.length === 0 ? (
          <div className="mem-empty">
            <p>No memories yet.</p>
            <p>
              Save an assumption like "n is squarefree" and it will surface
              automatically whenever you explore an equation containing n.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mem-empty">No memories match that filter.</div>
        ) : (
          <div className="mem-list">
            {filtered.map((m) => (
              <MemoryCard
                key={m.id}
                memory={m}
                onEdit={() => openEdit(m)}
                onDelete={() => remove(m.id)}
                onTogglePin={() => togglePin(m.id)}
              />
            ))}
          </div>
        )}

        {/* ── Danger zone ── */}
        {memories.length > 0 && (
          <div className="mem-danger">
            <span className="mem-danger-label">
              Memory is stored in your browser&apos;s localStorage and persists across sessions.
            </span>
            {confirmClear ? (
              <>
                <span style={{ fontSize: ".72rem", color: "#c00" }}>
                  Delete all {memories.length} entries?
                </span>
                <button
                  className="mem-danger-btn"
                  style={{ color: "#c00", borderColor: "#c00" }}
                  onClick={() => { clearAll(); setConfirmClear(false); }}
                >
                  Yes, clear all
                </button>
                <button className="mem-danger-btn" onClick={() => setConfirmClear(false)}>
                  Cancel
                </button>
              </>
            ) : (
              <button className="mem-danger-btn" onClick={() => setConfirmClear(true)}>
                Clear all memories
              </button>
            )}
          </div>
        )}
      </main>

      <footer className="mem-footer">localStorage · no server · persists across sessions</footer>
    </div>
  );
}

/* ── Memory card sub-component ─────────────────────────────────────────────── */
function MemoryCard({
  memory: m,
  onEdit,
  onDelete,
  onTogglePin,
}: {
  memory: MathMemory;
  onEdit: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
}) {
  const dateStr = new Date(m.created).toISOString().slice(0, 10);
  return (
    <div className={`mem-card${m.pinned ? " mem-card--pinned" : ""}`}>
      <div className="mem-card-head">
        <span className="mem-type-badge">
          {TYPE_META[m.type].icon} {TYPE_META[m.type].label}
        </span>
        {m.pinned && <span className="mem-pin-star">★</span>}
        <span className="mem-card-title">{m.title}</span>
        <div className="mem-card-actions">
          <button
            className={`mem-card-action mem-card-action--pin${m.pinned ? " active" : ""}`}
            onClick={onTogglePin}
            title={m.pinned ? "Unpin" : "Pin (always visible)"}
          >
            {m.pinned ? "unpin" : "pin"}
          </button>
          <button className="mem-card-action" onClick={onEdit} title="Edit">
            edit
          </button>
          <button
            className="mem-card-action mem-card-action--del"
            onClick={onDelete}
            title="Delete"
          >
            ×
          </button>
        </div>
      </div>
      {m.content && (
        <p className="mem-card-content">{m.content}</p>
      )}
      <div className="mem-card-footer">
        {m.variables.map((v) => (
          <span key={v} className="mem-var-chip">{v}</span>
        ))}
        <span className="mem-date">{dateStr}</span>
      </div>
    </div>
  );
}
