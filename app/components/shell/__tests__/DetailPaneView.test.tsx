import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Todo } from "@/lib/contracts";
import { TadaProvider, useTada } from "@/app/lib/store";
import { DetailPaneView } from "../DetailPaneView";

const todo: Todo = {
  id: "t1",
  createdAt: "2026-06-26T09:00:00",
  sourceCaptureId: "c1",
  title: "Email Dakota",
  detail: "",
  status: "open",
  actionType: "none",
  actionState: "none",
  sortIndex: 0,
  priority: "none",
  labelIds: [],
};

const childTodo: Todo = {
  id: "c1",
  createdAt: "2026-06-26T10:00:00",
  sourceCaptureId: "",
  title: "Research report",
  detail: "## Findings\nSome content here",
  status: "open",
  actionType: "none",
  actionState: "none",
  sortIndex: 1,
  priority: "none",
  labelIds: [],
  parentId: "t1",
};

function Probe() {
  const { state } = useTada();
  const t = state.todos.find((x) => x.id === "t1");
  return (
    <div>
      <span data-testid="title">{t?.title}</span>
      <span data-testid="prio">{t?.priority}</span>
      <span data-testid="sel">{String(state.selectedTodoId)}</span>
    </div>
  );
}

afterEach(() => vi.restoreAllMocks());

function renderView(extraTodos: Todo[] = []) {
  return render(
    <TadaProvider preload={{ todos: [todo, ...extraTodos], selectedTodoId: "t1" }}>
      <Probe />
      <DetailPaneView todo={todo} />
    </TadaProvider>,
  );
}

