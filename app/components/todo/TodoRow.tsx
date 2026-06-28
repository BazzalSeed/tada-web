"use client";

import type { Todo, TodoLabel } from "@/lib/contracts";
import { Spark } from "@/app/components/brand/Spark";
import { PriorityCircle } from "./PriorityCircle";
import { MetaChips } from "./MetaChips";
import { CaptureThumbnail } from "@/app/components/capture/CaptureThumbnail";
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
  onDragEnd?: () => void;
  dragging?: boolean; // this row is the one being dragged (dim it)
  dropIndicator?: "above" | "below" | null; // rust insertion line
  // Optional one-level subtask affordances.
  hasChildren?: boolean;
  expanded?: boolean;
  onToggleExpand?: () => void;
  indented?: boolean;
  captureThumb?: string | null; // source-capture image url
  // The "do it for me" offer surfaced on the row (FIX2). Tapping opens the detail
  // pane where the concrete effect is confirmed (the tap there is the trigger).
  offer?: { eyebrow: string; line?: string } | null;
  offerDone?: string | null; // executed → a calm done badge ("Invite sent")
  enriching?: boolean; // this row's todo is being AI-enriched right now
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
  onDragEnd,
  dragging,
  dropIndicator,
  hasChildren,
  expanded,
  onToggleExpand,
  indented,
  captureThumb,
  offer,
  offerDone,
  enriching,
}: TodoRowProps) {
  const done = todo.status === "done";
  return (
    <li
      className={styles.row}
      data-selected={selected}
      data-done={done}
      data-indented={indented ? "true" : undefined}
      data-dragging={dragging ? "true" : undefined}
      data-drop={dropIndicator ?? undefined}
      onClick={onSelect}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
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
        {enriching ? (
          <div className={styles.enhancing} role="status" aria-live="polite">
            <Spark size={12} className={styles.enhanceSpark} />
            <span>Enhancing…</span>
          </div>
        ) : null}
        {offerDone ? (
          <span className={styles.offerDone}>✓ {offerDone}</span>
        ) : offer ? (
          <button
            type="button"
            className={styles.offerChip}
            aria-label={`${offer.eyebrow} — open to confirm`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect();
            }}
          >
            <span className={styles.bolt} aria-hidden="true">
              ⚡
            </span>
            <span className={styles.offerText}>
              {offer.eyebrow}
              {offer.line ? ` · ${offer.line}` : ""}
            </span>
          </button>
        ) : null}
      </div>
      {captureThumb ? (
        <CaptureThumbnail src={captureThumb} alt={`Capture for ${todo.title}`} />
      ) : null}
    </li>
  );
}
