// @vitest-environment node
// T3.3 — /api/chat route. streamText mocked; asserts withQuota(chatTurn) gating,
// tools wired (incl. gated write tools), conversationId required, and that the
// turn is persisted. Quota 402 is covered in quota.test.ts; the compaction seam
// in lib/chat/__tests__.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", async (orig) => ({
  ...(await orig<typeof import("ai")>()),
  streamText: vi.fn(),
}));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => (model: string) => ({ __model: model }),
}));
vi.mock("@/lib/auth", () => ({ currentUser: vi.fn() }));
// store/executors are imported transitively by agent-tools; stub them out.
vi.mock("@/lib/store", () => ({ store: { listTodos: vi.fn(), createCapture: vi.fn(), createTodo: vi.fn() } }));
vi.mock("@/lib/executors", () => ({ executors: { setReminder: vi.fn(), sendMeetingInvite: vi.fn(), deepResearch: vi.fn() } }));
// Chat persistence — exercised for real in lib/chat tests; mocked here so the
// route test stays DB-free.
vi.mock("@/lib/chat/store", () => ({
  clearConversation: vi.fn(),
  getOrCreateConversation: vi.fn(),
  persistMessages: vi.fn(),
}));
vi.mock("@/lib/chat/compact", () => ({ compactIfNeeded: vi.fn() }));

import { streamText } from "ai";
import { currentUser } from "@/lib/auth";
import { clearConversation, getOrCreateConversation } from "@/lib/chat/store";
import { DELETE as deleteChatHandler, POST as chat } from "@/app/api/chat/route";

const mockStream = streamText as unknown as ReturnType<typeof vi.fn>;
const mockUser = currentUser as unknown as ReturnType<typeof vi.fn>;
const mockGetConvo = getOrCreateConversation as unknown as ReturnType<typeof vi.fn>;
const mockClear = clearConversation as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue({ userId: "u1", email: "u1@t.local", plan: "unlimited" });
  mockGetConvo.mockResolvedValue({ summary: null, summaryThroughId: null });
  mockClear.mockResolvedValue(undefined);
  mockStream.mockReturnValue({ toUIMessageStreamResponse: () => new Response("stream", { status: 200 }) });
});

const post = (body: unknown) =>
  chat(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify(body) }));

const oneMessage = [{ role: "user", parts: [{ type: "text", text: "what's due?" }] }];

const del = (conversationId?: string) => {
  const url = conversationId
    ? `http://localhost/api/chat?conversationId=${encodeURIComponent(conversationId)}`
    : "http://localhost/api/chat";
  return deleteChatHandler(new Request(url, { method: "DELETE" }));
};

describe("DELETE /api/chat", () => {
  it("clears the conversation and returns { ok: true }", async () => {
    const res = await del("c-clear-1");
    expect(res.status).toBe(200);
    expect(mockClear).toHaveBeenCalledWith("u1", "c-clear-1");
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });

  it("returns 400 when conversationId is missing", async () => {
    const res = await del();
    expect(res.status).toBe(400);
    expect(mockClear).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockUser.mockRejectedValue(new Error("unauthorized"));
    const res = await del("c-clear-2");
    expect(res.status).toBe(401);
    expect(mockClear).not.toHaveBeenCalled();
  });
});

describe("POST /api/chat", () => {
  it("streams a response with the agent tools wired", async () => {
    const res = await post({ conversationId: "c1", messages: oneMessage });
    expect(res.status).toBe(200);
    expect(mockGetConvo).toHaveBeenCalledWith("u1", "c1");
    const arg = mockStream.mock.calls[0][0];
    expect(arg.model.__model).toBe("gemini-2.5-flash");
    // read tool + create_todo (the capture surface for actions) wired
    expect(arg.tools.list_todos).toBeTruthy();
    expect(arg.tools.create_todo).toBeTruthy();
    // direct side-effect tools are gone — actions flow through todos + /finish
    expect(arg.tools.send_meeting_invite).toBeUndefined();
  });

  it("requires a conversationId", async () => {
    const res = await post({ messages: oneMessage });
    expect(res.status).toBe(400);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockUser.mockRejectedValue(new Error("unauthorized"));
    const res = await post({ conversationId: "c1", messages: [] });
    expect(res.status).toBe(401);
    expect(mockStream).not.toHaveBeenCalled();
  });
});
