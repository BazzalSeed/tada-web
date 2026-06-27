import { describe, expect, it } from "vitest";
import type { SavedView, Todo } from "@/lib/contracts";
import { initialState } from "../store";
import {
  childrenByParentFrom,
  createViewFromSelection,
  labelsByIdFrom,
  subtaskCountsFor,
  visibleTodos,
} from "../selectors";

const now = new Date(2026, 5, 26, 9, 0, 0);

function todo(id: string, over: Partial<Todo> = {}): Todo {
  return {
    id,
    createdAt: "2026-06-26T09:00:00",
    sourceCaptureId: "c1",
    title: `Todo ${id}`,
    status: "open",
    actionType: "none",
    actionState: "none",
    sortIndex: 0,
    priority: "none",
    labelIds: [],
    ...over,
  };
}

describe("visibleTodos", () => {
  it("splits open vs done, sorts by sortIndex, and excludes subtasks", () => {
    const state = {
      ...initialState,
      todos: [
        todo("b", { sortIndex: 2 }),
        todo("a", { sortIndex: 1 }),
        todo("d", { status: "done", sortIndex: 0 }),
        todo("child", { parentId: "a", sortIndex: 0 }),
        todo("x", { status: "dismissed", sortIndex: 5 }),
      ],
    };
    const { open, done } = visibleTodos(state, now);
    expect(open.map((t) => t.id)).toEqual(["a", "b"]);
    expect(done.map((t) => t.id)).toEqual(["d"]);
  });

  it("applies the selected view's criteria (real applyFilter via @/lib/core)", () => {
    const view: SavedView = {
      id: "v1",
      name: "Work",
      colorHex: "#c8632e",
      icon: "x",
      sortIndex: 0,
      criteria: { labelIds: ["l-work"], dateWindow: "any", includeCompleted: false },
    };
    const state = {
      ...initialState,
      views: [view],
      selection: { kind: "project" as const, id: "v1" },
      todos: [
        todo("match", { labelIds: ["l-work"], sortIndex: 0 }),
        todo("nope", { labelIds: ["l-other"], sortIndex: 1 }),
      ],
    };
    const { open } = visibleTodos(state, now);
    expect(open.map((t) => t.id)).toEqual(["match"]);
  });

  it("Today selection keeps only todos due today", () => {
    const state = {
      ...initialState,
      selection: { kind: "today" as const },
      todos: [
        todo("today", { dueAt: "2026-06-26T15:00:00", sortIndex: 0 }),
        todo("later", { dueAt: "2026-07-01T15:00:00", sortIndex: 1 }),
        todo("nodate", { sortIndex: 2 }),
      ],
    };
    const { open } = visibleTodos(state, now);
    expect(open.map((t) => t.id)).toEqual(["today"]);
  });
});

describe("subtaskCountsFor", () => {
  it("rolls up done/total per parent", () => {
    const todos = [
      todo("p"),
      todo("c1", { parentId: "p", status: "done" }),
      todo("c2", { parentId: "p" }),
      todo("c3", { parentId: "p", status: "done" }),
    ];
    expect(subtaskCountsFor(todos)["p"]).toEqual({ done: 2, total: 3 });
  });
});

describe("childrenByParentFrom", () => {
  it("groups children by parentId, sorted by sortIndex", () => {
    const map = childrenByParentFrom([
      todo("p"),
      todo("c2", { parentId: "p", sortIndex: 2 }),
      todo("c1", { parentId: "p", sortIndex: 1 }),
    ]);
    expect(map["p"].map((t) => t.id)).toEqual(["c1", "c2"]);
  });
});

describe("createViewFromSelection", () => {
  it("captures a label selection's criteria so it round-trips through applyFilter", () => {
    const state = {
      ...initialState,
      selection: { kind: "label" as const, id: "l-work" },
    };
    const view = createViewFromSelection("My work", state, "v-new", 5);
    expect(view).toMatchObject({
      id: "v-new",
      name: "My work",
      sortIndex: 5,
      criteria: { labelIds: ["l-work"], dateWindow: "any" },
    });

    // round-trip: selecting the new view filters to the same todos
    const next = {
      ...state,
      views: [view],
      selection: { kind: "project" as const, id: "v-new" },
      todos: [
        todo("hit", { labelIds: ["l-work"] }),
        todo("miss", { labelIds: ["l-other"] }),
      ],
    };
    expect(visibleTodos(next, now).open.map((t) => t.id)).toEqual(["hit"]);
  });

  it("captures the Today window", () => {
    const state = { ...initialState, selection: { kind: "today" as const } };
    const view = createViewFromSelection("Daily", state, "v-day", 0);
    expect(view.criteria.dateWindow).toBe("today");
  });
});

describe("labelsByIdFrom", () => {
  it("indexes labels by id", () => {
    const map = labelsByIdFrom([
      { id: "l1", name: "work", colorHex: "#c8632e" },
    ]);
    expect(map["l1"].name).toBe("work");
  });
});
