import { describe, expect, it } from "vitest";
import { reducer, initialState, type TadaState } from "../store";
import type { Todo, TodoLabel } from "@/lib/contracts";

// Minimal stubs — only the fields the reducer touches.
const makeLabel = (overrides: Partial<TodoLabel> = {}): TodoLabel => ({
  id: "l1",
  name: "errand",
  colorHex: "#c8632e",
  ...overrides,
});

const makeTodo = (overrides: Partial<Todo> = {}): Todo => ({
  id: "t1",
  createdAt: "2026-01-01T00:00:00.000Z",
  sourceCaptureId: "cap1",
  title: "buy milk",
  status: "open",
  actionType: "none",
  actionState: "none",
  sortIndex: 0,
  priority: "none",
  labelIds: [],
  ...overrides,
});

// Build a state with a label and two todos — one tagged, one not.
function stateWithLabel(): TadaState {
  const label = makeLabel({ id: "l1", name: "errand" });
  const tagged = makeTodo({ id: "t1", labelIds: ["l1"] });
  const untagged = makeTodo({ id: "t2", labelIds: [] });
  return {
    ...initialState,
    labels: [label],
    todos: [tagged, untagged],
  };
}

describe("DELETE_LABEL", () => {
  it("removes the label from state.labels", () => {
    const state = stateWithLabel();
    const next = reducer(state, { type: "DELETE_LABEL", id: "l1" });
    expect(next.labels).toHaveLength(0);
  });

  it("strips the deleted id from every todo's labelIds", () => {
    const state = stateWithLabel();
    const next = reducer(state, { type: "DELETE_LABEL", id: "l1" });
    const tagged = next.todos.find((t) => t.id === "t1")!;
    expect(tagged.labelIds).toEqual([]);
  });

  it("leaves todos that don't have the label unchanged", () => {
    const state = stateWithLabel();
    const next = reducer(state, { type: "DELETE_LABEL", id: "l1" });
    const untagged = next.todos.find((t) => t.id === "t2")!;
    expect(untagged.labelIds).toEqual([]);
    // The object reference is unchanged since it didn't have the label.
    expect(untagged).toBe(state.todos.find((t) => t.id === "t2"));
  });

  it("resets selection to {kind:'all'} when the deleted label is selected", () => {
    const state: TadaState = {
      ...stateWithLabel(),
      selection: { kind: "label", id: "l1" },
    };
    const next = reducer(state, { type: "DELETE_LABEL", id: "l1" });
    expect(next.selection).toEqual({ kind: "all" });
  });

  it("preserves selection when a different label is selected", () => {
    const state: TadaState = {
      ...stateWithLabel(),
      labels: [makeLabel({ id: "l1" }), makeLabel({ id: "l2", name: "work" })],
      selection: { kind: "label", id: "l2" },
    };
    const next = reducer(state, { type: "DELETE_LABEL", id: "l1" });
    expect(next.selection).toEqual({ kind: "label", id: "l2" });
  });
});
