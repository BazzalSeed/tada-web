// Unit test for the connection-fault retry predicate in lib/db. Pure — no DB.
// The DB-backed waitlist roundtrip lives in db.integration.test.ts.
import { describe, expect, it } from "vitest";
import { isRetryableConnectionError } from "@/lib/db";

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
