"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { Priority, RecurFreq, Todo, TodoLabel } from "@/lib/contracts";
import { Markdown } from "@/app/lib/markdown";
import styles from "./DetailPane.module.css";

// Right-hand notebook pane (editable). Inline title + markdown notes (write /
// preview) + property controls (priority · due · repeat · labels). Each edit
// persists through the single `onPatch` channel (the view wires it to PATCH).
// The subtask section plugs in via `children`. Remount on todo change (key) so
// local field state re-initialises.
const PRIORITIES: Priority[] = ["none", "p0", "p1", "p2"];
const PRIORITY_LABEL: Record<Priority, string> = {
  none: "—",
  p0: "P0",
  p1: "P1",
  p2: "P2",
};
const FREQS: (RecurFreq | "none")[] = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
];

export interface DetailPaneProps {
  todo: Todo | null;
  allLabels: TodoLabel[];
  onClose: () => void;
  onPatch: (patch: Partial<Todo>) => void;
  onCreateLabel: (name: string) => TodoLabel;
  offer?: ReactNode; // the "do it for me" offer panel (FIX2)
  onTodoLink?: (id: string) => void; // open another todo from an in-note link
  children?: ReactNode;
  /** When the viewed todo is a subtask, a clickable crumb back to its parent. */
  parentCrumb?: { title: string; onClick: () => void };
  /** Inline-expanded research subtask report; rendered below the notes block. */
  inlineReport?: { todo: Todo; onClose: () => void } | null;
}

export function DetailPane({
  todo,
  allLabels,
  onClose,
  onPatch,
  onCreateLabel,
  offer,
  onTodoLink,
  children,
  parentCrumb,
  inlineReport,
}: DetailPaneProps) {
  const [title, setTitle] = useState(todo?.title ?? "");
  const [detail, setDetail] = useState(todo?.detail ?? "");
  const [notesMode, setNotesMode] = useState<"preview" | "write">("preview");
  const [newLabel, setNewLabel] = useState("");

  // Keep local `detail` in sync with external updates (e.g. research append, 5s poll)
  // while NOT actively editing, so switching to write shows the freshest text.
  useEffect(() => {
    if (notesMode === "preview") setDetail(todo?.detail ?? "");
  }, [todo?.detail, notesMode]);

  if (!todo) return null;

  const labelIds = todo.labelIds;

  function toggleLabel(id: string) {
    const next = labelIds.includes(id)
      ? labelIds.filter((x) => x !== id)
      : [...labelIds, id];
    onPatch({ labelIds: next });
  }

  function createLabel() {
    const name = newLabel.trim().toLowerCase();
    if (!name) return;
    const label = onCreateLabel(name);
    setNewLabel("");
    onPatch({ labelIds: [...labelIds, label.id] });
  }

  return (
    <aside className={styles.pane} aria-label="Todo detail">
      <div className={styles.header}>
        {parentCrumb ? (
          <button
            type="button"
            className={styles.parentCrumb}
            onClick={parentCrumb.onClick}
            title={parentCrumb.title}
          >
            ← {parentCrumb.title}
          </button>
        ) : (
          <span className={styles.crumb}>Detail</span>
        )}
        <button
          type="button"
          className={styles.close}
          aria-label="Close detail"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <input
        className={styles.title}
        aria-label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        onBlur={() => {
          if (title.trim() && title !== todo.title) onPatch({ title });
        }}
      />

      {/* Properties */}
      <div className={styles.props}>
        <div className={styles.propRow} role="group" aria-label="Priority">
          {PRIORITIES.map((p) => (
            <button
              key={p}
              type="button"
              className={styles.prio}
              data-priority={p}
              data-active={todo.priority === p}
              aria-pressed={todo.priority === p}
              aria-label={`Set priority ${p}`}
              onClick={() => onPatch({ priority: p })}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Due date</span>
          <input
            type="date"
            aria-label="Due date"
            value={todo.dueAt ? todo.dueAt.slice(0, 10) : ""}
            onChange={(e) =>
              onPatch({
                dueAt: e.target.value ? `${e.target.value}T00:00:00` : null,
              })
            }
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>Repeat</span>
          <select
            aria-label="Repeat"
            value={todo.recurrence?.frequency ?? "none"}
            onChange={(e) =>
              onPatch({
                recurrence:
                  e.target.value === "none"
                    ? null
                    : { frequency: e.target.value as RecurFreq },
              })
            }
          >
            {FREQS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Labels */}
      <div className={styles.labels}>
        {allLabels.map((l) => (
          <button
            key={l.id}
            type="button"
            className={styles.labelChip}
            data-active={labelIds.includes(l.id)}
            aria-pressed={labelIds.includes(l.id)}
            aria-label={`Toggle label ${l.name}`}
            onClick={() => toggleLabel(l.id)}
          >
            <span className={styles.dot} style={{ background: l.colorHex }} />
            {l.name}
          </button>
        ))}
        <input
          className={styles.newLabel}
          placeholder="New label…"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              createLabel();
            }
          }}
        />
      </div>

      {/* The "do it for me" offer (FIX2) — the concrete effect + the tap that
          confirms it. Sits above notes so research can write into them below. */}
      {offer ? <div className={styles.offerSlot}>{offer}</div> : null}

      {/* Notes (markdown) */}
      <div className={styles.notes}>
        <div className={styles.notesHead}>
          <span className={styles.sectionTitle}>Notes</span>
          <button
            type="button"
            className={styles.modeToggle}
            onClick={() =>
              setNotesMode((m) => (m === "preview" ? "write" : "preview"))
            }
          >
            {notesMode === "preview" ? "Write" : "Preview"}
          </button>
        </div>
        {notesMode === "write" ? (
          <textarea
            className={styles.notesInput}
            aria-label="Notes"
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            onBlur={() => {
              if (detail !== (todo.detail ?? "")) onPatch({ detail });
            }}
          />
        ) : (
          <div className={styles.notesPreview}>
            {(todo.detail ?? "").trim() ? (
              <Markdown source={todo.detail ?? ""} onTodoLink={onTodoLink} />
            ) : (
              <p className={styles.empty}>No notes yet.</p>
            )}
          </div>
        )}
      </div>

      {/* Inline-expanded research subtask report (A) */}
      {inlineReport ? (
        <div className={styles.inlineReport}>
          <div className={styles.inlineReportHead}>
            <span className={styles.inlineReportTitle}>{inlineReport.todo.title}</span>
            <button
              type="button"
              className={styles.inlineReportCollapse}
              aria-label="Collapse report"
              onClick={inlineReport.onClose}
            >
              Collapse
            </button>
          </div>
          {inlineReport.todo.detail?.trim() ? (
            <Markdown source={inlineReport.todo.detail} onTodoLink={onTodoLink} />
          ) : (
            <p className={styles.empty}>No report yet.</p>
          )}
        </div>
      ) : null}

      {children ? (
        <div className={styles.section}>
          <p className={styles.sectionTitle}>Subtasks</p>
          {children}
        </div>
      ) : null}
    </aside>
  );
}
