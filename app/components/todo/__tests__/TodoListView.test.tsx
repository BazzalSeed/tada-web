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

  it("optimistically reorders on drop — the row moves before the server replies (FIX6)", async () => {
    const a: Todo = { ...open, id: "a", title: "Aaa", sortIndex: 0 };
    const b: Todo = { ...open, id: "b", title: "Bbb", sortIndex: 1 };
    const c: Todo = { ...open, id: "c", title: "Ccc", sortIndex: 2 };
    // server stalls — the optimistic move must happen without waiting on it
    globalThis.fetch = vi.fn(() => new Promise(() => {})) as never;
    render(
      <TadaProvider preload={{ todos: [a, b, c] }}>
        <TodoListView />
      </TadaProvider>,
    );
    let rows = screen.getAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Aaa"),
      expect.stringContaining("Bbb"),
      expect.stringContaining("Ccc"),
    ]);
    // drag Aaa (index 0) down onto Ccc (index 2)
    fireEvent.dragStart(rows[0]);
    fireEvent.drop(rows[2]);
    // Aaa lands after Ccc immediately (sortIndex between c=2 and none → 3)
    await waitFor(() => {
      rows = screen.getAllByRole("listitem");
      expect(rows[rows.length - 1].textContent).toContain("Aaa");
    });
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
