// @vitest-environment node
// Integration test — requires a migrated DB. Gated behind RUN_DB_TESTS so the
// plain `npm test` suite (build lanes) doesn't depend on a live database.
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const email = `phase0-smoke+${Date.now()}@example.com`;

describe.skipIf(!process.env.RUN_DB_TESTS)("prisma waitlist roundtrip", () => {
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
