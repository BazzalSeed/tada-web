import Link from "next/link";

// Placeholder home (Phase 0). The frontend lane builds the real app shell /
// landing later. Kept minimal so it doesn't collide with that work.
export default function Home() {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        textAlign: "center",
        gap: "0.75rem",
        padding: "2rem",
        fontFamily: "var(--font-body)",
        color: "var(--color-ink)",
      }}
    >
      <div>
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
        <p style={{ color: "var(--color-ink-soft)", marginTop: "0.5rem" }}>
          Not to-do. Ta-da.
        </p>
        <p style={{ marginTop: "1.5rem" }}>
          <Link
            href="/tokens"
            style={{ color: "var(--color-accent-text)", fontWeight: 600 }}
          >
            View design tokens →
          </Link>
        </p>
      </div>
    </main>
  );
}
