"use client";

import { useRef, useState } from "react";
import type { Todo } from "@/lib/contracts";
import { neighborsForDrop } from "@/app/lib/reorder";
import styles from "./SubtaskList.module.css";

// One-level subtask manager for the detail pane: add · complete · reorder.
// Completing children never auto-completes the parent (explicit, per native).
export interface SubtaskListProps {
  subtasks: Todo[]; // children sorted by sortIndex
  onAdd: (title: string) => void;
  onToggle: (id: string) => void;
  onReorder: (id: string, beforeId: string | null, afterId: string | null) => void;
  onOpen?: (id: string) => void; // open the subtask's detail (e.g. a research report)
}

export function SubtaskList({
  subtasks,
  onAdd,
  onToggle,
  onReorder,
  onOpen,
}: SubtaskListProps) {
  const [draft, setDraft] = useState("");
  const dragFrom = useRef<number | null>(null);
  const allDone = subtasks.length > 0 && subtasks.every((s) => s.status === "done");

  function submit() {
    const title = draft.trim();
    if (!title) return;
    onAdd(title);
    setDraft("");
  }

  return (
    <section className={styles.section} aria-label="Subtasks">
      <ul className={styles.list} role="list">
        {subtasks.map((s, i) => (
          <li
            key={s.id}
            className={styles.item}
            data-done={s.status === "done"}
            draggable
            onDragStart={() => (dragFrom.current = i)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              const from = dragFrom.current;
              dragFrom.current = null;
              if (from === null || from === i) return;
              const ids = subtasks.map((t) => t.id);
              const { beforeId, afterId } = neighborsForDrop(ids, from, i);
              onReorder(subtasks[from].id, beforeId, afterId);
            }}
          >
            <button
              type="button"
              role="checkbox"
              aria-checked={s.status === "done"}
              aria-label={`Complete ${s.title}`}
              className={styles.check}
              onClick={() => onToggle(s.id)}
            >
              {s.status === "done" ? "✓" : ""}
            </button>
            {onOpen ? (
              <button
                type="button"
                className={styles.titleButton}
                onClick={() => onOpen(s.id)}
                title="Open"
              >
                {s.title}
              </button>
            ) : (
              <span className={styles.title}>{s.title}</span>
            )}
            {s.actionState === "done" && s.status === "open" ? (
              <button
                type="button"
                className={styles.markDone}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggle(s.id);
                }}
                aria-label={`Mark ${s.title} done`}
              >
                Mark done
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {allDone ? (
        <p className={styles.allDoneCue} data-testid="subtasks-all-done">
          ✓ All steps done — ready to wrap up.
        </p>
      ) : null}
      <input
        className={styles.add}
        placeholder="Add subtask…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
    </section>
  );
}
