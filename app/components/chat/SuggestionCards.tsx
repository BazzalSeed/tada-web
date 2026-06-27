import styles from "./SuggestionCards.module.css";

// Empty-state starter prompts (serif), shown before the first message. Picking a
// card sends its prompt — a fast on-ramp to what Tada actually does: capture a
// todo (the hero), query the flow, and the "do it for me" actions (meeting,
// research). Each maps to a real capability, not a generic chat query.
const PROMPTS = [
  "What's due today?",
  "Add “renew passport” for next week",
  "Book a 30-min sync with Dakota next Tuesday",
  "Research the best CRMs for a small team — save it as a to-do",
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
