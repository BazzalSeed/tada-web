"use client";

import type {
  DateWindow,
  FilterCriteria,
  Priority,
  TodoLabel,
} from "@/lib/contracts";
import styles from "./FilterBuilder.module.css";

// T1.8b — compose the full FilterCriteria the flow core already honors. Pure
// controlled UI: every change emits a new criteria via onChange; applyFilter
// does the rest. Selected = accent / soft raised, never a heavy fill.
export interface FilterBuilderProps {
  value: FilterCriteria;
  labels: TodoLabel[];
  onChange: (next: FilterCriteria) => void;
}

// minPriority is a rank THRESHOLD; the segmented control offers the native set.
const PRIORITY_SEGMENTS: { label: string; value: Priority | null }[] = [
  { label: "Any priority", value: null },
  { label: "P2+", value: "p2" },
  { label: "P1", value: "p1" },
];

const DATE_SEGMENTS: { label: string; value: DateWindow }[] = [
  { label: "Any date", value: "any" },
  { label: "Today", value: "today" },
  { label: "Overdue", value: "overdue" },
  { label: "Next 7", value: "next7" },
  { label: "No date", value: "noDate" },
];

export function FilterBuilder({ value, labels, onChange }: FilterBuilderProps) {
  function toggleLabel(id: string) {
    const has = value.labelIds.includes(id);
    onChange({
      ...value,
      labelIds: has
        ? value.labelIds.filter((x) => x !== id)
        : [...value.labelIds, id],
    });
  }

  return (
    <div className={styles.builder}>
      {labels.length > 0 ? (
        <fieldset className={styles.section}>
          <legend className={styles.legend}>Labels (any of)</legend>
          <div className={styles.chips}>
            {labels.map((l) => {
              const on = value.labelIds.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  className={styles.chip}
                  aria-label={`@${l.name}`}
                  aria-pressed={on}
                  data-on={on}
                  onClick={() => toggleLabel(l.id)}
                >
                  <span
                    className={styles.dot}
                    style={{ background: l.colorHex }}
                    aria-hidden="true"
                  />
                  @{l.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <fieldset className={styles.section}>
        <legend className={styles.legend}>Priority</legend>
        <div className={styles.segments} role="group">
          {PRIORITY_SEGMENTS.map((seg) => {
            const on = (value.minPriority ?? null) === seg.value;
            return (
              <button
                key={seg.label}
                type="button"
                className={styles.segment}
                aria-pressed={on}
                data-on={on}
                onClick={() => onChange({ ...value, minPriority: seg.value })}
              >
                {seg.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className={styles.section}>
        <legend className={styles.legend}>Due</legend>
        <div className={styles.segments} role="group">
          {DATE_SEGMENTS.map((seg) => {
            const on = value.dateWindow === seg.value;
            return (
              <button
                key={seg.value}
                type="button"
                className={styles.segment}
                aria-pressed={on}
                data-on={on}
                onClick={() => onChange({ ...value, dateWindow: seg.value })}
              >
                {seg.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={value.includeCompleted}
          onChange={(e) =>
            onChange({ ...value, includeCompleted: e.target.checked })
          }
        />
        Show completed
      </label>
    </div>
  );
}
