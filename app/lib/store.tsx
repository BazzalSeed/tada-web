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
}

export const initialState: TadaState = {
  todos: [],
  views: [],
  labels: [],
  captures: {},
  selection: { kind: "all" },
  selectedTodoId: null,
};

export type TadaAction =
  | { type: "SET_DATA"; todos: Todo[]; views: SavedView[]; labels: TodoLabel[] }
  | { type: "UPSERT_TODO"; todo: Todo }
  | { type: "UPSERT_LABEL"; label: TodoLabel }
  | { type: "UPSERT_VIEW"; view: SavedView }
  | { type: "UPSERT_CAPTURE"; capture: Capture }
  | { type: "SELECT_NAV"; selection: NavSelection }
  | { type: "SELECT_TODO"; id: string | null };

export function reducer(state: TadaState, action: TadaAction): TadaState {
  switch (action.type) {
    case "SET_DATA":
      return {
        ...state,
        todos: action.todos,
        views: action.views,
        labels: action.labels,
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
    case "SELECT_NAV":
      // Changing views is read-only navigation; drop the open detail.
      return { ...state, selection: action.selection, selectedTodoId: null };
    case "SELECT_TODO":
      return { ...state, selectedTodoId: action.id };
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
