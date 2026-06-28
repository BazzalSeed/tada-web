import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import type { FilterCriteria, Todo, TodoLabel } from "@/lib/contracts";
import { applyFilter } from "@/lib/core";
import { FilterBuilder } from "../FilterBuilder";

const labels: TodoLabel[] = [
  { id: "l-work", name: "work", colorHex: "#c8632e" },
  { id: "l-urgent", name: "urgent", colorHex: "#c8632e" },
  { id: "l-home", name: "home", colorHex: "#c8632e" },
];

const NOW = new Date(2026, 5, 26); // 2026-06-26

function todo(over: Partial<Todo>): Todo {
  return {
    id: "x",
    createdAt: "2026-06-20T09:00:00",
    sourceCaptureId: "",
    title: "t",
    status: "open",
    actionType: "none",
    actionState: "none",
    sortIndex: 0,
    priority: "none",
    labelIds: [],
    dateWindow: undefined,
    ...over,
  } as Todo;
}

// A todo due 3 days out (inside next7), p1, labelled #work → the target.
const match = todo({
  id: "match",
  priority: "p1",
  labelIds: ["l-work"],
  dueAt: "2026-06-29T00:00:00",
});
// Right labels but no due date → excluded by next7.
const noDate = todo({ id: "nodate", priority: "p1", labelIds: ["l-urgent"] });
// In-window + labelled but priority too low for P1+.
const lowPrio = todo({
  id: "lowprio",
  priority: "p2",
  labelIds: ["l-work"],
  dueAt: "2026-06-28T00:00:00",
});
// In-window, high priority, but wrong label.
const wrongLabel = todo({
  id: "wronglabel",
  priority: "p1",
  labelIds: ["l-home"],
  dueAt: "2026-06-28T00:00:00",
});

const pool = [match, noDate, lowPrio, wrongLabel];

function Harness() {
  const [criteria, setCriteria] = useState<FilterCriteria>({
    labelIds: [],
    minPriority: null,
    dateWindow: "any",
    includeCompleted: false,
  });
  const result = applyFilter(criteria, pool, NOW);
  return (
    <div>
      <FilterBuilder value={criteria} labels={labels} onChange={setCriteria} />
      <span data-testid="ids">{result.map((t) => t.id).join(",")}</span>
    </div>
  );
}

describe("FilterBuilder → applyFilter round-trip", () => {
  it("composes #work ANY #urgent + P1+ + next7 down to exactly the matching todo", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /#work/i }));
    fireEvent.click(screen.getByRole("button", { name: /#urgent/i }));
    fireEvent.click(screen.getByRole("button", { name: "P1+" }));
    fireEvent.click(screen.getByRole("button", { name: "Next 7" }));
    // Only `match` survives all four facets.
    expect(screen.getByTestId("ids")).toHaveTextContent("match");
    expect(screen.getByTestId("ids").textContent).toBe("match");
  });
});
