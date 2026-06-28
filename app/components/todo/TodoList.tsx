"use client";

import { useRef, useState } from "react";
import type { Capture, Todo, TodoLabel } from "@/lib/contracts";
import { neighborsForDrop } from "@/app/lib/reorder";
import { offerEffect } from "@/app/lib/offer";
import { TodoRow } from "./TodoRow";
import styles from "./TodoList.module.css";

const DONE_BADGE: Record<string, string> = {
  meeting: "Invite sent",
  reminder: "Reminder set",
  research: "Researched",
};

export interface SubtaskCount {
  done: number;
  total: number;
}

export interface TodoListProps {
  open: Todo[]; // already filtered + sorted
  done: Todo[]; // scoped Done, sorted
  now: Date;
  labelsById: Record<string, TodoLabel>;
  subtaskCounts: Record<string, SubtaskCount>;
  childrenByParent?: Record<string, Todo[]>; // one-level subtasks, indented on expand
  capturesById?: Record<string, Capture>; // source captures for row thumbnails
  selectedId: string | null;
  enrichingId?: string | null;
  onSelect: (id: string) => void;
  onToggleComplete: (id: string) => void;
  onReorder: (id: string, beforeId: string | null, afterId: string | null) => void;
}

function labelsFor(
  todo: Todo,
  labelsById: Record<string, TodoLabel>,
): TodoLabel[] {
  return todo.labelIds
    .map((id) => labelsById[id])
    .filter((l): l is TodoLabel => Boolean(l));
}

export function TodoList({
  open,
  done,
  now,
  labelsById,
  subtaskCounts,
  childrenByParent = {},
  capturesById = {},
  selectedId,
  enrichingId,
  onSelect,
  onToggleComplete,
  onReorder,
}: TodoListProps) {
  const [doneOpen, setDoneOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const dragFrom = useRef<number | null>(null);
  // The slot the dragged row will land in, for the live insertion indicator.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function clearDrag() {
    dragFrom.current = null;
    setDragIndex(null);
    setOverIndex(null);
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function rowFor(
    todo: Todo,
    opts: { dragIndex?: number; indented?: boolean } = {},
  ) {
    const { dragIndex: rowIndex, indented } = opts;
    const count = subtaskCounts[todo.id] ?? { done: 0, total: 0 };
    const isOpenRow = rowIndex !== undefined;
    const kids = childrenByParent[todo.id] ?? [];
    const captureThumb = capturesById[todo.sourceCaptureId]?.blobPath ?? null;
    // Do-it-for-me offer surfaced on the row (FIX2): the live offer for actionable
    // todos, or a calm done badge once executed.
    const eff = offerEffect(todo);
    const offer = eff ? { eyebrow: eff.eyebrow, line: eff.lines[0] } : null;
    const offerDone =
      todo.actionType !== "none" && todo.actionState === "done"
        ? DONE_BADGE[todo.actionType] ?? null
        : null;
    // Insertion indicator: while dragging, the hovered row shows a rust line on
    // the side the dragged row would land — above when moving up, below when down.
    const dropIndicator: "above" | "below" | null =
      isOpenRow &&
      dragIndex !== null &&
      overIndex === rowIndex &&
      dragIndex !== rowIndex
        ? dragIndex < rowIndex
          ? "below"
          : "above"
        : null;
    return (
      <TodoRow
        key={todo.id}
        todo={todo}
        now={now}
        labels={labelsFor(todo, labelsById)}
        subtaskDone={count.done}
        subtaskTotal={count.total}
        captureThumb={captureThumb}
        selected={selectedId === todo.id}
        enriching={todo.id === enrichingId}
        onSelect={() => onSelect(todo.id)}
        onToggleComplete={() => onToggleComplete(todo.id)}
        offer={offer}
        offerDone={offerDone}
        indented={indented}
        hasChildren={!indented && kids.length > 0}
        expanded={expanded.has(todo.id)}
        onToggleExpand={() => toggleExpand(todo.id)}
        draggable={isOpenRow}
        dragging={isOpenRow && dragIndex === rowIndex}
        dropIndicator={dropIndicator}
        onDragStart={
          isOpenRow
            ? () => {
                dragFrom.current = rowIndex;
                setDragIndex(rowIndex);
              }
            : undefined
        }
        onDragOver={
          isOpenRow
            ? (e) => {
                e.preventDefault();
                if (overIndex !== rowIndex) setOverIndex(rowIndex);
              }
            : undefined
        }
        onDragEnd={isOpenRow ? clearDrag : undefined}
        onDrop={
          isOpenRow
            ? () => {
                const from = dragFrom.current;
                clearDrag();
                if (from === null || from === rowIndex) return;
                const ids = open.map((t) => t.id);
                const { beforeId, afterId } = neighborsForDrop(
                  ids,
                  from,
                  rowIndex,
                );
                onReorder(open[from].id, beforeId, afterId);
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className={styles.list}>
      <ul className={styles.open} role="list">
        {open.flatMap((t, i) => {
          const rows = [rowFor(t, { dragIndex: i })];
          if (expanded.has(t.id)) {
            for (const kid of childrenByParent[t.id] ?? []) {
              rows.push(rowFor(kid, { indented: true }));
            }
          }
          return rows;
        })}
        {open.length === 0 ? (
          <li className={styles.empty}>Nothing here yet.</li>
        ) : null}
      </ul>

      {done.length > 0 ? (
        <div className={styles.doneSection}>
          <button
            type="button"
            className={styles.doneToggle}
            aria-expanded={doneOpen}
            onClick={() => setDoneOpen((o) => !o)}
          >
            <span className={styles.caret} data-open={doneOpen}>
              ▸
            </span>
            Done ({done.length})
          </button>
          {doneOpen ? (
            <ul className={styles.doneList} role="list">
              {done.map((t) => rowFor(t))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
