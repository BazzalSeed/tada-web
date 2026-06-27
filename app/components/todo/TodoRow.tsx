"use client";

import type { Todo, TodoLabel } from "@/lib/contracts";
import { PriorityCircle } from "./PriorityCircle";
import { MetaChips } from "./MetaChips";
import styles from "./TodoRow.module.css";

// A single list row: priority/complete circle · title · meta chips. Selecting
// the body opens the detail pane; the circle completes without selecting.
// Selected state = soft raised surface (no heavy black fill).
export interface TodoRowProps {
  todo: Todo;
  now: Date;
  labels: TodoLabel[];
  subtaskDone: number;
  subtaskTotal: number;
  selected: boolean;
  onSelect: () => void;
  onToggleComplete: () => void;
  // Optional drag-reorder wiring supplied by TodoList (open list only).
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  // Optional one-level subtask affordances.
  hasChildren?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  indented?: boolean;
}

export function TodoRow({
  todo,
  now,
  labels,
  subtaskDone,
  subtaskTotal,
  selected,
  onSelect,
  onToggleComplete,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  hasChildren,
  expanded,
  onToggleExpand,
  indented,
}: TodoRowProps) {
  const done = todo.status === "done";
  return (
    <li
      className={styles.row}
      data-selected={selected}
      data-done={done}
      data-indented={indented ? "true" : undefined}
      onClick={onSelect}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {hasChildren ? (
        <button
          type="button"
          className={styles.caret}
          data-open={expanded}
          aria-expanded={expanded}
          aria-label={`${expanded ? "Collapse" : "Expand"} subtasks of ${todo.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand?.();
          }}
        >
          ▸
        </button>
      ) : (
        <span className={styles.caretSpacer} aria-hidden="true" />
      )}
      <PriorityCircle
        priority={todo.priority}
        done={done}
        title={todo.title}
        onToggle={onToggleComplete}
      />
      <div className={styles.body}>
        <span className={styles.title}>{todo.title}</span>
        <MetaChips
          dueAt={todo.dueAt}
          now={now}
          labels={labels}
          subtaskDone={subtaskDone}
          subtaskTotal={subtaskTotal}
        />
      </div>
    </li>
  );
}
