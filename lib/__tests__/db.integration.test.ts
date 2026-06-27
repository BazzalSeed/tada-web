// @vitest-environment node
// Integration test for the lib/db Prisma client — runs against the isolated
// Postgres container the harness provisions (see vitest.integration.config.ts).
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const email = `phase0-smoke+${Date.now()}@example.com`;

describe("prisma waitlist roundtrip", () => {
  afterAll(async () => {
    await prisma.waitlist.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("creates and reads a Waitlist row", async () => {
    const created = await prisma.waitlist.create({
      data: { email, source: "phase0-test" },
    });
    expect(created.email).toBe(email);

    const found = await prisma.waitlist.findUnique({ where: { email } });
    expect(found?.id).toBe(created.id);
  });
});
