import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Todo, TodoLabel } from "@/lib/contracts";
import { TodoRow } from "../TodoRow";

const now = new Date(2026, 5, 26, 9, 0, 0);
const base: Todo = {
  id: "t1",
  createdAt: "2026-06-26T09:00:00",
  sourceCaptureId: "c1",
  title: "Email Dakota",
  status: "open",
  actionType: "none",
  actionState: "none",
  sortIndex: 0,
  priority: "p1",
  labelIds: ["l1"],
  dueAt: "2026-06-30T14:00:00",
};
const labels: TodoLabel[] = [{ id: "l1", name: "work", colorHex: "#c8632e" }];

function rowProps(overrides = {}) {
  return {
    todo: base,
    now,
    labels,
    subtaskDone: 0,
    subtaskTotal: 0,
    selected: false,
    onSelect: vi.fn(),
    onToggleComplete: vi.fn(),
    ...overrides,
  };
}

describe("TodoRow", () => {
  it("renders the title, priority circle, and a due chip", () => {
    render(<TodoRow {...rowProps()} />);
    expect(screen.getByText("Email Dakota")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toHaveAttribute("data-priority", "p1");
    expect(screen.getByText("Jun 30")).toBeInTheDocument();
  });

  it("selects the todo when the row body is clicked", () => {
    const onSelect = vi.fn();
    render(<TodoRow {...rowProps({ onSelect })} />);
    fireEvent.click(screen.getByText("Email Dakota"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("toggles completion from the circle without selecting the row", () => {
    const onSelect = vi.fn();
    const onToggleComplete = vi.fn();
    render(<TodoRow {...rowProps({ onSelect, onToggleComplete })} />);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggleComplete).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("marks the selected row (soft raised, not a black fill)", () => {
    render(<TodoRow {...rowProps({ selected: true })} />);
    expect(screen.getByRole("listitem")).toHaveAttribute("data-selected", "true");
  });

  it("renders a done todo with done styling", () => {
    render(
      <TodoRow {...rowProps({ todo: { ...base, status: "done" } })} />,
    );
    expect(screen.getByRole("listitem")).toHaveAttribute("data-done", "true");
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });
});
