import styles from "./TypingIndicator.module.css";

// The "Tada is typing" affordance — three bouncing rust dots in an assistant
// bubble, shown while we await the first token or a tool is mid-run. Makes the
// stream feel alive (human, not robotic) instead of a sudden finished block.
export function TypingIndicator({ label }: { label?: string }) {
  return (
    <div className={styles.row} data-role="assistant" aria-live="polite">
      <div className={styles.bubble}>
        <span className={styles.dots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className={styles.srOnly}>{label ?? "Tada is typing"}</span>
      </div>
    </div>
  );
}
