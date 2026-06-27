// @vitest-environment node
// T3.1 — executors. setReminder is deterministic; deepResearch uses Gemini 2.5
// Pro (generateText mocked); sendMeetingInvite hits Google via the user's refresh
// token (fetch mocked). Never auto-executes — these run only when called.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", async (orig) => ({
  ...(await orig<typeof import("ai")>()),
  generateText: vi.fn(),
}));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI: () => (model: string) => ({ __model: model }),
}));

import { generateText } from "ai";
import { executors } from "@/lib/executors";
import type { ActionPayload, UserCtx } from "@/lib/contracts";

const genText = generateText as unknown as ReturnType<typeof vi.fn>;
const user: UserCtx = {
  userId: "u1",
  email: "u1@t.local",
  plan: "unlimited",
  googleRefreshToken: "refresh-xyz",
};
const meeting = (over: Partial<Extract<ActionPayload, { kind: "meeting" }>> = {}) =>
  ({ kind: "meeting", title: "Sync", attendees: ["dakota@x.com"], start: "2026-07-01T14:00:00", durationMin: 30, ...over }) as Extract<ActionPayload, { kind: "meeting" }>;

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("setReminder", () => {
  it("succeeds with an external id when remindAt is present", async () => {
    const r = await executors.setReminder({ kind: "reminder", text: "Call mom", remindAt: "2026-07-01T09:00:00" });
    expect(r.ok).toBe(true);
    expect(r.actionExternalId).toBeTruthy();
  });
  it("asks for the missing remindAt (single inline ask)", async () => {
    const r = await executors.setReminder({ kind: "reminder", text: "Call mom" });
    expect(r.ok).toBe(false);
    expect(r.needsField).toBe("remindAt");
  });
});

describe("deepResearch", () => {
  it("returns markdown and reports progress", async () => {
    genText.mockResolvedValue({ text: "# Findings\n- point a\n- point b" });
    const progress: string[] = [];
    const out = await executors.deepResearch({ kind: "research", topic: "best note apps" }, (s) => progress.push(s));
    expect(out.markdown).toContain("# Findings");
    expect(progress.length).toBeGreaterThan(0);
    // model is Gemini 2.5 Pro
    const arg = genText.mock.calls[0][0];
    expect(arg.model.__model).toBe("gemini-2.5-pro");
  });
});

describe("sendMeetingInvite", () => {
  const okFetch = () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes("oauth2.googleapis.com"))
        return new Response(JSON.stringify({ access_token: "at-123", expires_in: 3600 }), { status: 200 });
      // calendar event create
      return new Response(JSON.stringify({ id: "evt-987", htmlLink: "https://cal/evt" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("refreshes the token and creates a calendar event (sendUpdates=all)", async () => {
    const fetchMock = okFetch();
    const r = await executors.sendMeetingInvite(meeting(), user);
    expect(r.ok).toBe(true);
    expect(r.actionExternalId).toBe("evt-987");
    const calCall = fetchMock.mock.calls.find((c) => String(c[0]).includes("calendar"));
    expect(String(calCall![0])).toContain("sendUpdates=all");
  });

  it("asks for the missing start time", async () => {
    const r = await executors.sendMeetingInvite(meeting({ start: null }), user);
    expect(r.ok).toBe(false);
    expect(r.needsField).toBe("start");
  });

  it("Send-gate: refuses when an attendee is unresolved (no email)", async () => {
    const r = await executors.sendMeetingInvite(meeting({ attendees: ["Dakota"] }), user);
    expect(r.ok).toBe(false);
    expect(r.needsField).toBe("attendees");
  });

  it("errors cleanly when Google isn't connected", async () => {
    const r = await executors.sendMeetingInvite(meeting(), { ...user, googleRefreshToken: null });
    expect(r.ok).toBe(false);
    expect(r.error).toBeTruthy();
  });
});
