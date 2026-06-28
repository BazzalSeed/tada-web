import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TodoLabel } from "@/lib/contracts";
import { MetaChips } from "../MetaChips";

const now = new Date(2026, 5, 26, 9, 0, 0);
const labels: TodoLabel[] = [
  { id: "l1", name: "work", colorHex: "#c8632e" },
  { id: "l2", name: "urgent", colorHex: "#9b481e" },
];

describe("MetaChips", () => {
  it("renders a due chip with the formatted label", () => {
    render(
      <MetaChips dueAt="2026-06-30T14:00:00" now={now} labels={[]} subtaskDone={0} subtaskTotal={0} />,
    );
    expect(screen.getByText("Jun 30")).toBeInTheDocument();
  });

  it("flags an overdue due chip", () => {
    render(
      <MetaChips dueAt="2026-06-20T14:00:00" now={now} labels={[]} subtaskDone={0} subtaskTotal={0} />,
    );
    expect(screen.getByTestId("due-chip")).toHaveAttribute("data-overdue", "true");
  });

  it("renders label chips by name", () => {
    render(
      <MetaChips dueAt={null} now={now} labels={labels} subtaskDone={0} subtaskTotal={0} />,
    );
    expect(screen.getByText((_, el) => el?.textContent === "#work")).toBeInTheDocument();
    expect(screen.getByText((_, el) => el?.textContent === "#urgent")).toBeInTheDocument();
  });

  it("shows a subtask rollup chip when there are subtasks", () => {
    render(
      <MetaChips dueAt={null} now={now} labels={[]} subtaskDone={1} subtaskTotal={3} />,
    );
    expect(screen.getByText("1/3")).toBeInTheDocument();
  });

  it("hides the subtask chip when there are no subtasks", () => {
    render(
      <MetaChips dueAt={null} now={now} labels={[]} subtaskDone={0} subtaskTotal={0} />,
    );
    expect(screen.queryByTestId("subtask-chip")).not.toBeInTheDocument();
  });

  it("marks the subtask chip complete when all subtasks are done", () => {
    render(
      <MetaChips dueAt={null} now={now} labels={[]} subtaskDone={3} subtaskTotal={3} />,
    );
    const chip = screen.getByTestId("subtask-chip");
    expect(chip).toHaveAttribute("data-complete", "true");
    // ✓ prefix visible
    expect(chip.textContent).toMatch(/✓/);
  });

  it("does NOT mark the subtask chip complete when some subtasks are undone", () => {
    render(
      <MetaChips dueAt={null} now={now} labels={[]} subtaskDone={2} subtaskTotal={3} />,
    );
    const chip = screen.getByTestId("subtask-chip");
    expect(chip).not.toHaveAttribute("data-complete", "true");
    expect(chip.textContent).not.toMatch(/✓/);
  });

  it("does NOT mark the subtask chip complete when subtaskTotal is 0", () => {
    render(
      <MetaChips dueAt={null} now={now} labels={[]} subtaskDone={0} subtaskTotal={0} />,
    );
    expect(screen.queryByTestId("subtask-chip")).not.toBeInTheDocument();
  });
});
