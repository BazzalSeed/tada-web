// @vitest-environment node
// T3.2 — finish + research route tests. currentUser/store/executors mocked; real
// finishTodo/applyFinishResult/runResearch (unlimited user → withQuota passes).
// Asserts dispatch, persistence, the inline-ask path, and 404/400 guards.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ currentUser: vi.fn() }));
vi.mock("@/lib/store", () => ({
  store: { listTodos: vi.fn(), updateTodo: vi.fn() },
}));
vi.mock("@/lib/executors", () => ({
  executors: { setReminder: vi.fn(), sendMeetingInvite: vi.fn(), deepResearch: vi.fn() },
}));

import { currentUser } from "@/lib/auth";
import { store } from "@/lib/store";
import { executors } from "@/lib/executors";
import { POST as finish } from "@/app/api/todos/[id]/finish/route";
import { POST as startResearch } from "@/app/api/research/route";
import { GET as researchStatus } from "@/app/api/research/[id]/route";
import type { Todo } from "@/lib/contracts";

const mockUser = currentUser as unknown as ReturnType<typeof vi.fn>;
const mockList = store.listTodos as unknown as ReturnType<typeof vi.fn>;
const mockUpdate = store.updateTodo as unknown as ReturnType<typeof vi.fn>;
const user = { userId: "u1", email: "u1@t.local", plan: "unlimited" as const };

const todo = (over: Partial<Todo>): Todo =>
  ({ id: "t1", actionType: "none", actionState: "proposed", title: "t", labelIds: [], ...over }) as Todo;

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue(user);
});

const finishReq = (id: string) =>
  finish(new Request(`http://localhost/api/todos/${id}/finish`, { method: "POST" }), {
    params: Promise.resolve({ id }),
  });

describe("POST /api/todos/:id/finish", () => {
  it("dispatches a meeting, persists done + external id", async () => {
    mockList.mockResolvedValue([
      todo({ id: "t1", actionType: "meeting", actionPayload: { kind: "meeting", title: "Sync", attendees: ["d@x.com"], start: "2026-07-01T14:00:00" } }),
    ]);
    (executors.sendMeetingInvite as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, actionExternalId: "evt-1" });
    const res = await finishReq("t1");
    expect(res.status).toBe(200);
    expect(executors.sendMeetingInvite).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith("u1", "t1", expect.objectContaining({ actionState: "done", actionExternalId: "evt-1" }));
    expect((await res.json()).ok).toBe(true);
  });

  it("returns needsField and does NOT mutate when a field is missing", async () => {
    mockList.mockResolvedValue([
      todo({ id: "t1", actionType: "meeting", actionPayload: { kind: "meeting", title: "Sync", attendees: ["d@x.com"], start: null } }),
    ]);
    (executors.sendMeetingInvite as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, needsField: "start" });
    const res = await finishReq("t1");
    expect((await res.json()).needsField).toBe("start");
    expect(mockUpdate).not.toHaveBeenCalled(); // inline ask — never auto-executes
  });

  it("404s an unknown todo", async () => {
    mockList.mockResolvedValue([]);
    expect((await finishReq("ghost")).status).toBe(404);
  });

  it("routes a research todo through the research runner (writes detail)", async () => {
    mockList.mockResolvedValue([todo({ id: "t1", actionType: "research", actionPayload: { kind: "research", topic: "note apps" } })]);
    (executors.deepResearch as ReturnType<typeof vi.fn>).mockResolvedValue({ markdown: "# Report" });
    const res = await finishReq("t1");
    expect(res.status).toBe(200);
    expect(executors.deepResearch).toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith("u1", "t1", expect.objectContaining({ detail: "# Report", actionState: "done" }));
  });
});

describe("research routes", () => {
  it("POST /api/research runs research for a research todo", async () => {
    mockList.mockResolvedValue([todo({ id: "t1", actionType: "research", actionPayload: { kind: "research", topic: "x" } })]);
    (executors.deepResearch as ReturnType<typeof vi.fn>).mockResolvedValue({ markdown: "# R" });
    const res = await startResearch(new Request("http://localhost/api/research", { method: "POST", body: JSON.stringify({ todoId: "t1" }) }));
    expect(res.status).toBe(200);
    expect((await res.json()).markdown).toBe("# R");
  });

  it("POST /api/research 400s a non-research todo", async () => {
    mockList.mockResolvedValue([todo({ id: "t1", actionType: "none" })]);
    const res = await startResearch(new Request("http://localhost/api/research", { method: "POST", body: JSON.stringify({ todoId: "t1" }) }));
    expect(res.status).toBe(400);
  });

  it("GET /api/research/:id reports status + markdown", async () => {
    mockList.mockResolvedValue([todo({ id: "t1", actionState: "done", detail: "# Done" })]);
    const res = await researchStatus(new Request("http://localhost/api/research/t1"), { params: Promise.resolve({ id: "t1" }) });
    const body = await res.json();
    expect(body.status).toBe("done");
    expect(body.markdown).toBe("# Done");
  });
});
