import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Todo } from "@/lib/contracts";
import { TodoList } from "../TodoList";

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

function listProps(over = {}) {
  return {
    open: [todo("a"), todo("b"), todo("c")],
    done: [todo("z", { status: "done" as const, title: "Old done" })],
    now,
    labelsById: {},
    subtaskCounts: {},
    selectedId: null as string | null,
    onSelect: vi.fn(),
    onToggleComplete: vi.fn(),
    onReorder: vi.fn(),
    ...over,
  };
}

describe("TodoList", () => {
  it("renders the open todos", () => {
    render(<TodoList {...listProps()} />);
    expect(screen.getByText("Todo a")).toBeInTheDocument();
    expect(screen.getByText("Todo c")).toBeInTheDocument();
  });

  it("scopes Done behind a collapsed toggle, expandable on click", () => {
    render(<TodoList {...listProps()} />);
    expect(screen.queryByText("Old done")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /done/i }));
    expect(screen.getByText("Old done")).toBeInTheDocument();
  });

  it("routes select and complete from a row", () => {
    const onSelect = vi.fn();
    const onToggleComplete = vi.fn();
    render(<TodoList {...listProps({ onSelect, onToggleComplete })} />);
    fireEvent.click(screen.getByText("Todo b"));
    expect(onSelect).toHaveBeenCalledWith("b");
    fireEvent.click(
      screen.getByRole("checkbox", { name: /complete todo b/i }),
    );
    expect(onToggleComplete).toHaveBeenCalledWith("b");
  });

  it("shows a caret on parents with subtasks and expands to indented children", () => {
    const props = listProps({
      childrenByParent: {
        a: [todo("a1", { parentId: "a", title: "Sub of a" })],
      },
    });
    render(<TodoList {...props} />);
    // child hidden until expanded
    expect(screen.queryByText("Sub of a")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /expand subtasks of todo a/i }),
    );
    expect(screen.getByText("Sub of a")).toBeInTheDocument();
  });

  it("computes drop neighbors on drag-and-drop (fractional reorder)", () => {
    const onReorder = vi.fn();
    render(<TodoList {...listProps({ onReorder })} />);
    const rows = screen.getAllByRole("listitem");
    // drag first open row (a) onto the third (c)
    fireEvent.dragStart(rows[0]);
    fireEvent.drop(rows[2]);
    expect(onReorder).toHaveBeenCalledWith("a", "c", null);
  });
});
