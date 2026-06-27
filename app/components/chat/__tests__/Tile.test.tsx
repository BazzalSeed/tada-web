import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Todo } from "@/lib/contracts";
import { Tile } from "../tiles/Tile";

const NOW = new Date(2026, 5, 26);

function todo(over: Partial<Todo> = {}): Todo {
  return {
    id: "t1",
    createdAt: "x",
    sourceCaptureId: "",
    title: "A todo",
    status: "open",
    actionType: "none",
    actionState: "none",
    sortIndex: 0,
    priority: "none",
    labelIds: [],
    ...over,
  };
}

describe("Tile dispatcher", () => {
  it("renders a single todo card", () => {
    render(<Tile card={{ type: "todo", todo: todo({ title: "Buy milk" }) }} labels={[]} now={NOW} />);
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
  });

  it("renders a list of todos", () => {
    render(
      <Tile
        card={{ type: "todos", todos: [todo({ id: "a", title: "One" }), todo({ id: "b", title: "Two" })] }}
        labels={[]}
        now={NOW}
      />,
    );
    expect(screen.getByText("One")).toBeInTheDocument();
    expect(screen.getByText("Two")).toBeInTheDocument();
  });

  it("renders a running research tile", () => {
    render(<Tile card={{ type: "research", status: "running" }} labels={[]} now={NOW} />);
    expect(screen.getByText(/researching/i)).toBeInTheDocument();
  });

  it("renders finished research markdown", () => {
    render(
      <Tile
        card={{ type: "research", status: "done", markdown: "## Findings\nWe compared **three** CRMs." }}
        labels={[]}
        now={NOW}
      />,
    );
    expect(screen.getByRole("heading", { name: /findings/i })).toBeInTheDocument();
    expect(screen.getByText("three")).toBeInTheDocument();
  });

  it("renders a pending offer card with Approve/Deny", () => {
    render(
      <Tile
        card={{ type: "pending", toolName: "set_reminder", action: { kind: "reminder", text: "Stretch" } }}
        labels={[]}
        now={NOW}
        onApprove={() => {}}
        onDeny={() => {}}
      />,
    );
    expect(screen.getByText("Stretch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve/i })).toBeInTheDocument();
  });

  it("renders an executed meeting result (booked)", () => {
    render(
      <Tile
        card={{ type: "offer", kind: "meeting", result: { ok: true, actionExternalId: "evt_1" } }}
        labels={[]}
        now={NOW}
      />,
    );
    expect(screen.getByText(/meeting booked/i)).toBeInTheDocument();
  });

  it("renders a meeting result that still needs an attendee email", () => {
    render(
      <Tile
        card={{
          type: "offer",
          kind: "meeting",
          result: { ok: false, needsDisambiguation: [{ name: "Sam", status: "unresolved" }] },
        }}
        labels={[]}
        now={NOW}
      />,
    );
    expect(screen.getByText(/couldn't confirm who: sam/i)).toBeInTheDocument();
  });

  it("renders search_contacts candidates", () => {
    render(
      <Tile
        card={{ type: "contacts", query: "sam", candidates: [{ name: "Sam Lee", email: "sam@acme.com", org: "Acme" }] }}
        labels={[]}
        now={NOW}
      />,
    );
    expect(screen.getByText("sam@acme.com")).toBeInTheDocument();
  });

  it("renders a denied note", () => {
    render(<Tile card={{ type: "denied", toolName: "set_reminder" }} labels={[]} now={NOW} />);
    expect(screen.getByText(/dismissed/i)).toBeInTheDocument();
  });
});
