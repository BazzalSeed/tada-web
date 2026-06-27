"use client";

import { useState } from "react";
import type { SavedView, TodoLabel, ViewSelection } from "@/lib/contracts";
import styles from "./Sidebar.module.css";

// The sidebar selects a read-only filter-View (ViewSelection) OR the Chat
// destination. Chat is a destination, not a filter-View (spec §3/§7), so the
// nav model is broader than ViewSelection.
export type NavSelection = ViewSelection | { kind: "chat" };

function sameSelection(a: NavSelection, b: NavSelection): boolean {
  if (a.kind !== b.kind) return false;
  if (
    (a.kind === "project" || a.kind === "label") &&
    (b.kind === "project" || b.kind === "label")
  ) {
    return a.id === b.id;
  }
  return true;
}

interface NavItemProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  colorHex?: string;
  prefix?: string;
}

function NavItem({ label, selected, onClick, colorHex, prefix }: NavItemProps) {
  return (
    <button
      type="button"
      className={`${styles.item} ${selected ? styles.active : ""}`}
      aria-current={selected ? "true" : undefined}
      aria-label={label}
      onClick={onClick}
    >
      {colorHex ? (
        <span className={styles.dot} style={{ background: colorHex }} />
      ) : null}
      <span className={styles.itemLabel}>
        {prefix ? <span className={styles.prefix}>{prefix}</span> : null}
        {label}
      </span>
    </button>
  );
}

export interface SidebarProps {
  selection: NavSelection;
  views: SavedView[];
  labels: TodoLabel[];
  onSelect: (sel: NavSelection) => void;
  onAddView: (name: string) => void;
}

export function Sidebar({
  selection,
  views,
  labels,
  onSelect,
  onAddView,
}: SidebarProps) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  function submitView() {
    const name = draft.trim();
    if (!name) return;
    onAddView(name);
    setDraft("");
    setAdding(false);
  }

  return (
    <nav className={styles.sidebar} aria-label="Primary">
      <p className={styles.wordmark}>Tada</p>

      <div className={styles.group}>
        <NavItem
          label="All"
          selected={sameSelection(selection, { kind: "all" })}
          onClick={() => onSelect({ kind: "all" })}
        />
        <NavItem
          label="Chat"
          selected={sameSelection(selection, { kind: "chat" })}
          onClick={() => onSelect({ kind: "chat" })}
        />
        <NavItem
          label="Today"
          selected={sameSelection(selection, { kind: "today" })}
          onClick={() => onSelect({ kind: "today" })}
        />
      </div>

      <div className={styles.group}>
        <div className={styles.sectionHead}>
          <span className={styles.sectionTitle}>Views</span>
          <button
            type="button"
            className={styles.add}
            aria-label="Add view"
            onClick={() => setAdding((a) => !a)}
          >
            +
          </button>
        </div>
        {adding ? (
          <input
            className={styles.viewInput}
            placeholder="View name…"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitView();
              } else if (e.key === "Escape") {
                setAdding(false);
                setDraft("");
              }
            }}
            onBlur={() => {
              if (!draft.trim()) setAdding(false);
            }}
          />
        ) : null}
        {views.map((v) => (
          <NavItem
            key={v.id}
            label={v.name}
            colorHex={v.colorHex}
            selected={sameSelection(selection, { kind: "project", id: v.id })}
            onClick={() => onSelect({ kind: "project", id: v.id })}
          />
        ))}
      </div>

      {labels.length > 0 ? (
        <div className={styles.group}>
          <div className={styles.sectionHead}>
            <span className={styles.sectionTitle}>Labels</span>
          </div>
          {labels.map((l) => (
            <NavItem
              key={l.id}
              label={l.name}
              prefix="@"
              colorHex={l.colorHex}
              selected={sameSelection(selection, { kind: "label", id: l.id })}
              onClick={() => onSelect({ kind: "label", id: l.id })}
            />
          ))}
        </div>
      ) : null}
    </nav>
  );
}
