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
    >
      <div className={styles.sidebar}>
        <Sidebar
          selection={selection}
          views={views}
          labels={labels}
          onSelect={onSelectNav}
          onCreateView={onCreateView}
          onEditView={onEditView}
        />
      </div>

      <main className={styles.content}>{children}</main>

      <div className={styles.detail}>{detail}</div>

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
