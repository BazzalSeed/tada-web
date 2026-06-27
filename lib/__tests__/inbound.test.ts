// @vitest-environment node
// T2.6 — inbound email. Alias round-trip + the webhook handler (Basic-Auth
// verification, alias→user resolution, capture-first via runCapture). prisma +
// runCapture mocked; no network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/capture", () => ({ runCapture: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

import { aliasForUser, userIdFromAlias, handleInboundEmail } from "@/lib/inbound";
import { runCapture } from "@/lib/capture";
import { prisma } from "@/lib/db";

const SECRET = "shh-inbound";
const mockRun = runCapture as unknown as ReturnType<typeof vi.fn>;
const mockFindUser = prisma.user.findUnique as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("POSTMARK_INBOUND_WEBHOOK_SECRET", SECRET);
});
afterEach(() => vi.unstubAllEnvs());

describe("alias round-trip", () => {
  it("aliasForUser → userIdFromAlias recovers the id", () => {
    const alias = aliasForUser("user123");
    expect(alias).toBe("u_user123@in.gettada.app");
    expect(userIdFromAlias(alias)).toBe("user123");
  });
  it("extracts the alias from a 'Name <addr>' form", () => {
    expect(userIdFromAlias('"Tada" <u_abc@in.gettada.app>')).toBe("abc");
  });
  it("returns null for a non-matching address", () => {
    expect(userIdFromAlias("someone@gmail.com")).toBeNull();
  });
});

const basic = (user: string, pass: string) =>
  `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}`;

const postmarkReq = (recipient: string, auth?: string) =>
  new Request("http://localhost/api/inbound/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth ? { authorization: auth } : {}),
    },
    body: JSON.stringify({
      From: "boss@example.com",
      OriginalRecipient: recipient,
      To: recipient,
      Subject: "Lunch Tuesday?",
      TextBody: "Can we meet Tuesday at 2pm?",
      Attachments: [],
    }),
  });

describe("handleInboundEmail", () => {
  it("rejects a missing/invalid Basic-Auth password with 401", async () => {
    const noAuth = await handleInboundEmail(postmarkReq("u_u1@in.gettada.app"));
    expect(noAuth.status).toBe(401);
    const badAuth = await handleInboundEmail(
      postmarkReq("u_u1@in.gettada.app", basic("postmark", "wrong")),
    );
    expect(badAuth.status).toBe(401);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("accepts any username, verifying only the password", async () => {
    mockFindUser.mockResolvedValue({ id: "u1", email: "u1@t.local", plan: "free" });
    mockRun.mockResolvedValue({ capture: { id: "c" }, todos: [{ id: "t" }] });
    const res = await handleInboundEmail(
      postmarkReq("u_u1@in.gettada.app", basic("anything", SECRET)),
    );
    expect(res.status).toBe(200);
  });

  it("runs capture-first for the resolved user (email source)", async () => {
    mockFindUser.mockResolvedValue({ id: "u1", email: "u1@t.local", plan: "free" });
    mockRun.mockResolvedValue({ capture: { id: "c" }, todos: [{ id: "t" }] });
    await handleInboundEmail(postmarkReq("u_u1@in.gettada.app", basic("postmark", SECRET)));
    expect(mockRun).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", plan: "free" }),
      expect.objectContaining({
        kind: "email",
        email: expect.objectContaining({ from: "boss@example.com", subject: "Lunch Tuesday?", body: "Can we meet Tuesday at 2pm?" }),
      }),
    );
  });

  it("drops (200, no capture) when the alias maps to no known user", async () => {
    mockFindUser.mockResolvedValue(null);
    const res = await handleInboundEmail(
      postmarkReq("u_ghost@in.gettada.app", basic("postmark", SECRET)),
    );
    expect(res.status).toBe(200);
    expect(mockRun).not.toHaveBeenCalled();
  });
});
