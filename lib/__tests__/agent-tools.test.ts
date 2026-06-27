// @vitest-environment node
// T3.3 — AgentTool registry. Read tools auto-run, write tools are gated. Each
// run() drives the store/executors. store/executors/research mocked; unlimited
// user so any withQuota inside passes through.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/store", () => ({
  store: { listTodos: vi.fn(), createCapture: vi.fn(), createTodo: vi.fn() },
}));
vi.mock("@/lib/executors", () => ({
  executors: { setReminder: vi.fn(), sendMeetingInvite: vi.fn(), deepResearch: vi.fn() },
}));
vi.mock("@/lib/contacts", () => ({ contactResolverFor: vi.fn() }));

import { agentTools, toAiSdkTools } from "@/lib/agent-tools";
import { contactResolverFor } from "@/lib/contacts";
import { store } from "@/lib/store";
import { executors } from "@/lib/executors";
import type { UserCtx } from "@/lib/contracts";

const user: UserCtx = { userId: "u1", email: "u1@t.local", plan: "unlimited", googleRefreshToken: "r" };

beforeEach(() => vi.clearAllMocks());

describe("registry gating", () => {
  it("reads are auto (gated=false), writes are gated (gated=true)", () => {
    expect(agentTools.list_todos.gated).toBe(false);
    expect(agentTools.search_contacts.gated).toBe(false);
    expect(agentTools.create_todo.gated).toBe(true);
    expect(agentTools.set_reminder.gated).toBe(true);
    expect(agentTools.send_meeting_invite.gated).toBe(true);
    expect(agentTools.deep_research.gated).toBe(true);
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

  it("create_todo is capture-first (capture then todo)", async () => {
    (store.createCapture as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "c1" });
    (store.createTodo as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "t1", title: "Buy milk" });
    const r = await agentTools.create_todo.run({ title: "Buy milk" }, user);
    expect(store.createCapture).toHaveBeenCalled();
    expect(store.createTodo).toHaveBeenCalledWith("u1", expect.objectContaining({ title: "Buy milk", sourceCaptureId: "c1" }));
    expect(r.output).toContain("Buy milk");
  });

  it("send_meeting_invite delegates to the executor", async () => {
    (executors.sendMeetingInvite as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, actionExternalId: "evt-1" });
    const r = await agentTools.send_meeting_invite.run(
      { title: "Sync", attendees: ["d@x.com"], start: "2026-07-01T14:00:00" },
      user,
    );
    expect(executors.sendMeetingInvite).toHaveBeenCalled();
    expect(r.output).toContain("evt-1");
  });

  it("set_reminder delegates to the executor", async () => {
    (executors.setReminder as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, actionExternalId: "rem-1" });
    const r = await agentTools.set_reminder.run({ text: "Call mom", remindAt: "2026-07-01T09:00:00" }, user);
    expect(executors.setReminder).toHaveBeenCalled();
    expect(r.output).toBeTruthy();
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

  it("gated write tools omit execute (HITL pause for approval)", () => {
    const tools = toAiSdkTools(user);
    expect(tools.list_todos.execute).toBeTypeOf("function"); // read = auto
    expect(tools.send_meeting_invite.execute).toBeUndefined(); // gated = paused
    expect(tools.create_todo.execute).toBeUndefined();
  });
});
