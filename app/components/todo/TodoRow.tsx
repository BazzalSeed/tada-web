"use client";

import type { Todo, TodoLabel } from "@/lib/contracts";
import { Spark } from "@/app/components/brand/Spark";
import { PriorityCircle } from "./PriorityCircle";
import { MetaChips } from "./MetaChips";
import { CaptureThumbnail } from "@/app/components/capture/CaptureThumbnail";
import { EnrichmentBar } from "@/app/components/capture/EnrichmentBar";
import type { EnrichmentChip } from "@/app/lib/enrich";
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
  onDelete?: () => void; // soft-delete (status → dismissed); hidden until row hover/focus
  // The "do it for me" offer surfaced on the row (FIX2). Tapping opens the detail
  // pane where the concrete effect is confirmed (the tap there is the trigger).
  offer?: { eyebrow: string; line?: string } | null;
  offerDone?: string | null; // executed → a calm done badge ("Invite sent")
  enriching?: boolean; // this row's todo is being AI-enriched right now
  // AI enrichment suggestion chips rendered on this row after enrichment lands.
  enrichChips?: EnrichmentChip[];
  onAcceptChip?: (chip: EnrichmentChip) => void;
  onDismissChips?: () => void;
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
  enrichChips,
  onAcceptChip,
  onDismissChips,
  onDelete,
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
        {enrichChips?.length ? (
          <div className={styles.enrichmentBar} onClick={(e) => e.stopPropagation()}>
            <EnrichmentBar
              chips={enrichChips}
              onAccept={onAcceptChip!}
              onDismiss={onDismissChips!}
            />
          </div>
        ) : null}
      </div>
      {captureThumb ? (
        <CaptureThumbnail src={captureThumb} alt={`Capture for ${todo.title}`} />
      ) : null}
      {onDelete ? (
        <button
          type="button"
          className={styles.delete}
          aria-label={`Delete ${todo.title}`}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="3 4 4 4 13 4" />
            <path d="M5.5 4V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1" />
            <path d="M12 4l-.867 8.857A1 1 0 0 1 10.14 14H5.86a1 1 0 0 1-.994-.857L4 4" />
            <line x1="6.5" y1="7" x2="6.5" y2="11" />
            <line x1="9.5" y1="7" x2="9.5" y2="11" />
          </svg>
        </button>
      ) : null}
    </li>
  );
}
