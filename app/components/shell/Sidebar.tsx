"use client";

import type { ReactNode } from "react";
import type { SavedView, TodoLabel, ViewSelection } from "@/lib/contracts";
import styles from "./Sidebar.module.css";

// ── Sidebar toggle icons ───────────────────────────────────────────────────

/** Collapse icon — sidebar panel with left divider. Shown when sidebar is expanded. */
function IconCollapse() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <line x1="10" y1="4" x2="10" y2="20" />
    </svg>
  );
}

/** Expand icon — panel with right-pointing arrow. Shown when sidebar is collapsed. */
function IconExpand() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <line x1="14" y1="4" x2="14" y2="20" />
      <path d="M6.5 12h5" />
      <path d="M9 9.5l2.5 2.5L9 14.5" />
    </svg>
  );
}

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

// ── Inline SVG icons — all 24×24 viewBox, rendered at 16px ────────────────

function IconAll() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M20 4H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3v3l4-3h9a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1z" />
    </svg>
  );
}

function IconToday() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <circle cx="12" cy="15" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Funnel / filter — used for saved Views. Tinted by the view's colorHex. */
function IconView() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 4h16l-6 8v6l-4-2v-4L4 4z" />
    </svg>
  );
}

/** Tag glyph — used for Labels. Tinted by the label's colorHex. */
function IconLabel() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12.5 2H5a2 2 0 0 0-2 2v7.5a2 2 0 0 0 .59 1.41l8.5 8.5a2 2 0 0 0 2.82 0l7-7a2 2 0 0 0 0-2.83l-8.5-8.5A2 2 0 0 0 12.5 2z" />
      <circle cx="8" cy="9" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ── NavItem ────────────────────────────────────────────────────────────────

interface NavItemProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  prefix?: string;
  icon?: ReactNode;
}

function NavItem({ label, selected, onClick, prefix, icon }: NavItemProps) {
  return (
    <button
      type="button"
      className={`${styles.item} ${selected ? styles.active : ""}`}
      aria-current={selected ? "true" : undefined}
      aria-label={label}
      onClick={onClick}
    >
      {/* Fixed-width leading slot — keeps all labels at the same x regardless
          of whether the item has an SVG icon or is a colored view/label. */}
      <span className={styles.itemIcon}>
        {icon}
      </span>
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
  /** Called when the user clicks the collapse/expand toggle button. */
  onToggle?: () => void;
  /** When provided, each label row shows a ✕ delete affordance. */
  onDeleteLabel?: (label: TodoLabel) => void;
}

export function Sidebar({
  selection,
  views,
  labels,
  onSelect,
  onCreateView,
  onEditView,
  collapsed,
  onToggle,
  onDeleteLabel,
}: SidebarProps) {
  return (
    <nav
      className={styles.sidebar}
      aria-label="Primary"
      data-collapsed={collapsed || undefined}
    >
      {/* Header row: wordmark + collapse/expand toggle */}
      <div className={styles.header}>
        <p className={styles.wordmark}>Tada</p>
        {onToggle !== undefined && (
          <button
            type="button"
            className={styles.toggleBtn}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            onClick={onToggle}
          >
            {collapsed ? <IconExpand /> : <IconCollapse />}
          </button>
        )}
      </div>

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
              icon={<IconView />}
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
            <div key={l.id} className={styles.labelRow}>
              <NavItem
                label={l.name}
                icon={<IconLabel />}
                prefix="#"
                selected={sameSelection(selection, { kind: "label", id: l.id })}
                onClick={() => onSelect({ kind: "label", id: l.id })}
              />
              {onDeleteLabel ? (
                <button
                  type="button"
                  className={styles.deleteLabel}
                  aria-label={`Delete #${l.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteLabel(l);
                  }}
                >
                  ✕
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </nav>
  );
}
