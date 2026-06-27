"use client";

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
  onCreateView: () => void;
  onEditView: (view: SavedView) => void;
}

export function Sidebar({
  selection,
  views,
  labels,
  onSelect,
  onCreateView,
  onEditView,
}: SidebarProps) {
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
            onClick={onCreateView}
          >
            +
          </button>
        </div>
        {views.map((v) => (
          <div key={v.id} className={styles.viewRow}>
            <NavItem
              label={v.name}
              colorHex={v.colorHex}
              selected={sameSelection(selection, { kind: "project", id: v.id })}
              onClick={() => onSelect({ kind: "project", id: v.id })}
            />
            <button
              type="button"
              className={styles.edit}
              aria-label={`Edit ${v.name}`}
              onClick={() => onEditView(v)}
            >
              ···
            </button>
          </div>
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
