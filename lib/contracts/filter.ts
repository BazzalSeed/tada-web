// ============================================================================
// FROZEN v0 CONTRACT — pure, deterministic flow core.
// Filtering, view-selection mapping, quick-add parse, fractional drag-index,
// and recurrence. Everything here is pure and `now`-injected for testability
// (T1.1 implements the bodies against native parity tests).
// ============================================================================

import type {
  FilterCriteria,
  Priority,
  RecurrenceRule,
  SavedView,
  Todo,
  ViewSelection,
} from "./types";

// ---- Filtering (native FilterEngine order) ----
// dismissed-out -> status (open unless includeCompleted) -> priority >= minPriority
//   -> labels ANY-of -> dateWindow.
export function applyFilter(
  c: FilterCriteria,
  todos: Todo[],
  now: Date,
): Todo[] {
  throw new Error("not implemented");
}

// Maps a sidebar selection to its FilterCriteria (SavedView lookup for projects).
export function criteriaFor(
  sel: ViewSelection,
  views: SavedView[],
): FilterCriteria {
  throw new Error("not implemented");
}

// ---- Quick-add parse (live highlight) ----
export interface ParseToken {
  kind: "date" | "priority" | "label" | "list";
  start: number; // character offset in the original string
  length: number;
}

export interface ParsedQuickAdd {
  title: string; // remaining text after token stripping
  dueAt?: string | null;
  priority: Priority;
  labelNames: string[];
  listName?: string | null;
  recurrence?: RecurrenceRule | null;
  tokens: ParseToken[];
}

// tokens: p1/p2/p3 - @label - #list - today|tomorrow|tmr|<weekday>|<ISO yyyy-MM-dd>
//   - "every <unit|weekday>". Recurrence is scanned before bare weekday dates.
export function parseQuickAdd(text: string, now?: Date): ParsedQuickAdd {
  throw new Error("not implemented");
}

// ---- Fractional drag-reorder index ----
// One-off drop between two neighbors; no full re-sequence.
export function between(before: number | null, after: number | null): number {
  throw new Error("not implemented");
}

// ---- Recurrence (next occurrence math) ----
// Pure date arithmetic; deterministic given `now`.
export function nextOccurrence(
  after: Date,
  rule: RecurrenceRule,
  now?: Date,
): Date | null {
  throw new Error("not implemented");
}
