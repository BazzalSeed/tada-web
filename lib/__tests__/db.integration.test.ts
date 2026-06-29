// @vitest-environment node
// Integration smoke test for the lib/db Prisma client — runs against the isolated
// Postgres container the harness provisions (see vitest.integration.config.ts).
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

const email = `phase0-smoke-${Date.now()}@example.test`;

describe("prisma client roundtrip", () => {
  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  it("creates and reads a User row", async () => {
    const created = await prisma.user.create({ data: { email } });
    expect(created.email).toBe(email);

    const found = await prisma.user.findUnique({ where: { email } });
    expect(found?.id).toBe(created.id);
  });
});
