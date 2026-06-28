"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { SavedView, TodoLabel } from "@/lib/contracts";
import { Sidebar, type NavSelection } from "./Sidebar";
import { CommandPalette, type PaletteItem } from "./CommandPalette";
import styles from "./AppShell.module.css";

// Three-pane shell: Sidebar | Content list (children) | Detail pane (the `detail`
// slot — slides in when non-null). Owns only ephemeral UI state (⌘K palette
// open); selection and the rendered detail are controlled by the parent (the
// store), keeping the model out of the list's hot path.
export interface AppShellProps {
  selection: NavSelection;
  detail: ReactNode; // the detail pane content; null when nothing is selected
  views: SavedView[];
  labels: TodoLabel[];
  paletteItems: PaletteItem[];
  onSelectNav: (sel: NavSelection) => void;
  onPaletteSelect: (item: PaletteItem) => void;
  onCreateView: () => void;
  onEditView: (view: SavedView) => void;
  overlay?: ReactNode; // modal layer (e.g. the view filter-builder)
  children: ReactNode;
}

export function AppShell({
  selection,
  detail,
  views,
  labels,
  paletteItems,
  onSelectNav,
  onPaletteSelect,
  onCreateView,
  onEditView,
  overlay,
  children,
}: AppShellProps) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [detailWidth, setDetailWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Load persisted detail-pane width on mount (SSR-safe).
  useEffect(() => {
    const v = Number(window.localStorage.getItem("tada:detailWidth"));
    if (v) setDetailWidth(v);
  }, []);

  // Load persisted sidebar-collapsed state on mount (SSR-safe).
  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem("tada:sidebarCollapsed") === "1");
  }, []);

  const toggleSidebar = () =>
    setSidebarCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem("tada:sidebarCollapsed", next ? "1" : "0");
      return next;
    });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const detailOpen = detail != null;

  return (
    <div
      className={`${styles.shell} ${detailOpen ? styles.detailOpen : ""}`}
      data-testid="shell-root"
      data-detail-open={detailOpen}
      data-resizing={resizing || undefined}
      data-sidebar-collapsed={sidebarCollapsed || undefined}
      style={{ ["--detail-width" as string]: detailWidth ? `${detailWidth}px` : undefined }}
    >
      <button
        className={styles.sidebarToggle}
        aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!sidebarCollapsed}
        onClick={toggleSidebar}
        type="button"
      >
        {sidebarCollapsed ? "»" : "«"}
      </button>

      <div className={styles.sidebar}>
        <Sidebar
          selection={selection}
          views={views}
          labels={labels}
          onSelect={onSelectNav}
          onCreateView={onCreateView}
          onEditView={onEditView}
          collapsed={sidebarCollapsed}
        />
      </div>

      <main className={styles.content}>{children}</main>

      <div className={styles.detail}>
        {detailOpen ? (
          <div
            className={styles.resizer}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize detail panel"
            onPointerDown={(e) => {
              e.preventDefault();
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
              setResizing(true);
            }}
            onPointerMove={(e) => {
              if (!resizing) return;
              const w = Math.min(
                Math.max(window.innerWidth - e.clientX, 320),
                Math.round(window.innerWidth * 0.6),
              );
              setDetailWidth(w);
            }}
            onPointerUp={(e) => {
              (e.target as HTMLElement).releasePointerCapture(e.pointerId);
              setResizing(false);
              setDetailWidth((w) => {
                if (w) window.localStorage.setItem("tada:detailWidth", String(w));
                return w;
              });
            }}
          />
        ) : null}
        {detail}
      </div>

      {overlay}

      <CommandPalette
        open={paletteOpen}
        items={paletteItems}
        onClose={() => setPaletteOpen(false)}
        onSelect={(item) => {
          setPaletteOpen(false);
          onPaletteSelect(item);
        }}
      />
    </div>
  );
}
