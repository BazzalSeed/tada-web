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
    expect(screen.getByText("work")).toBeInTheDocument();
    expect(screen.getByText("urgent")).toBeInTheDocument();
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
});