describe("DetailPaneView (store-wired)", () => {
  it("optimistically persists a priority change", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ todo: { ...todo, priority: "p1" } }),
    })) as never;
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /set priority p1/i }));
    await waitFor(() => expect(screen.getByTestId("prio")).toHaveTextContent("p1"));
  });

  it("closing clears the selection", () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /close detail/i }));
    expect(screen.getByTestId("sel")).toHaveTextContent("null");
  });

  it("keeps the optimistic edit when persistence fails (pre-auth interim)", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("no user");
    }) as never;
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /set priority p2/i }));
    await waitFor(() => expect(screen.getByTestId("prio")).toHaveTextContent("p2"));
  });

  // ── inline report expansion (A) ───────────────────────────────────────────
  it("clicking a todo: link in notes expands the report inline (does NOT dispatch SELECT_TODO)", () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    // The parent todo has a note linking to the child via todo: protocol
    const parentWithLink: Todo = {
      ...todo,
      detail: "See [→ full report](todo:c1)",
    };
    render(
      <TadaProvider preload={{ todos: [parentWithLink, childTodo], selectedTodoId: "t1" }}>
        <Probe />
        <DetailPaneView todo={parentWithLink} />
      </TadaProvider>,
    );
    // The note link renders as a button (from markdown.tsx)
    const link = screen.getByRole("button", { name: /→ full report/i });
    fireEvent.click(link);

    // The inline report panel is open — the Collapse button appears
    expect(screen.getByRole("button", { name: /collapse/i })).toBeInTheDocument();
    // SELECT_TODO should NOT have changed the selected todo — still t1
    expect(screen.getByTestId("sel")).toHaveTextContent("t1");
  });

  it("clicking the todo: link again collapses the inline report", () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    const parentWithLink: Todo = {
      ...todo,
      detail: "See [→ full report](todo:c1)",
    };
    render(
      <TadaProvider preload={{ todos: [parentWithLink, childTodo], selectedTodoId: "t1" }}>
        <Probe />
        <DetailPaneView todo={parentWithLink} />
      </TadaProvider>,
    );
    // expand — Collapse control appears. Re-query the link before each click:
    // react-markdown re-creates the link's DOM node on re-render, so a captured
    // reference goes stale after the first click.
    fireEvent.click(screen.getByRole("button", { name: /→ full report/i }));
    expect(screen.getByRole("button", { name: /collapse/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /→ full report/i })); // collapse
    expect(screen.queryByRole("button", { name: /collapse/i })).toBeNull();
  });

  // ── back-to-parent breadcrumb (B) ─────────────────────────────────────────
  it("shows a parent breadcrumb when the viewed todo has a parentId in store", () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    const parent: Todo = {
      id: "p1",
      createdAt: "2026-06-26T08:00:00",
      sourceCaptureId: "",
      title: "Big Project",
      status: "open",
      actionType: "none",
      actionState: "none",
      sortIndex: 0,
      priority: "none",
      labelIds: [],
    };
    const child: Todo = {
      ...todo,
      id: "t1",
      parentId: "p1",
    };
    render(
      <TadaProvider preload={{ todos: [parent, child], selectedTodoId: "t1" }}>
        <Probe />
        <DetailPaneView todo={child} />
      </TadaProvider>,
    );
    expect(screen.getByRole("button", { name: /← big project/i })).toBeInTheDocument();
  });

  it("clicking the parent breadcrumb dispatches SELECT_TODO with the parent id", () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    const parent: Todo = {
      id: "p1",
      createdAt: "2026-06-26T08:00:00",
      sourceCaptureId: "",
      title: "Big Project",
      status: "open",
      actionType: "none",
      actionState: "none",
      sortIndex: 0,
      priority: "none",
      labelIds: [],
    };
    const child: Todo = { ...todo, id: "t1", parentId: "p1" };
    render(
      <TadaProvider preload={{ todos: [parent, child], selectedTodoId: "t1" }}>
        <Probe />
        <DetailPaneView todo={child} />
      </TadaProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /← big project/i }));
    expect(screen.getByTestId("sel")).toHaveTextContent("p1");
  });

  // ── FIX2: parent re-fetch after subtask finishOffer ───────────────────────
  it("upserts the parent into the store after a subtask finishOffer resolves", async () => {
    const parent: Todo = {
      id: "p1",
      createdAt: "2026-06-26T08:00:00",
      sourceCaptureId: "",
      title: "Parent Task",
      detail: "",
      status: "open",
      actionType: "none",
      actionState: "none",
      sortIndex: 0,
      priority: "none",
      labelIds: [],
    };
    const updatedParent: Todo = {
      ...parent,
      detail: "## Summary\nSubtask research done.",
    };
    const subtask: Todo = {
      id: "s1",
      createdAt: "2026-06-26T09:00:00",
      sourceCaptureId: "",
      title: "Market research",
      detail: "",
      status: "open",
      actionType: "research",
      actionState: "none",
      sortIndex: 1,
      priority: "none",
      labelIds: [],
      parentId: "p1",
    };

    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      const u = String(url);
      if (method === "POST" && u.includes("/finish")) {
        return { ok: true, json: async () => ({ ok: true, markdown: "Research done." }) };
      }
      // listTodos re-fetch — returns the updated parent
      if (method === "GET" && u.includes("/api/todos")) {
        return { ok: true, json: async () => ({ todos: [updatedParent, subtask] }) };
      }
      return { ok: true, json: async () => ({}) };
    }) as never;

    // Local probe to observe the parent's detail field
    function ParentProbe() {
      const { state } = useTada();
      const p = state.todos.find((x) => x.id === "p1");
      return <span data-testid="parent-detail">{p?.detail ?? ""}</span>;
    }

    render(
      <TadaProvider preload={{ todos: [parent, subtask], selectedTodoId: "s1" }}>
        <ParentProbe />
        <DetailPaneView todo={subtask} />
      </TadaProvider>,
    );

    // The OfferPanel renders a "Research" CTA for a research-type todo
    fireEvent.click(screen.getByRole("button", { name: /^research$/i }));

    // After finishOffer resolves, listTodos is called and the parent is upserted
    await waitFor(() => {
      expect(screen.getByTestId("parent-detail")).toHaveTextContent("## Summary");
    });
  });
});
