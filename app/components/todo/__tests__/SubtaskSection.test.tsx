import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Todo } from "@/lib/contracts";
import { TadaProvider, useTada } from "@/app/lib/store";
import { SubtaskSection } from "../SubtaskSection";

function todo(id: string, over: Partial<Todo> = {}): Todo {
  return {
    id,
    createdAt: "2026-06-26T09:00:00",
    sourceCaptureId: "c1",
    title: `Todo ${id}`,
    status: "open",
    actionType: "none",
    actionState: "none",
    sortIndex: 0,
    priority: "none",
    labelIds: [],
    ...over,
  };
}

// Probe to observe the parent's status from the store during the test.
function ParentStatus() {
  const { state } = useTada();
  const parent = state.todos.find((t) => t.id === "p");
  return <span data-testid="parent-status">{parent?.status}</span>;
}

afterEach(() => vi.restoreAllMocks());

function renderSection(todos: Todo[]) {
  return render(
    <TadaProvider preload={{ todos }}>
      <ParentStatus />
      <SubtaskSection parentId="p" />
    </TadaProvider>,
  );
}

describe("SubtaskSection (store-wired)", () => {
  it("renders only the children of the parent", () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    renderSection([
      todo("p"),
      todo("c1", { parentId: "p", title: "Child one" }),
      todo("other"),
    ]);
    expect(screen.getByText("Child one")).toBeInTheDocument();
    expect(screen.queryByText("Todo other")).not.toBeInTheDocument();
  });

  it("optimistically adds a subtask", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ todo: todo("saved", { parentId: "p", title: "New sub" }) }),
    })) as never;
    renderSection([todo("p")]);
    const input = screen.getByPlaceholderText(/add subtask/i);
    fireEvent.change(input, { target: { value: "New sub" } });
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.getByText("New sub")).toBeInTheDocument());
  });

  it("completing every child never auto-completes the parent", async () => {
    globalThis.fetch = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => ({ todo: todo(String(url).split("/").pop()!, { parentId: "p", status: "done" }) }),
    })) as never;
    renderSection([todo("p"), todo("c1", { parentId: "p" })]);
    fireEvent.click(screen.getByRole("checkbox", { name: /complete todo c1/i }));
    await waitFor(() =>
      expect(screen.getByRole("checkbox", { name: /complete todo c1/i })).toHaveAttribute(
        "aria-checked",
        "true",
      ),
    );
    // parent stays open — no auto-complete
    expect(screen.getByTestId("parent-status")).toHaveTextContent("open");
  });
});
