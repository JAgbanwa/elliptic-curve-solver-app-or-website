export default function LandingPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg)",
        color: "var(--text)",
        fontFamily: '"Helvetica Neue", Arial, Helvetica, sans-serif',
      }}
    >
      {/* ── HEADER ── */}
      <header
        style={{
          borderBottom: "1px solid var(--border)",
          padding: "22px 40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <a
          href="/"
          style={{
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: "1rem",
            letterSpacing: ".08em",
            color: "var(--text)",
          }}
        >
          ∮ <span style={{ color: "var(--text-dim)" }}>Diophantix</span>
        </a>
        <nav style={{ display: "flex", gap: "32px", alignItems: "center" }}>
          <a
            href="https://github.com/JAgbanwa/elliptic-curve-solver-app-or-website"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: ".85rem",
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
            }}
          >
            GitHub
          </a>
          <a
            href="/app"
            style={{
              fontSize: ".85rem",
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
            }}
          >
            Open App
          </a>
        </nav>
      </header>

      {/* ── HERO ── */}
      <section
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "100px 40px 80px",
          maxWidth: "900px",
          width: "100%",
        }}
      >
        <p
          style={{
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: ".78rem",
            letterSpacing: ".2em",
            textTransform: "uppercase",
            color: "var(--text-dim)",
            marginBottom: "32px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: "32px",
              height: "1px",
              background: "var(--text-dim)",
            }}
          />
          Number Theory &nbsp;·&nbsp; Research Tool
        </p>

        <h1
          style={{
            fontFamily: "Georgia, 'Times New Roman', serif",
            fontSize: "clamp(2.4rem, 6vw, 4.8rem)",
            fontWeight: 400,
            lineHeight: 1.08,
            letterSpacing: "-.02em",
            color: "var(--text)",
            marginBottom: "40px",
          }}
        >
          Which integers{" "}
          <em style={{ fontStyle: "italic", color: "var(--text-dim)" }}>n</em>
          <br />
          make this curve solvable?
        </h1>

        <span
          style={{
            display: "block",
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: "clamp(1.1rem, 2.5vw, 1.6rem)",
            letterSpacing: ".04em",
            color: "var(--text-dim)",
            marginBottom: "48px",
            borderLeft: "2px solid var(--border)",
            paddingLeft: "20px",
          }}
        >
          y² = f(n, x) &nbsp;— &nbsp;find all integer (n, x, y)
        </span>

        <p
          style={{
            fontSize: "1.05rem",
            lineHeight: 1.75,
            color: "var(--text-dim)",
            maxWidth: "580px",
            marginBottom: "56px",
          }}
        >
          The <strong style={{ color: "var(--text)", fontWeight: 600 }}>congruent number problem</strong>,
          Mordell curves, BSD conjecture — all reduce to asking when a parametric
          elliptic curve has integer points. This tool lets you define any such
          family, set your search range, and stream every solution directly to
          your browser in real time.
          <br />
          <br />
          No installation. No account. Powered by{" "}
          <strong style={{ color: "var(--text)", fontWeight: 600 }}>
            NumPy, SymPy, and Server-Sent Events
          </strong>
          .
        </p>

        <div style={{ display: "flex", alignItems: "center", gap: "24px", flexWrap: "wrap" }}>
          <a
            href="/app"
            style={{
              display: "inline-block",
              background: "var(--text)",
              color: "var(--bg)",
              fontWeight: 700,
              fontSize: ".9rem",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              padding: "16px 40px",
              border: "1px solid var(--text)",
              cursor: "pointer",
            }}
          >
            Open the solver
          </a>
          <a
            href="https://github.com/JAgbanwa/elliptic-curve-solver-app-or-website"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: ".82rem",
              letterSpacing: ".06em",
              textTransform: "uppercase",
              color: "var(--text-dim)",
              borderBottom: "1px solid var(--border)",
              paddingBottom: "2px",
            }}
          >
            View source on GitHub
          </a>
        </div>
      </section>

      {/* ── PROBLEM STRIP ── */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
        }}
      >
        {[
          {
            num: "01 / THE PROBLEM",
            title: "Searching for integer points is computationally expensive",
            body:
              "Naively testing every (n, x) pair over large ranges takes seconds per curve and is hard to parallelize on a laptop.",
          },
          {
            num: "02 / THE APPROACH",
            title: "Vectorised NumPy evaluation, streamed via SSE",
            body:
              "The right-hand side is compiled once by SymPy, then evaluated over entire x-vectors in a single NumPy call per n — 100M+ evaluations per search.",
          },
          {
            num: "03 / THE RESULT",
            title: "Every integer triple (n, x, y) appears the moment it is found",
            body:
              "Solutions stream to your browser live. LaTeX export, CSV download, and shareable URLs are included.",
          },
        ].map((cell, i) => (
          <div
            key={i}
            style={{
              padding: "48px 40px",
              borderRight: i < 2 ? "1px solid var(--border)" : "none",
            }}
          >
            <div
              style={{
                fontFamily: '"Courier New", Courier, monospace',
                fontSize: ".7rem",
                letterSpacing: ".18em",
                color: "var(--text-dim)",
                marginBottom: "18px",
              }}
            >
              {cell.num}
            </div>
            <div
              style={{
                fontFamily: "Georgia, 'Times New Roman', serif",
                fontSize: "1.15rem",
                fontWeight: 400,
                lineHeight: 1.4,
                marginBottom: "12px",
              }}
            >
              {cell.title}
            </div>
            <p style={{ fontSize: ".85rem", lineHeight: 1.65, color: "var(--text-dim)" }}>
              {cell.body}
            </p>
          </div>
        ))}
      </div>

      {/* ── HOW IT WORKS ── */}
      <section style={{ borderTop: "1px solid var(--border)", padding: "80px 40px", maxWidth: "900px" }}>
        <p
          style={{
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: ".72rem",
            letterSpacing: ".2em",
            textTransform: "uppercase",
            color: "var(--text-dim)",
            marginBottom: "48px",
          }}
        >
          How it works
        </p>
        {[
          {
            n: "01",
            title: "Define your curve",
            body: "Enter any expression f(n, x) as the right-hand side of y² = … The tool supports polynomials, rational functions, and nested expressions.",
          },
          {
            n: "02",
            title: "Set your search bounds",
            body: "Choose integer (or rational) ranges for n and x. Autoscale, fixed window, divisor-based, and expression-range x-modes are available.",
          },
          {
            n: "03",
            title: "Stream results in real time",
            body: "A Server-Sent Events connection streams each triple (n, x, y) the instant it is discovered — no polling, no waiting.",
          },
          {
            n: "04",
            title: "Export, share, and pin",
            body: "Download as CSV or BibTeX, copy a shareable URL that encodes your exact search, or pin searches to local history.",
          },
        ].map((step, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "48px 1fr",
              gap: "0 28px",
              alignItems: "start",
              padding: "32px 0",
              borderBottom: i < 3 ? "1px solid var(--border)" : "none",
            }}
          >
            <span
              style={{
                fontFamily: '"Courier New", Courier, monospace',
                fontSize: ".72rem",
                letterSpacing: ".1em",
                color: "var(--text-dim)",
                paddingTop: "4px",
              }}
            >
              {step.n}
            </span>
            <div>
              <div
                style={{
                  fontFamily: "Georgia, 'Times New Roman', serif",
                  fontSize: "1.05rem",
                  fontWeight: 400,
                  marginBottom: "6px",
                }}
              >
                {step.title}
              </div>
              <p style={{ fontSize: ".85rem", lineHeight: 1.65, color: "var(--text-dim)" }}>
                {step.body}
              </p>
            </div>
          </div>
        ))}
      </section>

      {/* ── FOOTER ── */}
      <footer
        style={{
          borderTop: "1px solid var(--border)",
          padding: "28px 40px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "12px",
        }}
      >
        <span
          style={{
            fontFamily: '"Courier New", Courier, monospace',
            fontSize: ".72rem",
            letterSpacing: ".06em",
            color: "var(--text-dim)",
          }}
        >
          © 2026 &nbsp;Diophantix &nbsp;— &nbsp;open source
        </span>
        <div style={{ display: "flex", gap: "24px" }}>
          <a
            href="https://github.com/JAgbanwa/elliptic-curve-solver-app-or-website"
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontSize: ".78rem", color: "var(--text-dim)" }}
          >
            GitHub
          </a>
          <a href="/app" style={{ fontSize: ".78rem", color: "var(--text-dim)" }}>
            Open App
          </a>
        </div>
      </footer>
    </main>
  );
}
