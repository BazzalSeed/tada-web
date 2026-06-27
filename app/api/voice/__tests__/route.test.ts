// @vitest-environment node
// T3.5 — voice backend routes. session mints an ephemeral OpenAI Realtime secret
// (fetch mocked) + embeds our tool defs; tool routes through the shared registry
// with server-side gating (never auto-execute a gated write); usage meters a turn
// via withQuota(chatTurn). currentUser/store/executors mocked. NO Claude.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ currentUser: vi.fn() }));
// store/executors are imported transitively by agent-tools; stub them out so the
// real registry runs without touching Prisma/Gemini/Google.
vi.mock("@/lib/store", () => ({
  store: { listTodos: vi.fn(), createCapture: vi.fn(), createTodo: vi.fn() },
}));
vi.mock("@/lib/executors", () => ({
  executors: { setReminder: vi.fn(), sendMeetingInvite: vi.fn(), deepResearch: vi.fn() },
}));

import { currentUser } from "@/lib/auth";
import { store } from "@/lib/store";
import { executors } from "@/lib/executors";
import { POST as session } from "@/app/api/voice/session/route";
import { POST as voiceTool } from "@/app/api/voice/tool/route";
import { POST as usage } from "@/app/api/voice/usage/route";

const mockUser = currentUser as unknown as ReturnType<typeof vi.fn>;
const user = { userId: "u1", email: "u1@t.local", plan: "unlimited" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue(user);
  process.env.OPENAI_API_KEY = "sk-test";
});

const req = (url: string, body?: unknown) =>
  new Request(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

describe("POST /api/voice/session", () => {
  it("mints an ephemeral secret + embeds our tool defs", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ value: "ek_test123", expires_at: 1234567890 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await session();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clientSecret).toBe("ek_test123");
    // our function tools are embedded and returned to the client
    const names = body.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("list_todos");
    expect(names).toContain("send_meeting_invite");

    // called the current client_secrets endpoint with our key + tools in session
    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toContain("/v1/realtime/client_secrets");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk-test");
    const sent = JSON.parse(init.body as string);
    expect(sent.session.tools.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it("502s when OpenAI rejects the mint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 401 })));
    const res = await session();
    expect(res.status).toBe(502);
    vi.unstubAllGlobals();
  });

  it("401s when unauthenticated", async () => {
    mockUser.mockRejectedValue(new Error("unauthorized"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await session();
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled(); // never mint for an anon caller
    vi.unstubAllGlobals();
  });
});

describe("POST /api/voice/tool", () => {
  it("runs a read tool (list_todos) immediately", async () => {
    (store.listTodos as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: "t1", title: "a", status: "open" }]);
    const res = await voiceTool(req("http://localhost/api/voice/tool", { name: "list_todos", args: {} }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.output).toContain("a");
  });

  it("withholds a gated write until approved (never auto-executes)", async () => {
    const res = await voiceTool(
      req("http://localhost/api/voice/tool", { name: "send_meeting_invite", args: { title: "Sync", attendees: ["d@x.com"] } }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("approval_required");
    expect(executors.sendMeetingInvite).not.toHaveBeenCalled();
  });

  it("executes a gated write once approved", async () => {
    (executors.sendMeetingInvite as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, actionExternalId: "evt-1" });
    const res = await voiceTool(
      req("http://localhost/api/voice/tool", {
        name: "send_meeting_invite",
        args: { title: "Sync", attendees: ["d@x.com"], start: "2026-07-01T14:00:00" },
        approved: true,
      }),
    );
    expect(res.status).toBe(200);
    expect(executors.sendMeetingInvite).toHaveBeenCalled();
    expect((await res.json()).output).toContain("evt-1");
  });

  it("404s an unknown tool", async () => {
    const res = await voiceTool(req("http://localhost/api/voice/tool", { name: "nope", args: {} }));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/voice/usage", () => {
  it("meters a voice turn (unlimited plan passes)", async () => {
    const res = await usage(req("http://localhost/api/voice/usage", { inputTokens: 10, outputTokens: 20 }));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ok");
  });

  it("401s when unauthenticated", async () => {
    mockUser.mockRejectedValue(new Error("unauthorized"));
    const res = await usage(req("http://localhost/api/voice/usage", {}));
    expect(res.status).toBe(401);
  });
});
