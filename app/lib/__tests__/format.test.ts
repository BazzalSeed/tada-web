import { describe, expect, it } from "vitest";
import { formatClock, formatDue } from "../format";

const now = new Date(2026, 5, 26, 9, 0, 0); // Fri Jun 26 2026, local

describe("formatDue", () => {
  it("labels same-day as Today", () => {
    expect(formatDue("2026-06-26T15:00:00", now)).toEqual({
      label: "Today",
      overdue: false,
    });
  });

  it("labels next-day as Tomorrow", () => {
    expect(formatDue("2026-06-27T08:00:00", now)).toEqual({
      label: "Tomorrow",
      overdue: false,
    });
  });

  it("marks dates before start-of-today as overdue", () => {
    const r = formatDue("2026-06-24T08:00:00", now);
    expect(r.overdue).toBe(true);
    expect(r.label).toMatch(/Jun 24/);
  });

  it("formats a future date as 'Mon D'", () => {
    expect(formatDue("2026-06-30T14:00:00", now)).toEqual({
      label: "Jun 30",
      overdue: false,
    });
  });

  it("includes the year when it differs from now", () => {
    expect(formatDue("2027-01-05T00:00:00", now).label).toMatch(/Jan 5,? 2027/);
  });
});

describe("formatClock (FIX10)", () => {
  it("formats afternoon times in 12h with am/pm", () => {
    expect(formatClock("2026-06-30T14:00:00")).toBe("2pm");
    expect(formatClock("2026-06-30T14:30:00")).toBe("2:30pm");
  });

  it("formats morning, noon, and midnight-adjacent times", () => {
    expect(formatClock("2026-06-30T09:05:00")).toBe("9:05am");
    expect(formatClock("2026-06-30T12:00:00")).toBe("12pm");
    expect(formatClock("2026-06-30T00:30:00")).toBe("12:30am");
  });

  it("returns null for date-only (midnight) or missing time", () => {
    expect(formatClock("2026-06-30T00:00:00")).toBeNull();
    expect(formatClock("2026-06-30")).toBeNull();
  });
});
