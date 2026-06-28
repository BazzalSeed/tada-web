import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Todo } from "@/lib/contracts";
import { TadaProvider, useTada } from "@/app/lib/store";
import type { EnrichmentChip } from "@/app/lib/enrich";
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

// Probe reads store state for chip-acceptance assertions.
function StoreProbe() {
  const { state } = useTada();
  return (
    <div>
      <span data-testid="prios">{state.todos.map((t) => t.priority).join("|")}</span>
      <span data-testid="selected-id">{state.selectedTodoId ?? ""}</span>
      <span data-testid="enrichment-chip-count">
        {state.enrichment?.chips.length ?? 0}
      </span>
      <span data-testid="action-type">{state.todos.map((t) => t.actionType).join("|")}</span>
    </div>
  );
}

const todoForChips: Todo = {
  id: "chip-todo",
  createdAt: "2026-06-27T09:00:00",
  sourceCaptureId: "",
  title: "Plan Tokyo offsite",
  status: "open",
  actionType: "none",
  actionState: "none",
  sortIndex: 0,
  priority: "none",
  labelIds: [],
};

const priorityChip: EnrichmentChip = {
  key: "priority:p1",
  kind: "priority",
  label: "P1",
  priority: "p1",
};

const actionChip: EnrichmentChip = {
  key: "action:meeting",
  kind: "action",
  label: "Meeting",
  actionType: "meeting",
  actionPayload: null,
};

describe("TodoListView — enrichment chip acceptance on the row", () => {
  it("accepting a priority chip patches the todo and clears the enrichment offer", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    render(
      <TadaProvider
        preload={{
          todos: [todoForChips],
          enrichment: { todoId: "chip-todo", chips: [priorityChip] },
        }}
      >
        <StoreProbe />
        <TodoListView />
      </TadaProvider>,
    );
    // chip should be visible on the row
    const chip = screen.getByRole("button", { name: /add p1/i });
    expect(screen.getByTestId("prios")).toHaveTextContent("none");
    fireEvent.click(chip);
    // priority applied optimistically
    await waitFor(() => expect(screen.getByTestId("prios")).toHaveTextContent("p1"));
    // chip consumed — no more enrichment
    expect(screen.getByTestId("enrichment-chip-count")).toHaveTextContent("0");
    expect(screen.queryByRole("button", { name: /add p1/i })).toBeNull();
  });

  it("accepting an action chip patches the todo AND selects it (opens review card)", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    render(
      <TadaProvider
        preload={{
          todos: [todoForChips],
          enrichment: { todoId: "chip-todo", chips: [actionChip] },
        }}
      >
        <StoreProbe />
        <TodoListView />
      </TadaProvider>,
    );
    const chip = screen.getByRole("button", { name: /add meeting/i });
    fireEvent.click(chip);
    await waitFor(() => expect(screen.getByTestId("action-type")).toHaveTextContent("meeting"));
    // SELECT_TODO fired — todo is now selected (opens detail pane)
    expect(screen.getByTestId("selected-id")).toHaveTextContent("chip-todo");
  });

  it("dismissing chips clears the enrichment offer without patching the todo", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    render(
      <TadaProvider
        preload={{
          todos: [todoForChips],
          enrichment: { todoId: "chip-todo", chips: [priorityChip] },
        }}
      >
        <StoreProbe />
        <TodoListView />
      </TadaProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /dismiss suggestions/i }));
    await waitFor(() =>
      expect(screen.getByTestId("enrichment-chip-count")).toHaveTextContent("0"),
    );
    // priority unchanged — dismiss is non-destructive
    expect(screen.getByTestId("prios")).toHaveTextContent("none");
  });
});
