// Unit test for the date-coercion boundary in lib/store. Pure — no DB.
// The DB-backed PrismaTadaStore CRUD lives in store.integration.test.ts.
//
// Guards the FIX7 dated-capture regression: an unparseable date string must
// coerce to null, not an Invalid Date that Prisma rejects mid-persist (which
// collapsed dated captures to "Screenshot capture" under the capture-first
// fallback).
import { describe, expect, it } from "vitest";
import { toNullableDate } from "@/lib/store";

describe("toNullableDate", () => {
  it("passes through a valid ISO string", () => {
    expect(toNullableDate("2026-07-03T14:00:00")?.getFullYear()).toBe(2026);
  });
  it("passes through a Date", () => {
    const d = new Date(2026, 6, 3);
    expect(toNullableDate(d)).toBe(d);
  });
  it("coerces an unparseable relative phrase to null (not Invalid Date)", () => {
    expect(toNullableDate("Friday")).toBeNull();
    expect(toNullableDate("next Tuesday 3pm")).toBeNull();
    expect(toNullableDate("Invalid Date")).toBeNull();
  });
  it("null/undefined → null", () => {
    expect(toNullableDate(null)).toBeNull();
    expect(toNullableDate(undefined)).toBeNull();
  });
});
