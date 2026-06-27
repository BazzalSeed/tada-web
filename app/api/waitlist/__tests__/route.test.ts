// @vitest-environment node
// T4.1 — POST /api/waitlist. Public (no auth): the static landing CTAs POST an
// email here. Normalizes + validates, idempotent insert into our own Neon
// `waitlist` table (source of truth). Prisma mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { waitlist: { create: vi.fn() } } }));

import { prisma } from "@/lib/db";
import { POST as waitlist } from "@/app/api/waitlist/route";

const create = prisma.waitlist.create as unknown as ReturnType<typeof vi.fn>;
// Prisma's unique-constraint violation (duplicate email).
const uniqueErr = Object.assign(new Error("unique"), { code: "P2002" });

beforeEach(() => {
  vi.clearAllMocks();
  create.mockResolvedValue({ id: "w1" });
});

const post = (body: unknown) =>
  waitlist(new Request("http://localhost/api/waitlist", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/waitlist", () => {
  it("stores a normalized email and returns ok + alreadyJoined:false", async () => {
    const res = await post({ email: "  Dakota@Example.COM ", source: "hero" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyJoined: false });
    const arg = create.mock.calls[0][0];
    expect(arg.data).toMatchObject({ email: "dakota@example.com", source: "hero" }); // trimmed + lowercased
  });

  it("is idempotent — a repeat signup returns ok + alreadyJoined:true (no 500)", async () => {
    create.mockRejectedValueOnce(uniqueErr);
    const res = await post({ email: "a@b.com" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, alreadyJoined: true });
  });

  it("accepts `ref` as a source alias", async () => {
    await post({ email: "x@y.com", ref: "footer" });
    expect(create.mock.calls[0][0].data).toMatchObject({ source: "footer" });
  });

  it("400s an invalid email and does not touch the DB", async () => {
    const res = await post({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("400s a missing email", async () => {
    const res = await post({ source: "hero" });
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
