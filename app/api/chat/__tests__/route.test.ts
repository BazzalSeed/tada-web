// @vitest-environment node
// T3.3 — /api/chat route. streamText mocked; asserts withQuota(chatTurn) gating,
// tools wired (incl. gated write tools), and the streamed response. Quota 402 is
// covered in quota.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", async (orig) => ({
  ...(await orig<typeof import("ai")>()),
  streamText: vi.fn(),
  convertToModelMessages: vi.fn((m) => m),
}));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => (model: string) => ({ __model: model }),
}));
vi.mock("@/lib/auth", () => ({ currentUser: vi.fn() }));
// store/executors are imported transitively by agent-tools; stub them out.
vi.mock("@/lib/store", () => ({ store: { listTodos: vi.fn(), createCapture: vi.fn(), createTodo: vi.fn() } }));
vi.mock("@/lib/executors", () => ({ executors: { setReminder: vi.fn(), sendMeetingInvite: vi.fn(), deepResearch: vi.fn() } }));

import { streamText } from "ai";
import { currentUser } from "@/lib/auth";
import { POST as chat } from "@/app/api/chat/route";

const mockStream = streamText as unknown as ReturnType<typeof vi.fn>;
const mockUser = currentUser as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue({ userId: "u1", email: "u1@t.local", plan: "unlimited" });
  mockStream.mockReturnValue({ toUIMessageStreamResponse: () => new Response("stream", { status: 200 }) });
});

const post = (messages: unknown) =>
  chat(new Request("http://localhost/api/chat", { method: "POST", body: JSON.stringify({ messages }) }));

describe("POST /api/chat", () => {
  it("streams a response with the agent tools wired", async () => {
    const res = await post([{ role: "user", parts: [{ type: "text", text: "what's due?" }] }]);
    expect(res.status).toBe(200);
    const arg = mockStream.mock.calls[0][0];
    expect(arg.model.__model).toBe("gemini-2.5-flash");
    // read tool present + gated write tool present
    expect(arg.tools.list_todos).toBeTruthy();
    expect(arg.tools.send_meeting_invite).toBeTruthy();
  });

  it("returns 401 when unauthenticated", async () => {
    mockUser.mockRejectedValue(new Error("unauthorized"));
    const res = await post([]);
    expect(res.status).toBe(401);
    expect(mockStream).not.toHaveBeenCalled();
  });
});
