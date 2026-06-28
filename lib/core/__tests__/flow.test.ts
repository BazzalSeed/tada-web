// @vitest-environment node
// T1.1 — pure flow core parity tests. now-injected + table-driven where it helps.
// Ports the native FilterEngine / QuickAddParser / RecurrenceEngine / fractional
// index behavior from prep/native-flow-contract-reference.md.
import { describe, expect, it } from "vitest";
import {
  applyFilter,
  criteriaFor,
  parseQuickAdd,
  between,
  nextOccurrence,
  dueLocalDate,
} from "@/lib/core";
import type { FilterCriteria, SavedView, Todo } from "@/lib/contracts";

// ---- helpers ----
const NOW = new Date(2026, 5, 26, 12, 0, 0); // Fri Jun 26 2026, local noon
const isoLocalDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}T00:00:00`;

function todo(p: Partial<Todo>): Todo {
  return {
    id: p.id ?? "t",
    createdAt: "2026-06-01T00:00:00",
    sourceCaptureId: "c",
    title: p.title ?? "x",
    status: p.status ?? "open",
    actionType: "none",
    actionState: "none",
    sortIndex: p.sortIndex ?? 0,
    priority: p.priority ?? "none",
    labelIds: p.labelIds ?? [],
    dueAt: p.dueAt ?? null,
    ...p,
  } as Todo;
}
const crit = (c: Partial<FilterCriteria> = {}): FilterCriteria => ({
  labelIds: [],
  minPriority: null,
  dateWindow: "any",
  includeCompleted: false,
  ...c,
});

// ============================== dueLocalDate ==============================
describe("dueLocalDate", () => {
  it("parses Z-suffixed ISO as local calendar date (not UTC shift)", () => {
    const d = dueLocalDate("2026-06-27T00:00:00.000Z");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5); // 0-indexed, June
    expect(d.getDate()).toBe(27);
  });

  it("parses date-only string as local calendar date", () => {
    const d = dueLocalDate("2026-06-27");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(5);
    expect(d.getDate()).toBe(27);
  });
});

// ============================== applyFilter ==============================
describe("applyFilter", () => {
  it("never renders dismissed todos", () => {
    const out = applyFilter(crit({ includeCompleted: true }), [todo({ id: "d", status: "dismissed" })], NOW);
    expect(out).toHaveLength(0);
  });

  it("excludes done unless includeCompleted", () => {
    const todos = [todo({ id: "o" }), todo({ id: "done", status: "done" })];
    expect(applyFilter(crit(), todos, NOW).map((t) => t.id)).toEqual(["o"]);
    expect(applyFilter(crit({ includeCompleted: true }), todos, NOW).map((t) => t.id).sort()).toEqual(["done", "o"]);
  });

  it("applies a rank-based minPriority threshold", () => {
    const todos = [todo({ id: "none", priority: "none" }), todo({ id: "p2", priority: "p2" }), todo({ id: "p1", priority: "p1" })];
    expect(applyFilter(crit({ minPriority: "p2" }), todos, NOW).map((t) => t.id).sort()).toEqual(["p1", "p2"]);
  });

  it("matches labels ANY-of", () => {
    const todos = [todo({ id: "a", labelIds: ["x"] }), todo({ id: "b", labelIds: ["y"] }), todo({ id: "c", labelIds: [] })];
    expect(applyFilter(crit({ labelIds: ["x", "z"] }), todos, NOW).map((t) => t.id)).toEqual(["a"]);
  });

  describe("date windows", () => {
    const startToday = new Date(2026, 5, 26, 0, 0, 0);
    const yesterday = new Date(2026, 5, 25, 9, 0, 0);
    const todayPM = new Date(2026, 5, 26, 18, 0, 0);
    const in3 = new Date(2026, 5, 29, 9, 0, 0);
    const in10 = new Date(2026, 6, 6, 9, 0, 0);
    const todos = [
      todo({ id: "noDate", dueAt: null }),
      todo({ id: "yest", dueAt: yesterday.toISOString() }),
      todo({ id: "today", dueAt: todayPM.toISOString() }),
      todo({ id: "in3", dueAt: in3.toISOString() }),
      todo({ id: "in10", dueAt: in10.toISOString() }),
    ];
    void startToday;
    const ids = (w: FilterCriteria["dateWindow"]) =>
      applyFilter(crit({ dateWindow: w }), todos, NOW).map((t) => t.id).sort();

    it("any passes all", () => expect(ids("any")).toHaveLength(5));
    it("noDate keeps only null dueAt", () => expect(ids("noDate")).toEqual(["noDate"]));
    it("today keeps same-calendar-day", () => expect(ids("today")).toEqual(["today"]));
    it("overdue keeps before start-of-today", () => expect(ids("overdue")).toEqual(["yest"]));
    it("next7 keeps [startOfToday, +7d): today + in3, not in10, not yesterday", () =>
      expect(ids("next7")).toEqual(["in3", "today"]));

    it("includes a Z-suffixed dueAt in today filter (timezone-independent)", () => {
      const now = new Date(2026, 5, 27, 10, 0, 0); // Jun 27
      const todayWithZ = [todo({ id: "tzTest", dueAt: "2026-06-27T00:00:00.000Z" })];
      expect(applyFilter(crit({ dateWindow: "today" }), todayWithZ, now).map((t) => t.id)).toEqual(["tzTest"]);
    });
  });
});

// ============================== criteriaFor ==============================
describe("criteriaFor", () => {
  const views: SavedView[] = [
    { id: "v1", name: "Work", colorHex: "#c8632e", icon: "x", sortIndex: 0, criteria: crit({ labelIds: ["work"], dateWindow: "next7" }) },
  ];
  it("all → wide-open defaults", () => expect(criteriaFor({ kind: "all" }, views)).toEqual(crit()));
  it("today → today window", () => expect(criteriaFor({ kind: "today" }, views).dateWindow).toBe("today"));
  it("project → that view's criteria", () => expect(criteriaFor({ kind: "project", id: "v1" }, views).labelIds).toEqual(["work"]));
  it("project missing → falls back to all", () => expect(criteriaFor({ kind: "project", id: "nope" }, views)).toEqual(crit()));
  it("label → any-of that label", () => expect(criteriaFor({ kind: "label", id: "errand" }, views).labelIds).toEqual(["errand"]));
});

// ============================== parseQuickAdd ==============================
describe("parseQuickAdd", () => {
  it("strips priority and reports its token offset", () => {
    const p = parseQuickAdd("call dentist p0", NOW);
    expect(p.priority).toBe("p0");
    expect(p.title).toBe("call dentist");
    const tok = p.tokens.find((t) => t.kind === "priority")!;
    expect("call dentist p0".slice(tok.start, tok.start + tok.length)).toBe("p0");
  });

  it("extracts @labels and #list, leaving a clean title", () => {
    const p = parseQuickAdd("email @work @urgent #inbox the deck", NOW);
    expect(p.labelNames.sort()).toEqual(["urgent", "work"]);
    expect(p.listName).toBe("inbox");
    expect(p.title).toBe("email the deck");
    expect(p.tokens.filter((t) => t.kind === "label")).toHaveLength(2);
  });

  it("resolves 'tomorrow' to start-of-next-day", () => {
    const p = parseQuickAdd("ship invoice tomorrow", NOW);
    expect(p.dueAt).toBe(isoLocalDay(new Date(2026, 5, 27)));
    expect(p.title).toBe("ship invoice");
  });

  it("resolves a weekday to the NEXT future occurrence", () => {
    const p = parseQuickAdd("standup monday", NOW); // NOW is Friday
    const d = new Date(p.dueAt!);
    expect(d.getDay()).toBe(1); // Monday
    expect(d.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("parses ISO dates", () => {
    const p = parseQuickAdd("renew passport 2026-07-15", NOW);
    expect(p.dueAt).toBe(isoLocalDay(new Date(2026, 6, 15)));
  });

  it("scans recurrence BEFORE the weekday so 'monday' is not also a due date", () => {
    const p = parseQuickAdd("water plants every monday", NOW);
    expect(p.recurrence).toEqual({ frequency: "weekly", weekday: 2 }); // Mon = 2 (1=Sun)
    expect(p.dueAt ?? null).toBeNull();
    expect(p.title).toBe("water plants");
  });

  it("parses 'every week' as weekly recurrence", () => {
    const p = parseQuickAdd("sync every week", NOW);
    expect(p.recurrence).toEqual({ frequency: "weekly" });
    expect(p.title).toBe("sync");
  });
});

// ============================== between ==============================
describe("between (fractional index)", () => {
  it("midpoint of two neighbors", () => expect(between(0, 10)).toBe(5));
  it("before the head", () => expect(between(null, 10)).toBe(9));
  it("after the tail", () => expect(between(5, null)).toBe(6));
  it("empty list", () => expect(between(null, null)).toBe(0));
});

// ============================== nextOccurrence ==============================
describe("nextOccurrence", () => {
  const after = new Date(2026, 5, 26, 9, 0, 0);
  it("daily adds interval days", () =>
    expect(nextOccurrence(after, { frequency: "daily", interval: 3 })).toEqual(new Date(2026, 5, 29, 9, 0, 0)));
  it("weekly adds 7×interval days", () =>
    expect(nextOccurrence(after, { frequency: "weekly" })).toEqual(new Date(2026, 6, 3, 9, 0, 0)));
  it("monthly adds interval months", () =>
    expect(nextOccurrence(after, { frequency: "monthly", interval: 2 })).toEqual(new Date(2026, 7, 26, 9, 0, 0)));
  it("yearly adds interval years", () =>
    expect(nextOccurrence(after, { frequency: "yearly" })).toEqual(new Date(2027, 5, 26, 9, 0, 0)));
  it("clamps interval < 1 to 1", () =>
    expect(nextOccurrence(after, { frequency: "daily", interval: 0 })).toEqual(new Date(2026, 5, 27, 9, 0, 0)));
});
