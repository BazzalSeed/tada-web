// @vitest-environment node
// T3.6 — redeemInvite atomic claim, integration against the Neon TEST branch
// (gated RUN_DB_TESTS). Covers under-cap claim, exhaustion, expiry, and
// email-binding.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { redeemInvite } from "@/lib/auth";

const RUN = !!process.env.RUN_DB_TESTS && !!process.env.DATABASE_URL;
const prisma = RUN ? new PrismaClient() : (null as unknown as PrismaClient);
const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
const codes = {
  twoUse: `c2-${stamp}`,
  expired: `cx-${stamp}`,
  bound: `cb-${stamp}`,
};

describe.skipIf(!RUN)("redeemInvite", () => {
  beforeAll(async () => {
    await prisma.inviteCode.createMany({
      data: [
        { code: codes.twoUse, maxUses: 2 },
        { code: codes.expired, maxUses: 5, expiresAt: new Date(Date.now() - 60_000) },
        { code: codes.bound, maxUses: 5, invitedEmail: "vip@x.com" },
      ],
    });
  });
  afterAll(async () => {
    await prisma.inviteCode.deleteMany({ where: { code: { in: Object.values(codes) } } });
    await prisma.$disconnect();
  });

  it("claims up to maxUses then refuses", async () => {
    expect(await redeemInvite(codes.twoUse, "a@x.com")).toBe(true);
    expect(await redeemInvite(codes.twoUse, "b@x.com")).toBe(true);
    expect(await redeemInvite(codes.twoUse, "c@x.com")).toBe(false); // exhausted
  });

  it("refuses an expired code", async () => {
    expect(await redeemInvite(codes.expired, "a@x.com")).toBe(false);
  });

  it("honors email binding (case-insensitive)", async () => {
    expect(await redeemInvite(codes.bound, "someone@else.com")).toBe(false);
    expect(await redeemInvite(codes.bound, "VIP@x.com")).toBe(true);
  });

  it("refuses an unknown code", async () => {
    expect(await redeemInvite(`missing-${stamp}`, "a@x.com")).toBe(false);
  });
});
