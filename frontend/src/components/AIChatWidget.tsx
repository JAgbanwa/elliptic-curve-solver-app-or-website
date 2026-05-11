"use client";
import { useState, useRef, useEffect, useCallback } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface Props {
  /** Optional solver context (equation, n range, solution count) */
  context?: string;
}

export default function AIChatWidget({ context }: Props) {
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLTextAreaElement>(null);
  const abortRef                  = useRef<AbortController | null>(null);

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setError("");
    setInput("");

    const userMsg: Message = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);

    // Optimistically add an empty assistant message we'll stream into
    setMessages(prev => [...prev, { role: "assistant", content: "", streaming: true }]);

    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    try {
      abortRef.current = new AbortController();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, context: context ?? "" }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || "Request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          try {
            const ev = JSON.parse(raw);
            if (ev.type === "delta") {
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.streaming) next[next.length - 1] = { ...last, content: last.content + ev.content };
                return next;
              });
            } else if (ev.type === "done") {
              setMessages(prev => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.streaming) next[next.length - 1] = { ...last, streaming: false };
                return next;
              });
            } else if (ev.type === "error") {
              throw new Error(ev.message);
            }
          } catch { /* ignore parse errors for individual chunks */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        // User cancelled — just mark streaming done
        setMessages(prev => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.streaming) next[next.length - 1] = { ...last, streaming: false };
          return next;
        });
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
        // Remove the empty streaming bubble
        setMessages(prev => prev.filter((_, i) => !(i === prev.length - 1 && prev[i].streaming)));
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [input, loading, messages, context]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clear = () => { setMessages([]); setError(""); };

  const stop = () => { abortRef.current?.abort(); };

  return (
    <div className="ai-chat-root">
      {/* Floating toggle button */}
      {!open && (
        <button className="ai-chat-fab" onClick={() => setOpen(true)} title="Ask AI about elliptic curves" aria-label="Open AI chat">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <span className="ai-chat-fab-label">Ask AI</span>
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="ai-chat-panel">
          {/* Header */}
          <div className="ai-chat-header">
            <span className="ai-chat-title">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{marginRight:6,verticalAlign:"middle"}}>
                <circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
              </svg>
              AI Assistant
            </span>
            <div className="ai-chat-header-actions">
              <button className="ai-chat-icon-btn" onClick={clear} title="Clear conversation">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              </button>
              <button className="ai-chat-icon-btn" onClick={() => setOpen(false)} title="Close">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="ai-chat-messages">
            {messages.length === 0 && (
              <div className="ai-chat-empty">
                <p>Ask anything about elliptic curves, your current equation, solutions, the group law, torsion points, BSD conjecture…</p>
                <div className="ai-chat-suggestions">
                  {[
                    "What does y² = x³ − x represent?",
                    "Explain the chord-tangent law",
                    "What is the torsion subgroup?",
                    "How do I interpret these solutions?",
                  ].map(s => (
                    <button key={s} className="ai-chat-suggestion" onClick={() => { setInput(s); setTimeout(() => inputRef.current?.focus(), 50); }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`ai-chat-msg ai-chat-msg--${m.role}`}>
                <div className="ai-chat-bubble">
                  {m.content || (m.streaming ? <span className="ai-chat-thinking">Thinking…</span> : null)}
                  {m.streaming && m.content && <span className="ai-chat-cursor" />}
                </div>
              </div>
            ))}
            {error && <div className="ai-chat-error">{error}</div>}
            <div ref={bottomRef} />
          </div>

          {/* Input row */}
          <div className="ai-chat-input-row">
            <textarea
              ref={inputRef}
              className="ai-chat-input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about elliptic curves… (Enter to send)"
              rows={2}
              disabled={loading}
            />
            {loading
              ? <button className="ai-chat-send ai-chat-stop" onClick={stop} title="Stop">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
                </button>
              : <button className="ai-chat-send" onClick={send} disabled={!input.trim()} title="Send (Enter)">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
            }
          </div>
          <div className="ai-chat-footer">GPT-4o · Shift+Enter for new line</div>
        </div>
      )}
    </div>
  );
}
