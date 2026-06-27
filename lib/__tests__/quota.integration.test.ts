// withQuota (T2.2 dependency / T3.3) — integration test. Runs against the
// isolated Postgres container the harness provisions (see
// vitest.integration.config.ts). Verifies atomic metering, the 402 at limit,
// the admin/unlimited short-circuit, and refund-on-failure.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { withQuota } from "@/lib/quota";
import { QuotaError } from "@/lib/contracts";
import type { UserCtx } from "@/lib/contracts";

const prisma = new PrismaClient();

const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
const freeId = `free-${stamp}`;
const adminId = `unl-${stamp}`;
const period = new Date().toISOString().slice(0, 7);

const free: UserCtx = { userId: freeId, email: `${freeId}@t.local`, plan: "free" };
const admin: UserCtx = { userId: adminId, email: `${adminId}@t.local`, plan: "unlimited" };

describe("withQuota", () => {
  beforeAll(async () => {
    await prisma.user.create({ data: { id: freeId, email: free.email, plan: "free" } });
    await prisma.user.create({ data: { id: adminId, email: admin.email, plan: "unlimited" } });
  });
  afterAll(async () => {
    await prisma.aiUsage.deleteMany({ where: { userId: { in: [freeId, adminId] } } });
    await prisma.user.deleteMany({ where: { id: { in: [freeId, adminId] } } });
    await prisma.$disconnect();
  });

  it("meters credits and throws QuotaError (402) at the limit", async () => {
    // free = 50 credits; chatTurn costs 1. Seed used near the cap to keep it fast.
    await prisma.aiUsage.upsert({
      where: { userId_period: { userId: freeId, period } },
      create: { userId: freeId, period, used: 49 },
      update: { used: 49 },
    });
    // 50th credit succeeds…
    await expect(withQuota(free, "chatTurn", async () => "ok")).resolves.toBe("ok");
    // …51st is over the cap.
    const err = await withQuota(free, "chatTurn", async () => "ok").catch((e) => e);
    expect(err).toBeInstanceOf(QuotaError);
    expect((err as QuotaError).status).toBe(402);
  });

  it("reserves deepResearch (10) up front and REFUNDS on failure", async () => {
    await prisma.aiUsage.upsert({
      where: { userId_period: { userId: freeId, period } },
      create: { userId: freeId, period, used: 0 },
      update: { used: 0 },
    });
    await expect(
      withQuota(free, "deepResearch", async () => {
        throw new Error("research blew up");
      }),
    ).rejects.toThrow("research blew up");
    const row = await prisma.aiUsage.findUnique({
      where: { userId_period: { userId: freeId, period } },
    });
    expect(row?.used).toBe(0); // reserved 10, refunded 10
  });

  it("short-circuits for unlimited plans (no metering)", async () => {
    const out = await withQuota(admin, "deepResearch", async () => "done");
    expect(out).toBe("done");
    const row = await prisma.aiUsage.findUnique({
      where: { userId_period: { userId: adminId, period } },
    });
    expect(row).toBeNull(); // never wrote a usage row
  });
});
