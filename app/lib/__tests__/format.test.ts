import { describe, expect, it } from "vitest";
import { formatDue } from "../format";

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
