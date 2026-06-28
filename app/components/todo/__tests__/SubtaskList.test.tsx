import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Todo } from "@/lib/contracts";
import { SubtaskList } from "../SubtaskList";

function child(id: string, over: Partial<Todo> = {}): Todo {
  return {
    id,
    createdAt: "2026-06-26T09:00:00",
    sourceCaptureId: "c1",
    title: `Sub ${id}`,
    status: "open",
    actionType: "none",
    actionState: "none",
    sortIndex: 0,
    priority: "none",
    labelIds: [],
    parentId: "p",
    ...over,
  };
}

function props(over = {}) {
  return {
    subtasks: [child("a"), child("b", { status: "done" as const })],
    onAdd: vi.fn(),
    onToggle: vi.fn(),
    onReorder: vi.fn(),
    ...over,
  };
}

describe("SubtaskList", () => {
  it("renders each subtask with its completion state", () => {
    render(<SubtaskList {...props()} />);
    expect(screen.getByText("Sub a")).toBeInTheDocument();
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes[0]).toHaveAttribute("aria-checked", "false");
    expect(boxes[1]).toHaveAttribute("aria-checked", "true");
  });

  it("adds a subtask on Enter and clears the input", () => {
    const onAdd = vi.fn();
    render(<SubtaskList {...props({ onAdd })} />);
    const input = screen.getByPlaceholderText(/add subtask/i);
    fireEvent.change(input, { target: { value: "New sub" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).toHaveBeenCalledWith("New sub");
    expect((input as HTMLInputElement).value).toBe("");
  });

  it("does not add blank subtasks", () => {
    const onAdd = vi.fn();
    render(<SubtaskList {...props({ onAdd })} />);
    const input = screen.getByPlaceholderText(/add subtask/i);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("toggles a subtask's completion", () => {
    const onToggle = vi.fn();
    render(<SubtaskList {...props({ onToggle })} />);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(onToggle).toHaveBeenCalledWith("a");
  });

  it("shows the all-done cue when every subtask is complete", () => {
    const allDone = [
      child("a", { status: "done" as const }),
      child("b", { status: "done" as const }),
    ];
    render(<SubtaskList subtasks={allDone} onAdd={vi.fn()} onToggle={vi.fn()} onReorder={vi.fn()} />);
    expect(screen.getByTestId("subtasks-all-done")).toBeInTheDocument();
    expect(screen.getByTestId("subtasks-all-done").textContent).toMatch(/all steps done/i);
  });

  it("hides the all-done cue when some subtasks are still open", () => {
    render(<SubtaskList {...props()} />);
    expect(screen.queryByTestId("subtasks-all-done")).not.toBeInTheDocument();
  });

  it("hides the all-done cue when there are no subtasks", () => {
    render(<SubtaskList subtasks={[]} onAdd={vi.fn()} onToggle={vi.fn()} onReorder={vi.fn()} />);
    expect(screen.queryByTestId("subtasks-all-done")).not.toBeInTheDocument();
  });

  describe("Mark done nudge", () => {
    it("shows 'Mark done' for a subtask with actionState=done and status=open", () => {
      const subtask = child("x", { actionState: "done" as const, status: "open" as const });
      render(<SubtaskList subtasks={[subtask]} onAdd={vi.fn()} onToggle={vi.fn()} onReorder={vi.fn()} />);
      expect(screen.getByText("Mark done")).toBeInTheDocument();
    });

    it("clicking 'Mark done' calls onToggle with the subtask id and does not call onOpen", () => {
      const onToggle = vi.fn();
      const onOpen = vi.fn();
      const subtask = child("x", { actionState: "done" as const, status: "open" as const });
      render(
        <SubtaskList
          subtasks={[subtask]}
          onAdd={vi.fn()}
          onToggle={onToggle}
          onReorder={vi.fn()}
          onOpen={onOpen}
        />,
      );
      fireEvent.click(screen.getByText("Mark done"));
      expect(onToggle).toHaveBeenCalledWith("x");
      expect(onOpen).not.toHaveBeenCalled();
    });

    it("does not show 'Mark done' when status is already done", () => {
      const subtask = child("x", { actionState: "done" as const, status: "done" as const });
      render(<SubtaskList subtasks={[subtask]} onAdd={vi.fn()} onToggle={vi.fn()} onReorder={vi.fn()} />);
      expect(screen.queryByText(/mark done/i)).not.toBeInTheDocument();
    });

    it("does not show 'Mark done' when actionState is none", () => {
      const subtask = child("x", { actionState: "none" as const, status: "open" as const });
      render(<SubtaskList subtasks={[subtask]} onAdd={vi.fn()} onToggle={vi.fn()} onReorder={vi.fn()} />);
      expect(screen.queryByText(/mark done/i)).not.toBeInTheDocument();
    });
  });
});
