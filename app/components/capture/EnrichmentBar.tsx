"use client";

import type { EnrichmentChip } from "@/app/lib/enrich";
import styles from "./EnrichmentBar.module.css";

// T2.5 — the "fold AI suggestions into pills" surface. Each chip names a concrete
// effect (P1, Tomorrow, @work, Meeting…) and applies ONLY when the user taps it:
// no enrichment ever mutates the todo on its own. Disappears when empty.
export interface EnrichmentBarProps {
  chips: EnrichmentChip[];
  onAccept: (chip: EnrichmentChip) => void;
  onDismiss: () => void;
}

export function EnrichmentBar({ chips, onAccept, onDismiss }: EnrichmentBarProps) {
  if (chips.length === 0) return null;
  return (
    <div className={styles.bar} role="group" aria-label="AI suggestions">
      <span className={styles.lead}>Suggested</span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          className={styles.chip}
          data-kind={chip.kind}
          aria-label={`Add ${chip.label}`}
          onClick={() => onAccept(chip)}
        >
          <span className={styles.plus} aria-hidden="true">
            +
          </span>
          {chip.label}
        </button>
      ))}
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss suggestions"
        onClick={onDismiss}
      >
        ×
      </button>
    </div>
  );
}
