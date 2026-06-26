import { color, cssVar } from "@/app/styles/tokens";

// Token-smoke page (Phase 0): proves the vendored Clawdia tokens resolve and
// --color-accent renders rust #c8632e (NOT indigo). Also exercises the TS token
// module + the four brand fonts. The frontend lane replaces real UI later.

const swatches: { label: string; varName: string; cssValue: string }[] = [
  { label: "accent (rust)", varName: "--color-accent", cssValue: cssVar.accentSignature },
  { label: "accent-deep", varName: "--color-accent-deep", cssValue: cssVar.accentDeep },
  { label: "accent-bright", varName: "--color-accent-bright", cssValue: cssVar.accentBright },
  { label: "surface", varName: "--color-surface", cssValue: cssVar.surface },
  { label: "surface-raised", varName: "--color-surface-raised", cssValue: cssVar.surfaceRaised },
  { label: "ink", varName: "--color-ink", cssValue: cssVar.ink },
  { label: "ink-soft", varName: "--color-ink-soft", cssValue: cssVar.inkSoft },
  { label: "success", varName: "--color-success", cssValue: cssVar.stateSuccess },
];

export default function TokensPage() {
  return (
    <main
      style={{
        padding: "var(--space-8, 2.5rem)",
        maxWidth: 880,
        margin: "0 auto",
        fontFamily: "var(--font-body)",
        color: "var(--color-ink)",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-wordmark)",
          fontSize: "var(--fs-signature)",
          color: "var(--color-accent)",
          lineHeight: 1,
        }}
      >
        Tada
      </p>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-display)",
          letterSpacing: "var(--ls-display)",
          margin: "0.25rem 0 0.5rem",
        }}
      >
        Design token smoke test
      </h1>
      <p style={{ color: "var(--color-ink-soft)", marginBottom: "2rem" }}>
        Accent literal from <code style={{ fontFamily: "var(--font-mono)" }}>tokens.ts</code>:{" "}
        <strong style={{ color: "var(--color-accent-text)" }}>{color.accentSignature}</strong>{" "}
        — should be rust <code style={{ fontFamily: "var(--font-mono)" }}>#c8632e</code>, not indigo.
      </p>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: "1rem",
          marginBottom: "2.5rem",
        }}
      >
        {swatches.map((s) => (
          <div
            key={s.varName}
            style={{
              border: "1px solid var(--color-chrome)",
              borderRadius: 12,
              overflow: "hidden",
              background: "var(--color-surface-panel)",
            }}
          >
            <div style={{ height: 64, background: s.cssValue }} />
            <div style={{ padding: "0.5rem 0.75rem" }}>
              <div style={{ fontSize: "var(--fs-meta)", fontWeight: 600 }}>{s.label}</div>
              <code
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "var(--fs-mono)",
                  color: "var(--color-ink-muted)",
                }}
              >
                {s.varName}
              </code>
            </div>
          </div>
        ))}
      </section>

      <section style={{ display: "grid", gap: "0.75rem" }}>
        <p style={{ fontFamily: "var(--font-display)", fontSize: "var(--fs-section)" }}>
          EB Garamond — display / editorial
        </p>
        <p style={{ fontFamily: "var(--font-body)", fontSize: "var(--fs-body-lead)" }}>
          Geist — body & UI. Not to-do. Ta-da.
        </p>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: "var(--fs-body)" }}>
          Geist Mono — code 0123456789 {"{ }"} =&gt;
        </p>
        <button
          type="button"
          style={{
            justifySelf: "start",
            background: "var(--color-accent)",
            color: "var(--color-on-accent)",
            border: "none",
            borderRadius: 10,
            padding: "0.625rem 1.1rem",
            fontFamily: "var(--font-body)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Accent button
        </button>
      </section>
    </main>
  );
}
