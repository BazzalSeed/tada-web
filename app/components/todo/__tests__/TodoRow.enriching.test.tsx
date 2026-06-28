import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Todo } from "@/lib/contracts";
import { TodoRow } from "../TodoRow";

const now = new Date(2026, 5, 27, 9, 0, 0);
const base: Todo = {
  id: "t-enrich",
  createdAt: "2026-06-27T09:00:00",
  sourceCaptureId: "",
  title: "Book flight to Tokyo",
  status: "open",
  actionType: "none",
  actionState: "none",
  sortIndex: 0,
  priority: "none",
  labelIds: [],
};

function rowProps(overrides = {}) {
  return {
    todo: base,
    now,
    labels: [],
    subtaskDone: 0,
    subtaskTotal: 0,
    selected: false,
    onSelect: vi.fn(),
    onToggleComplete: vi.fn(),
    ...overrides,
  };
}

describe("TodoRow enriching indicator", () => {
  it("shows a role=status Enhancing… element when enriching=true", () => {
    render(<TodoRow {...rowProps({ enriching: true })} />);
    const indicator = screen.getByRole("status");
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveTextContent("Enhancing…");
  });

  it("does not render an enriching indicator when enriching=false", () => {
    render(<TodoRow {...rowProps({ enriching: false })} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not render an enriching indicator when enriching is omitted", () => {
    render(<TodoRow {...rowProps()} />);
    expect(screen.queryByRole("status")).toBeNull();
  });
});
