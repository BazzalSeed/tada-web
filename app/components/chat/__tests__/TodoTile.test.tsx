import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Todo, TodoLabel } from "@/lib/contracts";
import { TodoTile } from "../tiles/TodoTile";

const NOW = new Date(2026, 5, 26); // 2026-06-26

function todo(over: Partial<Todo> = {}): Todo {
  return {
    id: "t1",
    createdAt: "2026-06-26T09:00:00",
    sourceCaptureId: "",
    title: "Send Dakota the brief",
    status: "open",
    actionType: "none",
    actionState: "none",
    sortIndex: 0,
    priority: "none",
    labelIds: [],
    ...over,
  };
}

const labels: TodoLabel[] = [{ id: "l-work", name: "work", colorHex: "#c8632e" }];

describe("TodoTile", () => {
  it("renders the todo title", () => {
    render(<TodoTile todo={todo()} labels={[]} now={NOW} />);
    expect(screen.getByText("Send Dakota the brief")).toBeInTheDocument();
  });

  it("shows a friendly due chip when due", () => {
    render(<TodoTile todo={todo({ dueAt: "2026-06-27T00:00:00" })} labels={[]} now={NOW} />);
    expect(screen.getByText("Tomorrow")).toBeInTheDocument();
  });

  it("shows priority when set", () => {
    render(<TodoTile todo={todo({ priority: "p1" })} labels={[]} now={NOW} />);
    expect(screen.getByText("P1")).toBeInTheDocument();
  });

  it("resolves label ids to names", () => {
    render(<TodoTile todo={todo({ labelIds: ["l-work"] })} labels={labels} now={NOW} />);
    expect(screen.getByText(/work/)).toBeInTheDocument();
  });

  it("omits priority chip for a 'none' priority", () => {
    render(<TodoTile todo={todo({ priority: "none" })} labels={[]} now={NOW} />);
    expect(screen.queryByText(/^P[123]$/)).toBeNull();
  });
});
