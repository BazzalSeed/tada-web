import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { FilterCriteria, TodoLabel } from "@/lib/contracts";
import { FilterBuilder } from "../FilterBuilder";

const labels: TodoLabel[] = [
  { id: "l-work", name: "work", colorHex: "#c8632e" },
  { id: "l-urgent", name: "urgent", colorHex: "#c8632e" },
];

const empty: FilterCriteria = {
  labelIds: [],
  minPriority: null,
  dateWindow: "any",
  includeCompleted: false,
};

function setup(value: Partial<FilterCriteria> = {}) {
  const onChange = vi.fn();
  render(
    <FilterBuilder
      value={{ ...empty, ...value }}
      labels={labels}
      onChange={onChange}
    />,
  );
  return onChange;
}

describe("FilterBuilder", () => {
  it("renders a toggle chip per label and adds one to labelIds (ANY-of)", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: /#work/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ labelIds: ["l-work"] }),
    );
  });

  it("removes an already-selected label chip", () => {
    const onChange = setup({ labelIds: ["l-work"] });
    fireEvent.click(screen.getByRole("button", { name: /#work/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ labelIds: [] }),
    );
  });

  it("reflects the selected label as pressed (accent, not a fill prop)", () => {
    setup({ labelIds: ["l-urgent"] });
    expect(screen.getByRole("button", { name: /#urgent/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /#work/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("sets the minPriority threshold from the segmented control", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: "P1+" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ minPriority: "p1" }),
    );
  });

  it("maps the P0 segment to a p0 threshold and Any back to null", () => {
    const onChange = setup({ minPriority: "p0" });
    // current selection reflected
    expect(screen.getByRole("button", { name: "P0" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Any priority" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ minPriority: null }),
    );
  });

  it("sets the date window", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("button", { name: "Next 7" }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ dateWindow: "next7" }),
    );
  });

  it("toggles includeCompleted", () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole("checkbox", { name: /completed/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ includeCompleted: true }),
    );
  });
});
