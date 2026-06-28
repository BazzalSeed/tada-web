"use client";

import type { ReactNode } from "react";
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

// ── Inline SVG icons (16px, currentColor) ─────────────────────────────────

function IconAll() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="3" y1="5" x2="13" y2="5" />
      <line x1="3" y1="8" x2="13" y2="8" />
      <line x1="3" y1="11" x2="13" y2="11" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M13 3H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2v2l3-2h5a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1z" />
    </svg>
  );
}

function IconToday() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <line x1="5" y1="1.5" x2="5" y2="5" />
      <line x1="11" y1="1.5" x2="11" y2="5" />
      <line x1="2" y1="7" x2="14" y2="7" />
      <circle cx="8" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── NavItem ────────────────────────────────────────────────────────────────

interface NavItemProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  colorHex?: string;
  prefix?: string;
  icon?: ReactNode;
}

function NavItem({ label, selected, onClick, colorHex, prefix, icon }: NavItemProps) {
  return (
    <button
      type="button"
      className={`${styles.item} ${selected ? styles.active : ""}`}
      aria-current={selected ? "true" : undefined}
      aria-label={label}
      onClick={onClick}
    >
      {icon ? <span className={styles.itemIcon}>{icon}</span> : null}
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

// ── Sidebar ────────────────────────────────────────────────────────────────

export interface SidebarProps {
  selection: NavSelection;
  views: SavedView[];
  labels: TodoLabel[];
  onSelect: (sel: NavSelection) => void;
  onCreateView: () => void;
  onEditView: (view: SavedView) => void;
  /** When true, renders a narrow icon rail instead of the full sidebar. */
  collapsed?: boolean;
}

export function Sidebar({
  selection,
  views,
  labels,
  onSelect,
  onCreateView,
  onEditView,
  collapsed,
}: SidebarProps) {
  return (
    <nav
      className={styles.sidebar}
      aria-label="Primary"
      data-collapsed={collapsed || undefined}
    >
      <p className={styles.wordmark}>Tada</p>

      <div className={styles.group}>
        <NavItem
          label="All"
          icon={<IconAll />}
          selected={sameSelection(selection, { kind: "all" })}
          onClick={() => onSelect({ kind: "all" })}
        />
        <NavItem
          label="Chat"
          icon={<IconChat />}
          selected={sameSelection(selection, { kind: "chat" })}
          onClick={() => onSelect({ kind: "chat" })}
        />
        <NavItem
          label="Today"
          icon={<IconToday />}
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
