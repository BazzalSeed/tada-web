import type {
  FilterCriteria,
  SavedView,
  Todo,
  TodoLabel,
  ViewSelection,
} from "@/lib/contracts";
import { applyFilter, criteriaFor } from "@/lib/core";
import type { TadaState } from "./store";
import type { SubtaskCount } from "@/app/components/todo/TodoList";

const VIEW_ACCENT = "#c8632e";

// Derives the visible list for the current selection using the frozen pure flow
// core (T1.1): criteriaFor(selection) → applyFilter. Top-level todos only
// (subtasks render under their parent), split into open + scoped Done, each
// sorted by fractional sortIndex.
export function visibleTodos(
  state: TadaState,
  now: Date,
): { open: Todo[]; done: Todo[] } {
  const sel: ViewSelection =
    state.selection.kind === "chat" ? { kind: "all" } : state.selection;
  const criteria: FilterCriteria = criteriaFor(sel, state.views);
  const top = state.todos.filter((t) => !t.parentId);
  // includeCompleted true so we can render the scoped Done section ourselves.
  const filtered = applyFilter({ ...criteria, includeCompleted: true }, top, now);
  const sorted = [...filtered].sort((a, b) => a.sortIndex - b.sortIndex);
  return {
    open: sorted.filter((t) => t.status === "open"),
    done: sorted.filter((t) => t.status === "done"),
  };
}

export function subtaskCountsFor(todos: Todo[]): Record<string, SubtaskCount> {
  const counts: Record<string, SubtaskCount> = {};
  for (const t of todos) {
    if (!t.parentId) continue;
    const c = (counts[t.parentId] ??= { done: 0, total: 0 });
    c.total += 1;
    if (t.status === "done") c.done += 1;
  }
  return counts;
}

// One-level children grouped under their parent, sorted by fractional index.
export function childrenByParentFrom(todos: Todo[]): Record<string, Todo[]> {
  const map: Record<string, Todo[]> = {};
  for (const t of todos) {
    if (!t.parentId) continue;
    (map[t.parentId] ??= []).push(t);
  }
  for (const id of Object.keys(map)) {
    map[id].sort((a, b) => a.sortIndex - b.sortIndex);
  }
  return map;
}

export function labelsByIdFrom(labels: TodoLabel[]): Record<string, TodoLabel> {
  return Object.fromEntries(labels.map((l) => [l.id, l]));
}

// "Save this filter as a view": snapshots the current selection's criteria into
// a named SavedView. Chat isn't a filter-View → falls back to All criteria.
export function createViewFromSelection(
  name: string,
  state: TadaState,
  id: string,
  sortIndex: number,
): SavedView {
  const sel: ViewSelection =
    state.selection.kind === "chat" ? { kind: "all" } : state.selection;
  const criteria = criteriaFor(sel, state.views);
  return {
    id,
    name,
    colorHex: VIEW_ACCENT,
    icon: "filter",
    sortIndex,
    criteria,
  };
}
