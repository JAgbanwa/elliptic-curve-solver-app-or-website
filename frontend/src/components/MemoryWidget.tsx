"use client";
import "./MemoryWidget.css";
import { useState, useCallback } from "react";
import Link from "next/link";
import { useMemory, TYPE_META, type MemoryType } from "@/hooks/useMemory";

interface MemoryWidgetProps {
  vars: string[];
  equation: string;
}

const ALL_TYPES = Object.keys(TYPE_META) as MemoryType[];

const BLANK = {
  type: "assumption" as MemoryType,
  title: "",
  content: "",
  pinned: false,
};

export function MemoryWidget({ vars, equation: _equation }: MemoryWidgetProps) {
  const { memories, ready, add, remove, togglePin, relevant } = useMemory();

  const rel = relevant(vars);

  /* Auto-open if there are relevant entries */
  const [open, setOpen] = useState<boolean | null>(null);
  const isOpen = open === null ? rel.length > 0 : open;

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...BLANK, vars: vars.join(", ") });

  const openForm = () => {
    setForm({ ...BLANK, vars: vars.join(", ") });
    setShowForm(true);
  };
  const cancelForm = () => { setShowForm(false); };

  const saveForm = useCallback(() => {
    if (!form.title.trim()) return;
    const parsedVars = form.vars.split(",").map((v) => v.trim()).filter(Boolean);
    add({
      type: form.type,
      title: form.title.trim(),
      content: form.content.trim(),
      variables: parsedVars,
      pinned: form.pinned,
    });
    setShowForm(false);
  }, [form, add]);

  if (!ready) return null;

  const contextHint = vars.length > 0
    ? `vars: ${vars.slice(0, 5).join(", ")}${vars.length > 5 ? ", …" : ""}`
    : "";

  return (
    <div className="memw">
      {/* ── Header ── */}
      <div className="memw-head" onClick={() => setOpen(!isOpen)}>
        <div className="memw-head-left">
          <span className="memw-icon">◉</span>
          <span className="memw-label">Memory</span>
          {rel.length > 0 && (
            <span className="memw-badge">{rel.length} relevant</span>
          )}
          {contextHint && (
            <span className="memw-context-hint">· {contextHint}</span>
          )}
        </div>
        <span className="memw-toggle">{isOpen ? "−" : "+"}</span>
      </div>

      {/* ── Body ── */}
      {isOpen && (
        <div className="memw-body">
          {/* Relevant entries */}
          <div className="memw-list">
            {rel.length === 0 ? (
              <div className="memw-empty">
                No relevant memories.
                {memories.length > 0
                  ? " Tag a memory with these variable names to surface it here."
                  : " Add your first memory below."}
              </div>
            ) : (
              rel.map((m) => (
                <div key={m.id} className="memw-entry">
                  <div className="memw-entry-head">
                    <span className="memw-entry-type">
                      {TYPE_META[m.type].icon}
                    </span>
                    {m.pinned && <span className="memw-entry-pin">★</span>}
                    <span className="memw-entry-title">{m.title}</span>
                    <div className="memw-entry-actions">
                      <button
                        className="memw-entry-action"
                        onClick={() => togglePin(m.id)}
                        title={m.pinned ? "Unpin" : "Pin"}
                      >
                        {m.pinned ? "unpin" : "pin"}
                      </button>
                      <button
                        className="memw-entry-action memw-entry-action--del"
                        onClick={() => remove(m.id)}
                        title="Delete"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  {m.content && (
                    <p className="memw-entry-content">{m.content}</p>
                  )}
                  {m.variables.length > 0 && (
                    <div className="memw-entry-vars">
                      {m.variables.map((v) => (
                        <span key={v} className="memw-var-chip">{v}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {/* Quick-add form */}
          <div className="memw-add-row">
            {!showForm ? (
              <button className="memw-add-toggle-btn" onClick={openForm}>
                + Remember something about this equation
              </button>
            ) : (
              <div className="memw-quick-form">
                {/* Type selector */}
                <div className="memw-type-row">
                  {ALL_TYPES.map((t) => (
                    <button
                      key={t}
                      className={`memw-type-btn${form.type === t ? " memw-type-btn--active" : ""}`}
                      onClick={() => setForm((f) => ({ ...f, type: t }))}
                    >
                      {TYPE_META[t].icon} {TYPE_META[t].label}
                    </button>
                  ))}
                </div>

                <input
                  className="memw-input"
                  placeholder="Title (e.g. 'n is squarefree')"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  onKeyDown={(e) => e.key === "Enter" && saveForm()}
                />
                <textarea
                  className="memw-textarea"
                  placeholder="Content — full statement or formula (optional)"
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  rows={2}
                />
                <div className="memw-form-row">
                  <input
                    className="memw-input memw-input--sm"
                    placeholder="Variables (e.g. n, k)"
                    value={form.vars}
                    onChange={(e) => setForm((f) => ({ ...f, vars: e.target.value }))}
                  />
                  <label className="memw-pin-label">
                    <input
                      type="checkbox"
                      checked={form.pinned}
                      onChange={(e) => setForm((f) => ({ ...f, pinned: e.target.checked }))}
                    />
                    Always visible
                  </label>
                </div>
                <div className="memw-form-actions">
                  <button
                    className="memw-save-btn"
                    onClick={saveForm}
                    disabled={!form.title.trim()}
                  >
                    Save
                  </button>
                  <button className="memw-cancel-btn" onClick={cancelForm}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="memw-footer">
            <Link href="/memory" className="memw-manage-link">
              Manage all memories →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
