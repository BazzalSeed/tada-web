import { describe, expect, it } from "vitest";
import type { SavedView, Todo, TodoLabel } from "@/lib/contracts";
import { initialState, reducer, paletteItemsFor } from "../store";

const todo: Todo = {
  id: "t1",
  createdAt: "2026-06-26T09:00:00",
  sourceCaptureId: "c1",
  title: "Email Dakota",
  status: "open",
  actionType: "none",
  actionState: "none",
  sortIndex: 0,
  priority: "none",
  labelIds: [],
};

const view: SavedView = {
  id: "v1",
  name: "Work",
  colorHex: "#c8632e",
  icon: "briefcase",
  sortIndex: 0,
  criteria: { labelIds: [], dateWindow: "any", includeCompleted: false },
};

const label: TodoLabel = { id: "l1", name: "errand", colorHex: "#5d574d" };

describe("store reducer", () => {
  it("starts on the All view with nothing selected", () => {
    expect(initialState.selection).toEqual({ kind: "all" });
    expect(initialState.selectedTodoId).toBeNull();
  });

  it("loads data via SET_DATA", () => {
    const s = reducer(initialState, {
      type: "SET_DATA",
      todos: [todo],
      views: [view],
      labels: [label],
    });
    expect(s.todos).toHaveLength(1);
    expect(s.views).toHaveLength(1);
    expect(s.labels).toHaveLength(1);
  });

  it("changes the nav selection and clears the selected todo", () => {
    const s0 = reducer(initialState, { type: "SELECT_TODO", id: "t1" });
    const s1 = reducer(s0, { type: "SELECT_NAV", selection: { kind: "today" } });
    expect(s1.selection).toEqual({ kind: "today" });
    expect(s1.selectedTodoId).toBeNull();
  });

  it("selects and deselects a todo", () => {
    const s1 = reducer(initialState, { type: "SELECT_TODO", id: "t1" });
    expect(s1.selectedTodoId).toBe("t1");
    const s2 = reducer(s1, { type: "SELECT_TODO", id: null });
    expect(s2.selectedTodoId).toBeNull();
  });

  it("upserts a label by id", () => {
    const s1 = reducer(initialState, { type: "UPSERT_LABEL", label });
    expect(s1.labels).toHaveLength(1);
    const renamed = { ...label, name: "errands" };
    const s2 = reducer(s1, { type: "UPSERT_LABEL", label: renamed });
    expect(s2.labels).toHaveLength(1);
    expect(s2.labels[0].name).toBe("errands");
  });

  it("upserts a saved view by id", () => {
    const s1 = reducer(initialState, { type: "UPSERT_VIEW", view });
    expect(s1.views).toHaveLength(1);
    const renamed = { ...view, name: "Job" };
    const s2 = reducer(s1, { type: "UPSERT_VIEW", view: renamed });
    expect(s2.views).toHaveLength(1);
    expect(s2.views[0].name).toBe("Job");
  });

  it("relabels a temp label id → persisted id across labels, todos, and views", () => {
    const temp: TodoLabel = { id: "temp-1", name: "pets", colorHex: "#c8632e" };
    const tagged: Todo = { ...todo, id: "t9", labelIds: ["temp-1", "other"] };
    const taggedView: SavedView = {
      ...view,
      id: "v9",
      criteria: { labelIds: ["temp-1"], dateWindow: "any", includeCompleted: false },
    };
    const s0 = {
      ...initialState,
      labels: [temp],
      todos: [tagged],
      views: [taggedView],
    };
    const real: TodoLabel = { id: "l-pets", name: "pets", colorHex: "#c8632e" };
    const s1 = reducer(s0, { type: "RELABEL", fromId: "temp-1", label: real });
    expect(s1.labels).toEqual([real]);
    expect(s1.todos[0].labelIds).toEqual(["l-pets", "other"]);
    expect(s1.views[0].criteria.labelIds).toEqual(["l-pets"]);
  });

  it("deletes a saved view by id", () => {
    const s1 = reducer(initialState, { type: "UPSERT_VIEW", view });
    expect(s1.views).toHaveLength(1);
    const s2 = reducer(s1, { type: "DELETE_VIEW", id: view.id });
    expect(s2.views).toHaveLength(0);
  });

  it("upserts a capture by id (keyed map for row thumbnails)", () => {
    const capture = {
      id: "cap1",
      createdAt: "2026-06-26T09:00:00",
      kind: "image" as const,
      blobPath: "https://blob/x.png",
    };
    const s = reducer(initialState, { type: "UPSERT_CAPTURE", capture });
    expect(s.captures["cap1"].blobPath).toBe("https://blob/x.png");
  });

  it("derives palette items ranked views → labels → todos", () => {
    const items = paletteItemsFor({
      ...initialState,
      todos: [todo],
      views: [view],
      labels: [label],
    });
    expect(items.map((i) => i.kind)).toEqual(["view", "label", "todo"]);
    expect(items[0]).toMatchObject({ label: "Work", selection: { kind: "project", id: "v1" } });
    expect(items[2]).toMatchObject({ kind: "todo", id: "t1", label: "Email Dakota" });
  });
});
