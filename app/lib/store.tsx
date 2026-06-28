"use client";

import {
  createContext,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { Capture, SavedView, Todo, TodoLabel } from "@/lib/contracts";
import type { NavSelection } from "@/app/components/shell/Sidebar";
import type { PaletteItem } from "@/app/components/shell/CommandPalette";
import { ensureLabel as persistLabel } from "./api";
import type { EnrichmentChip } from "@/app/lib/enrich";

const LABEL_ACCENT = "#c8632e";

// Client store — deterministic UI state over the frozen domain types. The model
// is never in the list's hot path; this holds the loaded pool + ephemeral
// selection. Data CRUD flows through the API seam (app/lib/api.ts) into
// SET_DATA / UPSERT_TODO actions.
export interface TadaState {
  todos: Todo[];
  views: SavedView[];
  labels: TodoLabel[];
  captures: Record<string, Capture>; // by id — source captures for row thumbnails
  selection: NavSelection;
  selectedTodoId: string | null;
  enrichingTodoId: string | null;
  enrichment: { todoId: string; chips: EnrichmentChip[] } | null;
}

export const initialState: TadaState = {
  todos: [],
  views: [],
  labels: [],
  captures: {},
  selection: { kind: "all" },
  selectedTodoId: null,
  enrichingTodoId: null,
  enrichment: null,
};

export type TadaAction =
  | {
      type: "SET_DATA";
      todos: Todo[];
      views: SavedView[];
      labels: TodoLabel[];
      captures?: Capture[];
    }
  | { type: "UPSERT_TODO"; todo: Todo }
  // Full reconcile of the pool from the server (background poll). Preserves
  // very-recent optimistic rows the server hasn't returned yet (avoids flicker).
  | { type: "SYNC_TODOS"; todos: Todo[]; keepIds?: string[] }
  | { type: "RECONCILE_TODO"; tempId: string; todo: Todo }
  | { type: "UPSERT_LABEL"; label: TodoLabel }
  | { type: "RELABEL"; fromId: string; label: TodoLabel }
  | { type: "UPSERT_VIEW"; view: SavedView }
  | { type: "DELETE_VIEW"; id: string }
  | { type: "UPSERT_CAPTURE"; capture: Capture }
  | { type: "SELECT_NAV"; selection: NavSelection }
  | { type: "SELECT_TODO"; id: string | null }
  | { type: "SET_ENRICHING"; id: string | null }
  | { type: "SET_ENRICHMENT"; todoId: string; chips: EnrichmentChip[] }
  | { type: "CLEAR_ENRICHMENT" };

export function reducer(state: TadaState, action: TadaAction): TadaState {
  switch (action.type) {
    case "SET_DATA":
      return {
        ...state,
        todos: action.todos,
        views: action.views,
        labels: action.labels,
        // Merge captures (keyed by id) so row thumbnails survive reload; keep any
        // already-known captures if a load omits them.
        captures: action.captures
          ? {
              ...state.captures,
              ...Object.fromEntries(action.captures.map((c) => [c.id, c])),
            }
          : state.captures,
      };
    case "UPSERT_TODO": {
      const exists = state.todos.some((t) => t.id === action.todo.id);
      return {
        ...state,
        todos: exists
          ? state.todos.map((t) => (t.id === action.todo.id ? action.todo : t))
          : [...state.todos, action.todo],
      };
    }
    case "SYNC_TODOS": {
      // Replace the pool with the authoritative server set, but keep any local
      // rows the caller flagged as in-flight (optimistic adds not yet persisted),
      // so a poll landing mid-create doesn't make them flicker out.
      const serverIds = new Set(action.todos.map((t) => t.id));
      const keep = (action.keepIds ?? []).filter((id) => !serverIds.has(id));
      const survivors = state.todos.filter((t) => keep.includes(t.id));
      return { ...state, todos: [...action.todos, ...survivors] };
    }
    case "RECONCILE_TODO": {
      // Swap the optimistic temp row for the server one (matched by tempId), so a
      // typed quick-add lands as ONE row — never the temp UUID + server cuid pair.
      // Drops any stray pre-existing row already carrying the server id (idempotent
      // if the same response is reconciled twice). Carries selection across the swap.
      const { tempId, todo } = action;
      const filtered = state.todos.filter(
        (t) => t.id !== todo.id || t.id === tempId,
      );
      const exists = filtered.some((t) => t.id === tempId);
      return {
        ...state,
        todos: exists
          ? filtered.map((t) => (t.id === tempId ? todo : t))
          : [...filtered, todo],
        selectedTodoId:
          state.selectedTodoId === tempId ? todo.id : state.selectedTodoId,
      };
    }
    case "UPSERT_LABEL": {
      const exists = state.labels.some((l) => l.id === action.label.id);
      return {
        ...state,
        labels: exists
          ? state.labels.map((l) =>
              l.id === action.label.id ? action.label : l,
            )
          : [...state.labels, action.label],
      };
    }
    case "RELABEL": {
      // Swap an optimistic temp label id for its persisted one everywhere it's
      // referenced (label list, todos, view criteria). Keeps inline-created
      // labels on stable server ids without blocking the optimistic UI.
      const { fromId, label } = action;
      const swap = (ids: string[]) =>
        ids.map((id) => (id === fromId ? label.id : id));
      return {
        ...state,
        labels: state.labels.map((l) => (l.id === fromId ? label : l)),
        todos: state.todos.map((t) =>
          t.labelIds.includes(fromId)
            ? { ...t, labelIds: swap(t.labelIds) }
            : t,
        ),
        views: state.views.map((v) =>
          v.criteria.labelIds.includes(fromId)
            ? { ...v, criteria: { ...v.criteria, labelIds: swap(v.criteria.labelIds) } }
            : v,
        ),
      };
    }
    case "UPSERT_CAPTURE":
      return {
        ...state,
        captures: { ...state.captures, [action.capture.id]: action.capture },
      };
    case "UPSERT_VIEW": {
      const exists = state.views.some((v) => v.id === action.view.id);
      return {
        ...state,
        views: exists
          ? state.views.map((v) =>
              v.id === action.view.id ? action.view : v,
            )
          : [...state.views, action.view],
      };
    }
    case "DELETE_VIEW":
      return { ...state, views: state.views.filter((v) => v.id !== action.id) };
    case "SELECT_NAV":
      // Changing views is read-only navigation; drop the open detail.
      return { ...state, selection: action.selection, selectedTodoId: null };
    case "SELECT_TODO":
      return { ...state, selectedTodoId: action.id };
    case "SET_ENRICHING":
      return { ...state, enrichingTodoId: action.id };
    case "SET_ENRICHMENT":
      return { ...state, enrichment: { todoId: action.todoId, chips: action.chips } };
    case "CLEAR_ENRICHMENT":
      return { ...state, enrichment: null };
    default:
      return state;
  }
}

// ⌘K quick-find source, ranked views → labels → todos (native parity).
export function paletteItemsFor(state: TadaState): PaletteItem[] {
  return [
    ...state.views.map(
      (v): PaletteItem => ({
        kind: "view",
        id: v.id,
        label: v.name,
        selection: { kind: "project", id: v.id },
      }),
    ),
    ...state.labels.map(
      (l): PaletteItem => ({
        kind: "label",
        id: l.id,
        label: l.name,
        selection: { kind: "label", id: l.id },
      }),
    ),
    ...state.todos
      .filter((t) => t.status === "open")
      .map((t): PaletteItem => ({ kind: "todo", id: t.id, label: t.title })),
  ];
}

interface TadaContextValue {
  state: TadaState;
  dispatch: React.Dispatch<TadaAction>;
}

const TadaContext = createContext<TadaContextValue | null>(null);

export function TadaProvider({
  children,
  preload,
}: {
  children: ReactNode;
  preload?: Partial<TadaState>;
}) {
  const [state, dispatch] = useReducer(reducer, {
    ...initialState,
    ...preload,
  });
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <TadaContext.Provider value={value}>{children}</TadaContext.Provider>;
}

export function useTada(): TadaContextValue {
  const ctx = useContext(TadaContext);
  if (!ctx) throw new Error("useTada must be used within a TadaProvider");
  return ctx;
}

// Inline label creation with a stable, persisted id. Returns a label SYNCHRONOUSLY
// (existing match, or an optimistic temp) so the UI never blocks; for a new name
// it persists via POST /api/labels and reconciles the temp id → server id in the
// background (RELABEL). Shared by quick-add @tokens, the detail pane, and
// enrichment's suggestedLabels so every inline label lands on a real id.
export function useEnsureLabel(): (name: string) => TodoLabel {
  const { state, dispatch } = useTada();
  return (rawName: string): TodoLabel => {
    const name = rawName.toLowerCase();
    const existing = state.labels.find((l) => l.name === name);
    if (existing) return existing;
    const temp: TodoLabel = {
      id: crypto.randomUUID(),
      name,
      colorHex: LABEL_ACCENT,
    };
    dispatch({ type: "UPSERT_LABEL", label: temp });
    persistLabel(name)
      .then((real) => {
        dispatch(
          real.id === temp.id
            ? { type: "UPSERT_LABEL", label: real }
            : { type: "RELABEL", fromId: temp.id, label: real },
        );
      })
      .catch(() => {
        // interim: keep the optimistic temp label until persistence is authed.
      });
    return temp;
  };
}
