"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { NavSelection } from "./Sidebar";
import styles from "./CommandPalette.module.css";

// ⌘K quick-find. Results are ranked views → labels → todos (native parity).
// A `view`/`label` item routes to a NavSelection; a `todo` item opens detail.
export type PaletteItem =
  | { kind: "view"; id: string; label: string; selection: NavSelection }
  | { kind: "label"; id: string; label: string; selection: NavSelection }
  | { kind: "todo"; id: string; label: string };

const RANK: Record<PaletteItem["kind"], number> = { view: 0, label: 1, todo: 2 };

export interface CommandPaletteProps {
  open: boolean;
  items: PaletteItem[];
  onClose: () => void;
  onSelect: (item: PaletteItem) => void;
}

export function CommandPalette({
  open,
  items,
  onClose,
  onSelect,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      inputRef.current?.focus();
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? items.filter((i) => i.label.toLowerCase().includes(q))
      : items;
    return [...matched].sort((a, b) => RANK[a.kind] - RANK[b.kind]);
  }, [items, query]);

  if (!open) return null;

  function move(delta: number) {
    setActive((a) => {
      if (filtered.length === 0) return 0;
      return (a + delta + filtered.length) % filtered.length;
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = filtered[active];
      if (item) onSelect(item);
    }
  }

  return (
    <div className={styles.overlay} onMouseDown={onClose}>
      <div
        className={styles.palette}
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
          aria-label="Search views, labels, and todos"
          className={styles.input}
          placeholder="Search views, labels, todos…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
        <ul className={styles.list} id="palette-list" role="listbox">
          {filtered.map((item, i) => (
            <li
              key={`${item.kind}:${item.kind === "todo" ? item.id : item.id}`}
              role="option"
              aria-selected={i === active}
              className={`${styles.option} ${i === active ? styles.active : ""}`}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item);
              }}
            >
              <span className={styles.kind}>{item.kind}</span>
              <span className={styles.optionLabel}>{item.label}</span>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className={styles.empty}>No matches</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
