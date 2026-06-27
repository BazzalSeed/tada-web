import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Todo } from "@/lib/contracts";
import { TadaProvider } from "@/app/lib/store";
import { TodoListView } from "../TodoListView";

const open: Todo = {
  id: "t1",
  createdAt: "2026-06-26T09:00:00",
  sourceCaptureId: "c1",
  title: "Email Dakota",
  status: "open",
  actionType: "none",
  actionState: "none",
  sortIndex: 0,
  priority: "p1",
  labelIds: [],
};

afterEach(() => vi.restoreAllMocks());

function renderView() {
  return render(
    <TadaProvider preload={{ todos: [open] }}>
      <TodoListView />
    </TadaProvider>,
  );
}

describe("TodoListView (store-wired)", () => {
  it("renders the open todos from the store", () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    renderView();
    expect(screen.getByText("Email Dakota")).toBeInTheDocument();
  });

  it("optimistically completes a todo — it leaves the open list into scoped Done", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ todo: { ...open, status: "done" } }),
    })) as never;
    renderView();
    fireEvent.click(screen.getByRole("checkbox", { name: /complete email dakota/i }));
    // moves out of the open list into the (collapsed) Done section
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /done \(1\)/i })).toBeInTheDocument(),
    );
    // expanding Done shows it completed
    fireEvent.click(screen.getByRole("button", { name: /done \(1\)/i }));
    expect(screen.getByRole("checkbox", { name: /complete email dakota/i })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("keeps the optimistic state if persistence fails (pre-auth interim)", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("no user");
    }) as never;
    renderView();
    fireEvent.click(screen.getByRole("checkbox", { name: /complete email dakota/i }));
    // toggled locally despite the failed write → appears under Done
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /done \(1\)/i })).toBeInTheDocument(),
    );
  });
});
