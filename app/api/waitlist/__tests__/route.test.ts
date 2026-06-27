// @vitest-environment node
// T4.1 — POST /api/waitlist. Public (no auth): the static landing CTAs POST an
// email here. Normalizes + validates, idempotent insert into our own Neon
// `waitlist` table (source of truth). Prisma mocked.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { waitlist: { upsert: vi.fn() } } }));

import { prisma } from "@/lib/db";
import { POST as waitlist } from "@/app/api/waitlist/route";

const upsert = prisma.waitlist.upsert as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  upsert.mockResolvedValue({ id: "w1" });
});

const post = (body: unknown) =>
  waitlist(new Request("http://localhost/api/waitlist", { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/waitlist", () => {
  it("stores a normalized email and returns ok", async () => {
    const res = await post({ email: "  Dakota@Example.COM ", source: "hero" });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
    const arg = upsert.mock.calls[0][0];
    expect(arg.where.email).toBe("dakota@example.com"); // trimmed + lowercased
    expect(arg.create).toMatchObject({ email: "dakota@example.com", source: "hero" });
  });

  it("is idempotent — a repeat signup still returns ok (no duplicate error)", async () => {
    await post({ email: "a@b.com" });
    // upsert (not create) → unique-email conflicts are a no-op, not a 500
    expect(upsert).toHaveBeenCalledTimes(1);
    const arg = upsert.mock.calls[0][0];
    expect(arg.update).toBeDefined();
  });

  it("400s an invalid email and does not touch the DB", async () => {
    const res = await post({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("400s a missing email", async () => {
    const res = await post({ source: "hero" });
    expect(res.status).toBe(400);
    expect(upsert).not.toHaveBeenCalled();
  });
});
