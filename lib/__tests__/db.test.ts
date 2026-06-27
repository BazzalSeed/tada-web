// @vitest-environment node
// Integration test — requires a migrated DB. Gated behind RUN_DB_TESTS so the
// plain `npm test` suite (build lanes) doesn't depend on a live database.
import { afterAll, describe, expect, it } from "vitest";
import { prisma, isRetryableConnectionError } from "@/lib/db";

const email = `phase0-smoke+${Date.now()}@example.com`;

describe("isRetryableConnectionError", () => {
  it("retries Neon autosuspend (57P01)", () => {
    expect(
      isRetryableConnectionError(
        new Error(
          "terminating connection due to administrator command (SqlState 57P01)",
        ),
      ),
    ).toBe(true);
  });

  it("retries Prisma can't-reach / closed-connection codes", () => {
    expect(isRetryableConnectionError({ code: "P1001", message: "x" })).toBe(true);
    expect(isRetryableConnectionError({ code: "P1017", message: "x" })).toBe(true);
  });

  it("retries raw connection-reset transport faults", () => {
    expect(isRetryableConnectionError(new Error("Connection reset by peer"))).toBe(
      true,
    );
    expect(isRetryableConnectionError(new Error("kind: Closed"))).toBe(true);
  });

  it("does NOT retry logic errors", () => {
    expect(
      isRetryableConnectionError({ code: "P2002", message: "Unique constraint" }),
    ).toBe(false);
    expect(isRetryableConnectionError(new Error("todo not found"))).toBe(false);
    expect(isRetryableConnectionError(null)).toBe(false);
    expect(isRetryableConnectionError(undefined)).toBe(false);
  });
});

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
