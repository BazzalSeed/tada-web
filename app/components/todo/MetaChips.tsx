"use client";

import type { TodoLabel } from "@/lib/contracts";
import { formatDue } from "@/app/lib/format";
import styles from "./MetaChips.module.css";

// Row metadata: due · labels · subtask rollup. Priority is shown by the leading
// PriorityCircle, so it is not duplicated here.
export interface MetaChipsProps {
  dueAt?: string | null;
  now: Date;
  labels: TodoLabel[];
  subtaskDone: number;
  subtaskTotal: number;
}

export function MetaChips({
  dueAt,
  now,
  labels,
  subtaskDone,
  subtaskTotal,
}: MetaChipsProps) {
  const due = dueAt ? formatDue(dueAt, now) : null;
  if (!due && labels.length === 0 && subtaskTotal === 0) return null;

  return (
    <div className={styles.chips}>
      {due ? (
        <span
          className={styles.chip}
          data-testid="due-chip"
          data-overdue={due.overdue}
        >
          {due.label}
        </span>
      ) : null}

      {subtaskTotal > 0 ? (
        <span
          className={styles.chip}
          data-testid="subtask-chip"
        >
          {subtaskDone}/{subtaskTotal}
        </span>
      ) : null}

      {labels.map((l) => (
        <span key={l.id} className={`${styles.chip} ${styles.label}`}>
          <span className={styles.dot} style={{ background: l.colorHex }} />
          {l.name}
        </span>
      ))}
    </div>
  );
}
