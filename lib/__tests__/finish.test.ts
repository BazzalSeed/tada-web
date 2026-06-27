// @vitest-environment node
// T3.2 — finishTodo dispatch + applyFinishResult persistence. Executors + store
// mocked; asserts routing by actionType, the inline-ask (needsField) path leaving
// state untouched, and done/failed persistence. Never auto-executes (only runs
// when finishTodo is called).
import { describe, expect, it, vi } from "vitest";
import { finishTodo, applyFinishResult } from "@/lib/finish";
import type { Executors, TadaStore, Todo, UserCtx } from "@/lib/contracts";

const user: UserCtx = { userId: "u1", email: "u1@t.local", plan: "unlimited" };

const baseTodo = (over: Partial<Todo>): Todo =>
  ({
    id: "t1", createdAt: "x", sourceCaptureId: "c", title: "t", status: "open",
    actionType: "none", actionState: "proposed", sortIndex: 0, priority: "none", labelIds: [],
    ...over,
  }) as Todo;

const mockEx = (): Executors => ({
  setReminder: vi.fn(async () => ({ ok: true, actionExternalId: "rem:1" })),
  sendMeetingInvite: vi.fn(async () => ({ ok: true, actionExternalId: "evt:1" })),
  deepResearch: vi.fn(async () => ({ markdown: "# r" })),
});

describe("finishTodo dispatch", () => {
  it("routes reminder → setReminder", async () => {
    const ex = mockEx();
    const todo = baseTodo({ actionType: "reminder", actionPayload: { kind: "reminder", text: "x", remindAt: "2026-07-01T09:00:00" } });
    const r = await finishTodo(todo, user, ex);
    expect(ex.setReminder).toHaveBeenCalled();
    expect(r.actionExternalId).toBe("rem:1");
  });
  it("routes meeting → sendMeetingInvite", async () => {
    const ex = mockEx();
    const todo = baseTodo({ actionType: "meeting", actionPayload: { kind: "meeting", title: "Sync", attendees: ["d@x.com"], start: "2026-07-01T14:00:00" } });
    await finishTodo(todo, user, ex);
    expect(ex.sendMeetingInvite).toHaveBeenCalled();
  });
  it("returns an error for a 'none' todo (nothing to finish)", async () => {
    const r = await finishTodo(baseTodo({ actionType: "none" }), user, mockEx());
    expect(r.ok).toBe(false);
  });
});

describe("applyFinishResult persistence", () => {
  const store = () => ({ updateTodo: vi.fn(async () => baseTodo({})) }) as unknown as TadaStore;

  it("on success marks actionState done + stores the external id", async () => {
    const s = store();
    await applyFinishResult(s, user, baseTodo({ id: "t1" }), { ok: true, actionExternalId: "evt:1" });
    expect(s.updateTodo).toHaveBeenCalledWith("u1", "t1", expect.objectContaining({ actionState: "done", actionExternalId: "evt:1" }));
  });
  it("on needsField does NOT mutate the todo (inline ask only)", async () => {
    const s = store();
    await applyFinishResult(s, user, baseTodo({ id: "t1" }), { ok: false, needsField: "start" });
    expect(s.updateTodo).not.toHaveBeenCalled();
  });
  it("on failure marks actionState failed, leaves it open", async () => {
    const s = store();
    await applyFinishResult(s, user, baseTodo({ id: "t1" }), { ok: false, error: "denied" });
    expect(s.updateTodo).toHaveBeenCalledWith("u1", "t1", expect.objectContaining({ actionState: "failed" }));
  });
});
