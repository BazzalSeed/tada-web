import styles from "./SuggestionCards.module.css";

// Empty-state starter prompts (serif), shown before the first message. Picking a
// card sends its prompt — a fast on-ramp to the agent's capabilities.
const PROMPTS = [
  "What's due today?",
  "Plan my afternoon",
  "Research the best CRMs for a small team",
  "Book a 30-min sync with Dakota next Tuesday",
];

export interface SuggestionCardsProps {
  onPick: (prompt: string) => void;
}

export function SuggestionCards({ onPick }: SuggestionCardsProps) {
  return (
    <div className={styles.wrap}>
      <p className={styles.lead}>What can I do for you?</p>
      <div className={styles.grid}>
        {PROMPTS.map((p) => (
          <button key={p} type="button" className={styles.card} onClick={() => onPick(p)}>
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
