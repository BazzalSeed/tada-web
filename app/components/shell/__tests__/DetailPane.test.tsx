import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Todo, TodoLabel } from "@/lib/contracts";
import { DetailPane } from "../DetailPane";

const todo: Todo = {
  id: "t1",
  createdAt: "2026-06-26T09:00:00",
  sourceCaptureId: "c1",
  title: "Email Dakota",
  detail: "Send the **Q3** deck",
  status: "open",
  actionType: "none",
  actionState: "none",
  sortIndex: 0,
  priority: "p2",
  labelIds: ["l1"],
  dueAt: "2026-06-30T00:00:00",
};

const allLabels: TodoLabel[] = [
  { id: "l1", name: "work", colorHex: "#c8632e" },
  { id: "l2", name: "errand", colorHex: "#5d574d" },
];

function paneProps(over = {}) {
  return {
    todo,
    allLabels,
    onClose: vi.fn(),
    onPatch: vi.fn(),
    onCreateLabel: vi.fn(() => ({ id: "lnew", name: "new", colorHex: "#c8632e" })),
    ...over,
  };
}

describe("DetailPane (editable)", () => {
  it("renders nothing when no todo is selected", () => {
    const { container } = render(
      <DetailPane {...paneProps({ todo: null })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("persists a title edit on blur", () => {
    const onPatch = vi.fn();
    render(<DetailPane {...paneProps({ onPatch })} />);
    const title = screen.getByDisplayValue("Email Dakota");
    fireEvent.change(title, { target: { value: "Email Dakota now" } });
    fireEvent.blur(title);
    expect(onPatch).toHaveBeenCalledWith({ title: "Email Dakota now" });
  });

  it("edits notes and persists on blur", () => {
    const onPatch = vi.fn();
    render(<DetailPane {...paneProps({ onPatch })} />);
    fireEvent.click(screen.getByRole("button", { name: /write/i }));
    const notes = screen.getByLabelText(/notes/i);
    fireEvent.change(notes, { target: { value: "New note" } });
    fireEvent.blur(notes);
    expect(onPatch).toHaveBeenCalledWith({ detail: "New note" });
  });

  it("changes priority", () => {
    const onPatch = vi.fn();
    render(<DetailPane {...paneProps({ onPatch })} />);
    fireEvent.click(screen.getByRole("button", { name: /set priority p1/i }));
    expect(onPatch).toHaveBeenCalledWith({ priority: "p1" });
  });

  it("sets a due date as an offset-less local ISO", () => {
    const onPatch = vi.fn();
    render(<DetailPane {...paneProps({ onPatch })} />);
    fireEvent.change(screen.getByLabelText(/due date/i), {
      target: { value: "2026-07-04" },
    });
    expect(onPatch).toHaveBeenCalledWith({ dueAt: "2026-07-04T00:00:00" });
  });

  it("toggles an existing label off", () => {
    const onPatch = vi.fn();
    render(<DetailPane {...paneProps({ onPatch })} />);
    // 'work' (l1) is currently on → toggling removes it
    fireEvent.click(screen.getByRole("button", { name: /toggle label work/i }));
    expect(onPatch).toHaveBeenCalledWith({ labelIds: [] });
  });

  it("creates a new label and applies it", () => {
    const onPatch = vi.fn();
    const onCreateLabel = vi.fn(() => ({ id: "lnew", name: "urgent", colorHex: "#c8632e" }));
    render(<DetailPane {...paneProps({ onPatch, onCreateLabel })} />);
    const input = screen.getByPlaceholderText(/new label/i);
    fireEvent.change(input, { target: { value: "urgent" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCreateLabel).toHaveBeenCalledWith("urgent");
    expect(onPatch).toHaveBeenCalledWith({ labelIds: ["l1", "lnew"] });
  });

  it("sets recurrence", () => {
    const onPatch = vi.fn();
    render(<DetailPane {...paneProps({ onPatch })} />);
    fireEvent.change(screen.getByLabelText(/repeat/i), {
      target: { value: "weekly" },
    });
    expect(onPatch).toHaveBeenCalledWith({
      recurrence: { frequency: "weekly" },
    });
  });

  it("renders markdown bold in the notes preview", () => {
    render(<DetailPane {...paneProps()} />);
    // default mode is preview; **Q3** → <strong>Q3</strong>
    const strong = screen.getByText("Q3");
    expect(strong.tagName).toBe("STRONG");
  });

  it("closes via the close control", () => {
    const onClose = vi.fn();
    render(<DetailPane {...paneProps({ onClose })} />);
    fireEvent.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── parentCrumb (B) ───────────────────────────────────────────────────────
  it("renders the parent breadcrumb when parentCrumb is passed", () => {
    const onClick = vi.fn();
    render(
      <DetailPane
        {...paneProps({
          parentCrumb: { title: "Big Project", onClick },
        })}
      />,
    );
    const crumb = screen.getByRole("button", { name: /← big project/i });
    expect(crumb).toBeInTheDocument();
    fireEvent.click(crumb);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does NOT render a parent breadcrumb when parentCrumb is absent", () => {
    render(<DetailPane {...paneProps()} />);
    expect(screen.queryByRole("button", { name: /←/i })).toBeNull();
  });

  // ── inlineReport (A) ──────────────────────────────────────────────────────
  it("renders the inline report panel with child title and markdown when inlineReport is passed", () => {
    const onClose = vi.fn();
    const childTodo: Todo = {
      id: "c1",
      createdAt: "2026-06-26T09:00:00",
      sourceCaptureId: "",
      title: "Research subtask",
      detail: "**Finding:** Rome was not built in a day",
      status: "open",
      actionType: "none",
      actionState: "none",
      sortIndex: 1,
      priority: "none",
      labelIds: [],
      parentId: "t1",
    };
    render(
      <DetailPane
        {...paneProps({
          inlineReport: { todo: childTodo, onClose },
        })}
      />,
    );
    // child title appears in the inline report header
    expect(screen.getByText("Research subtask")).toBeInTheDocument();
    // markdown is rendered (bold)
    expect(screen.getByText("Finding:")).toBeInTheDocument();
  });

  it("calls inlineReport.onClose when the collapse control is clicked", () => {
    const onClose = vi.fn();
    const childTodo: Todo = {
      id: "c1",
      createdAt: "2026-06-26T09:00:00",
      sourceCaptureId: "",
      title: "Research subtask",
      detail: "Some report content",
      status: "open",
      actionType: "none",
      actionState: "none",
      sortIndex: 1,
      priority: "none",
      labelIds: [],
      parentId: "t1",
    };
    render(
      <DetailPane
        {...paneProps({
          inlineReport: { todo: childTodo, onClose },
        })}
      />,
    );
    const collapse = screen.getByRole("button", { name: /collapse/i });
    fireEvent.click(collapse);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // ── FIX1: notes preview reads live todo.detail prop ──────────────────────
  it("notes preview reflects an updated todo.detail prop without a remount", () => {
    const { rerender } = render(
      <DetailPane {...paneProps({ todo: { ...todo, detail: "old notes" } })} />,
    );
    // Default mode is preview; initial notes are visible.
    expect(screen.getByText("old notes")).toBeInTheDocument();

    // Simulate external update (e.g. research append, poll) — same key, new prop.
    rerender(
      <DetailPane
        {...paneProps({ todo: { ...todo, detail: "new report appended" } })}
      />,
    );
    expect(screen.getByText("new report appended")).toBeInTheDocument();
  });

  it("renders 'No report yet.' when inlineReport.todo.detail is empty", () => {
    const childTodo: Todo = {
      id: "c1",
      createdAt: "2026-06-26T09:00:00",
      sourceCaptureId: "",
      title: "Empty report",
      detail: "",
      status: "open",
      actionType: "none",
      actionState: "none",
      sortIndex: 1,
      priority: "none",
      labelIds: [],
      parentId: "t1",
    };
    render(
      <DetailPane
        {...paneProps({
          inlineReport: { todo: childTodo, onClose: vi.fn() },
        })}
      />,
    );
    expect(screen.getByText(/no report yet/i)).toBeInTheDocument();
  });
});
