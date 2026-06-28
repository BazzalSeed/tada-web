// @vitest-environment node
// T3.3 — AgentTool registry. Read tools auto-run, write tools are gated. Each
// run() drives the store/executors. store/executors/research mocked; unlimited
// user so any withQuota inside passes through.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", () => ({
  store: {
    listTodos: vi.fn(),
    createCapture: vi.fn(),
    createTodo: vi.fn(),
    updateTodo: vi.fn(),
    labels: vi.fn(async () => []),
    upsertLabelByName: vi.fn(),
  },
}));
vi.mock("@/lib/contacts", () => ({ contactResolverFor: vi.fn() }));

import { agentTools, toAiSdkTools } from "@/lib/agent-tools";
import { contactResolverFor } from "@/lib/contacts";
import { store } from "@/lib/store";
import type { UserCtx } from "@/lib/contracts";

const user: UserCtx = { userId: "u1", email: "u1@t.local", plan: "unlimited", googleRefreshToken: "r" };

beforeEach(() => vi.clearAllMocks());

describe("registry gating", () => {
  it("reads + create are auto (gated=false); mutates are gated (gated=true)", () => {
    expect(agentTools.list_todos.gated).toBe(false);
    expect(agentTools.query_todos.gated).toBe(false);
    expect(agentTools.search_contacts.gated).toBe(false);
    // creating a todo is capture, not a side effect → ungated; the do-it tap gates the action.
    expect(agentTools.create_todo.gated).toBe(false);
    expect(agentTools.complete_todo.gated).toBe(true);
    expect(agentTools.uncomplete_todo.gated).toBe(true);
    expect(agentTools.update_todo.gated).toBe(true);
  });
  it("no longer exposes direct side-effect tools (actions flow through todos)", () => {
    expect(agentTools.send_meeting_invite).toBeUndefined();
    expect(agentTools.set_reminder).toBeUndefined();
    expect(agentTools.deep_research).toBeUndefined();
  });
});

