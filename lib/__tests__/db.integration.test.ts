// @vitest-environment node
// Integration test for the lib/db Prisma client — runs against the isolated
// Postgres container the harness provisions (see vitest.integration.config.ts).
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const code = `phase0-smoke-${Date.now()}`;

describe("prisma invite-code roundtrip", () => {
  afterAll(async () => {
    await prisma.inviteCode.deleteMany({ where: { code } });
    await prisma.$disconnect();
  });

  it("creates and reads an InviteCode row", async () => {
    const created = await prisma.inviteCode.create({
      data: { code, maxUses: 1 },
    });
    expect(created.code).toBe(code);

    const found = await prisma.inviteCode.findUnique({ where: { code } });
    expect(found?.code).toBe(created.code);
  });
});
