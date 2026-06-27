"use client";

import type { Priority } from "@/lib/contracts";
import styles from "./PriorityCircle.module.css";

// Leading complete-toggle, colored by priority (Todoist-style). Checking it
// completes the todo. Priority is conveyed by ring color via data-priority.
export interface PriorityCircleProps {
  priority: Priority;
  done: boolean;
  title: string;
  onToggle: () => void;
}

export function PriorityCircle({
  priority,
  done,
  title,
  onToggle,
}: PriorityCircleProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`Complete ${title}`}
      data-priority={priority}
      className={`${styles.circle} ${done ? styles.done : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      {done ? <span className={styles.check}>✓</span> : null}
    </button>
  );
}
