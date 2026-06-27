"use client";

import { useState } from "react";
import type { FilterCriteria, TodoLabel } from "@/lib/contracts";
import { FilterBuilder } from "./FilterBuilder";
import styles from "./ViewEditor.module.css";

// T1.8b — create/edit a SavedView: a name + the full FilterCriteria builder.
// Save is gated on a non-empty name; edit mode exposes Delete. Pure UI — the
// host persists via UPSERT_VIEW (and label ids are already resolved upstream).
export interface ViewEditorProps {
  mode: "create" | "edit";
  initialName?: string;
  initialCriteria: FilterCriteria;
  labels: TodoLabel[];
  onSave: (name: string, criteria: FilterCriteria) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export function ViewEditor({
  mode,
  initialName = "",
  initialCriteria,
  labels,
  onSave,
  onCancel,
  onDelete,
}: ViewEditorProps) {
  const [name, setName] = useState(initialName);
  const [criteria, setCriteria] = useState<FilterCriteria>(initialCriteria);

  function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed, criteria);
  }

  return (
    <div className={styles.editor}>
      <label className={styles.nameField}>
        <span className={styles.label}>View name</span>
        <input
          className={styles.nameInput}
          value={name}
          autoFocus
          placeholder="e.g. Deep work"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            } else if (e.key === "Escape") {
              onCancel();
            }
          }}
        />
      </label>

      <FilterBuilder value={criteria} labels={labels} onChange={setCriteria} />

      <div className={styles.actions}>
        {mode === "edit" && onDelete ? (
          <button
            type="button"
            className={styles.delete}
            onClick={onDelete}
          >
            Delete
          </button>
        ) : null}
        <span className={styles.spacer} />
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.save}
          disabled={!name.trim()}
          onClick={save}
        >
          Save view
        </button>
      </div>
    </div>
  );
}