describe("query_todos (read, mirrors the app's Views via applyFilter)", () => {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T00:00:00`;
  const today = localDay(now);
  const yesterday = localDay(new Date(now.getTime() - 864e5));
  const pool = [
    { id: "t1", title: "Due today", status: "open", dueAt: today, priority: "p1", labelIds: ["lw"], actionType: "none", detail: null },
    { id: "t2", title: "Overdue thing", status: "open", dueAt: yesterday, priority: "none", labelIds: [], actionType: "none", detail: null },
    { id: "t3", title: "No date task", status: "open", dueAt: null, priority: "p2", labelIds: ["lw"], actionType: "none", detail: "buy milk" },
    { id: "t4", title: "Done one", status: "done", dueAt: today, priority: "none", labelIds: [], actionType: "none", detail: null },
  ];

  beforeEach(() => {
    (store.listTodos as ReturnType<typeof vi.fn>).mockResolvedValue(pool);
    (store.labels as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "lw", name: "work", colorHex: "#c8632e" }]);
  });

  it("dateWindow=today returns only today's OPEN todos", async () => {
    const r = await agentTools.query_todos.run({ dateWindow: "today" }, user);
    const ids = (r.card as { todos: { id: string }[] }).todos.map((t) => t.id);
    expect(ids).toEqual(["t1"]); // t4 is done (excluded), t2/t3 not today
  });

  it("dateWindow=overdue surfaces past-due open todos", async () => {
    const r = await agentTools.query_todos.run({ dateWindow: "overdue" }, user);
    const ids = (r.card as { todos: { id: string }[] }).todos.map((t) => t.id);
    expect(ids).toEqual(["t2"]);
  });

  it("labelNames filters by tag (resolved to ids, any-of)", async () => {
    const r = await agentTools.query_todos.run({ labelNames: ["work"] }, user);
    const ids = (r.card as { todos: { id: string }[] }).todos.map((t) => t.id);
    expect(ids.sort()).toEqual(["t1", "t3"]);
  });

  it("status=done includes completed todos", async () => {
    const r = await agentTools.query_todos.run({ status: "done" }, user);
    const ids = (r.card as { todos: { id: string }[] }).todos.map((t) => t.id);
    expect(ids).toEqual(["t4"]);
  });

  it("text quick-find searches title + notes", async () => {
    const r = await agentTools.query_todos.run({ text: "milk" }, user);
    const ids = (r.card as { todos: { id: string }[] }).todos.map((t) => t.id);
    expect(ids).toEqual(["t3"]);
  });
});

describe("mutate tools (gated; resolve id within the owner's pool)", () => {
  const existing = { id: "t1", title: "Buy milk", status: "open", labelIds: [] };
  beforeEach(() => {
    (store.listTodos as ReturnType<typeof vi.fn>).mockResolvedValue([existing]);
  });

  it("complete_todo sets status done + returns a todo card", async () => {
    (store.updateTodo as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, status: "done" });
    const r = await agentTools.complete_todo.run({ todoId: "t1" }, user);
    expect(store.updateTodo).toHaveBeenCalledWith("u1", "t1", { status: "done" });
    expect((r.card as { type: string }).type).toBe("todo");
    expect(r.output).toContain("Completed");
  });

  it("uncomplete_todo reopens", async () => {
    (store.updateTodo as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, status: "open" });
    await agentTools.uncomplete_todo.run({ todoId: "t1" }, user);
    expect(store.updateTodo).toHaveBeenCalledWith("u1", "t1", { status: "open" });
  });

  it("update_todo edits title/due/priority and replaces labels (names→ids)", async () => {
    (store.upsertLabelByName as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "lx", name: "errand", colorHex: "#c8632e" });
    (store.updateTodo as ReturnType<typeof vi.fn>).mockResolvedValue({ ...existing, title: "Buy oat milk" });
    await agentTools.update_todo.run(
      { todoId: "t1", title: "Buy oat milk", priority: "p2", dueAt: "2026-07-01T00:00:00", labelNames: ["errand"] },
      user,
    );
    expect(store.upsertLabelByName).toHaveBeenCalledWith("u1", "errand");
    expect(store.updateTodo).toHaveBeenCalledWith("u1", "t1", {
      title: "Buy oat milk",
      dueAt: "2026-07-01T00:00:00",
      priority: "p2",
      labelIds: ["lx"],
    });
  });

  it("a mutate on a non-owned/missing id does NOT write", async () => {
    const r = await agentTools.complete_todo.run({ todoId: "nope" }, user);
    expect(store.updateTodo).not.toHaveBeenCalled();
    expect(r.output).toContain("wasn't found");
  });
});

describe("tool run()", () => {
  it("list_todos returns the owner's todos + a card", async () => {
    (store.listTodos as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "t1", title: "a", status: "open" }]);
    const r = await agentTools.list_todos.run({}, user);
    expect(store.listTodos).toHaveBeenCalledWith("u1");
    expect(r.card).toBeTruthy();
    expect(r.output).toContain("a");
  });

  it("search_contacts (read) resolves names to candidates", async () => {
    (contactResolverFor as ReturnType<typeof vi.fn>).mockReturnValue({
      resolve: vi.fn(async () => [{ name: "Dakota Lee", email: "dakota@x.com" }]),
    });
    const r = await agentTools.search_contacts.run({ query: "dakota" }, user);
    expect(contactResolverFor).toHaveBeenCalledWith(user);
    expect(r.output).toContain("dakota@x.com");
  });

  it("create_todo is capture-first (capture then todo), plain todo is actionType none", async () => {
    (store.createCapture as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "c1" });
    (store.createTodo as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "t1", title: "Buy milk", actionType: "none" });
    const r = await agentTools.create_todo.run({ title: "Buy milk" }, user);
    expect(store.createCapture).toHaveBeenCalled();
    expect(store.createTodo).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ title: "Buy milk", sourceCaptureId: "c1", actionType: "none" }),
    );
    expect(r.output).toContain("Buy milk");
  });

  it("create_todo attaches an action + action-bearing subtask, proposed and NOT executed", async () => {
    (store.createCapture as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "c1" });
    (store.createTodo as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({ id: "p1", title: "Meeting with Hansen", actionType: "meeting" })
      .mockResolvedValueOnce({ id: "s1", title: "Research Q3", parentId: "p1", actionType: "research" });
    const r = await agentTools.create_todo.run(
      {
        title: "Meeting with Hansen",
        action: { type: "meeting", attendees: ["Hansen"], start: "2026-07-01T10:00:00" },
        subtasks: [{ title: "Research Q3", action: { type: "research", topic: "Q3" } }],
      },
      user,
    );
    // parent gets the meeting action, parked "proposed" (awaiting the do-it tap)
    expect(store.createTodo).toHaveBeenNthCalledWith(
      1,
      "u1",
      expect.objectContaining({ title: "Meeting with Hansen", actionType: "meeting", actionState: "proposed" }),
    );
    // research is a SUBTASK of the parent (its report will land in the parent's notes)
    expect(store.createTodo).toHaveBeenNthCalledWith(
      2,
      "u1",
      expect.objectContaining({ title: "Research Q3", parentId: "p1", actionType: "research", actionState: "proposed" }),
    );
    const card = r.card as { type: string; subtasks: unknown[] };
    expect(card.type).toBe("todo");
    expect(card.subtasks).toHaveLength(1);
  });
});

describe("toAiSdkTools (chat wiring)", () => {
  it("read tool execute returns the FULL { output, card } so tiles can render", async () => {
    (store.listTodos as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "t1", title: "a", status: "open" }]);
    const tools = toAiSdkTools(user);
    const res = (await (tools.list_todos.execute as (a: unknown, o: unknown) => Promise<{ output: string; card: { type: string } }>)({}, {}));
    expect(res.output).toContain("a");
    expect(res.card.type).toBe("todos"); // card preserved (was previously dropped)
  });

  it("read + create are auto (no approval); mutates use needsApproval (HITL pause)", () => {
    const tools = toAiSdkTools(user);
    // read = auto-run, no approval
    expect(tools.list_todos.execute).toBeTypeOf("function");
    expect((tools.list_todos as { needsApproval?: unknown }).needsApproval).toBeFalsy();
    // create = capture, ungated (the side effect is gated later at the do-it tap)
    expect((tools.create_todo as { needsApproval?: unknown }).needsApproval).toBeFalsy();
    // mutates = gated behind needsApproval; the SDK runs them only after approval.
    expect(tools.update_todo.execute).toBeTypeOf("function");
    expect((tools.update_todo as { needsApproval?: unknown }).needsApproval).toBe(true);
    expect((tools.complete_todo as { needsApproval?: unknown }).needsApproval).toBe(true);
  });

  it("a gated tool's execute IS the real handler (runs only when the SDK invokes it post-approval)", async () => {
    (store.listTodos as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "t1", title: "x", status: "open", labelIds: [] }]);
    (store.updateTodo as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "t1", title: "x", status: "done", labelIds: [] });
    const tools = toAiSdkTools(user);
    // The SDK calls execute() ONLY after an approval response — invoking it here
    // proves it drives the real store mutation (not a placeholder / approval boolean).
    const res = await (tools.complete_todo.execute as (a: unknown, o: unknown) => Promise<{ output: string }>)(
      { todoId: "t1" },
      {},
    );
    expect(store.updateTodo).toHaveBeenCalledWith("u1", "t1", { status: "done" });
    expect(res.output).toContain("Completed");
  });
});
