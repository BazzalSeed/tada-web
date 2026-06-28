// ============================================================================
// FROZEN v0 CONTRACT — pure, deterministic flow core (DECLARATION-ONLY SEAM).
// Types + frozen function SIGNATURES for filtering, view-selection mapping,
// quick-add parse, fractional drag-index, and recurrence. Everything is pure
// and `now`-injected for testability.
//
// Implementations (T1.1) live in `lib/core/` (Backend-owned), typed against
// these aliases so any signature drift fails `tsc`. Import the runtime fns from
// "@/lib/core"; import these types/interfaces from "@/lib/contracts".
// These signatures are LAW — do not change one without the Architect.
// ============================================================================

import type {
  FilterCriteria,
  Priority,
  RecurrenceRule,
  SavedView,
  Todo,
  ViewSelection,
} from "./types";

// ---- Quick-add parse shapes (live highlight) ----
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

// ---- Frozen signatures (LAW). lib/core implements these exact types. ----

// Filtering (native FilterEngine order):
// dismissed-out -> status (open unless includeCompleted) -> priority >= minPriority
//   -> labels ANY-of -> dateWindow.
export type ApplyFilter = (c: FilterCriteria, todos: Todo[], now: Date) => Todo[];

// Maps a sidebar selection to its FilterCriteria (SavedView lookup for projects).
export type CriteriaFor = (sel: ViewSelection, views: SavedView[]) => FilterCriteria;

// Quick-add parse. tokens: p0/p1/p2 - #label -
//   today|tomorrow|tmr|<weekday>|<ISO yyyy-MM-dd> - "every <unit|weekday>".
//   Recurrence is scanned before bare weekday dates.
export type ParseQuickAdd = (text: string, now?: Date) => ParsedQuickAdd;

// Fractional drag-reorder index: one-off drop between two neighbors; no re-sequence.
export type Between = (before: number | null, after: number | null) => number;

// Recurrence next-occurrence math; pure date arithmetic, deterministic given `now`.
export type NextOccurrence = (
  after: Date,
  rule: RecurrenceRule,
  now?: Date,
) => Date | null;
