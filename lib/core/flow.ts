// ============================================================================
// T1.1 — pure, deterministic flow core (Backend-owned implementations of the
// frozen signatures in lib/contracts/filter.ts). Ported 1:1 from native Tada
// (prep/native-flow-contract-reference.md). All fns are pure and `now`-injected.
// Consumers import these from "@/lib/core"; types come from "@/lib/contracts".
// ============================================================================

import { PRIORITY_RANK } from "@/lib/contracts";
import type {
  ApplyFilter,
  Between,
  CriteriaFor,
  FilterCriteria,
  NextOccurrence,
  ParsedQuickAdd,
  ParseQuickAdd,
  ParseToken,
  Priority,
  RecurrenceRule,
} from "@/lib/contracts";

// ---- date helpers (local-calendar semantics, matching native Calendar.current) ----
const startOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number): Date => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};
const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

// Parse the DATE PORTION of a dueAt ISO as a LOCAL calendar date (matching the
// due-chip in app/lib/format.ts). Using `new Date(iso)` directly would read a
// date-only or Z-suffixed value as UTC and shift the day in negative-offset
// zones, dropping "due today" todos out of the Today filter.
export const dueLocalDate = (iso: string): Date => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

// ============================== applyFilter ==============================
export const applyFilter: ApplyFilter = (c, todos, now) => {
  const startToday = startOfDay(now);
  const endNext7 = addDays(startToday, 7);

  return todos.filter((t) => {
    // 1. never render dismissed
    if (t.status === "dismissed") return false;
    // 2. exclude done unless includeCompleted
    if (t.status === "done" && !c.includeCompleted) return false;
    // 3. priority rank threshold
    if (c.minPriority && PRIORITY_RANK[t.priority] < PRIORITY_RANK[c.minPriority]) {
      return false;
    }
    // 4. labels ANY-of
    if (c.labelIds.length > 0) {
      const set = new Set(c.labelIds);
      if (!t.labelIds.some((id) => set.has(id))) return false;
    }
    // 5. date window
    const due = t.dueAt ? dueLocalDate(t.dueAt) : null;
    switch (c.dateWindow) {
      case "any":
        return true;
      case "noDate":
        return due === null;
      case "today":
        return due !== null && sameDay(due, now);
      case "overdue":
        return due !== null && due < startToday;
      case "next7":
        return due !== null && due >= startToday && due < endNext7;
      default:
        return true;
    }
  });
};

// ============================== criteriaFor ==============================
const ALL_CRITERIA = (): FilterCriteria => ({
  labelIds: [],
  minPriority: null,
  dateWindow: "any",
  includeCompleted: false,
});

export const criteriaFor: CriteriaFor = (sel, views) => {
  switch (sel.kind) {
    case "all":
      return ALL_CRITERIA();
    case "today":
      return { ...ALL_CRITERIA(), dateWindow: "today" };
    case "project": {
      const v = views.find((view) => view.id === sel.id);
      return v ? v.criteria : ALL_CRITERIA();
    }
    case "label":
      return { ...ALL_CRITERIA(), labelIds: [sel.id] };
  }
};

// ============================== parseQuickAdd ==============================
const WEEKDAYS: Record<string, number> = {
  // native Calendar weekday: 1=Sun .. 7=Sat
  sunday: 1, sun: 1,
  monday: 2, mon: 2,
  tuesday: 3, tue: 3, tues: 3,
  wednesday: 4, wed: 4,
  thursday: 5, thu: 5, thurs: 5,
  friday: 6, fri: 6,
  saturday: 7, sat: 7,
};

const fmtLocalDay = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}T00:00:00`;

function resolveRecurrence(word: string): RecurrenceRule | null {
  const w = word.toLowerCase();
  if (w === "day" || w === "daily") return { frequency: "daily" };
  if (w === "week" || w === "weekly") return { frequency: "weekly" };
  if (w === "month" || w === "monthly") return { frequency: "monthly" };
  if (w === "year" || w === "yearly") return { frequency: "yearly" };
  if (w in WEEKDAYS) return { frequency: "weekly", weekday: WEEKDAYS[w] };
  return null;
}

function resolveDate(word: string, now: Date): Date | null {
  const w = word.toLowerCase();
  if (w === "today") return startOfDay(now);
  if (w === "tomorrow" || w === "tmr") return addDays(startOfDay(now), 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(w)) {
    const [y, m, d] = w.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  if (w in WEEKDAYS) {
    // next future occurrence (strictly after today), native weekday numbering.
    const targetDow = WEEKDAYS[w] - 1; // back to JS 0=Sun..6=Sat
    const start = startOfDay(now);
    let delta = (targetDow - start.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    return addDays(start, delta);
  }
  return null;
}

interface Span {
  start: number;
  length: number;
}
const overlaps = (s: number, len: number, spans: Span[]): boolean =>
  spans.some((sp) => s < sp.start + sp.length && sp.start < s + len);

export const parseQuickAdd: ParseQuickAdd = (text, now = new Date()) => {
  const ref = now;
  const tokens: ParseToken[] = [];
  const consumed: Span[] = []; // spans removed from the title
  let priority: Priority = "none";
  let dueAt: string | null = null;
  let recurrence: RecurrenceRule | null = null;
  const labelNames: string[] = [];
  let listName: string | null = null;

  // 1. Recurrence FIRST — "every <unit|weekday>" — so a recurrence weekday isn't
  //    also consumed as a one-off due date. Not a highlight token (no kind).
  const recurRe = /\bevery\s+([a-z]+)\b/gi;
  let rm: RegExpExecArray | null;
  while ((rm = recurRe.exec(text)) !== null) {
    const rule = resolveRecurrence(rm[1]);
    if (rule) {
      if (!recurrence) recurrence = rule;
      consumed.push({ start: rm.index, length: rm[0].length });
    }
  }

  // 2. Priority: p0|p1|p2 (case-insensitive, word-boundary).
  const prioRe = /\bp([0-2])\b/gi;
  let pm: RegExpExecArray | null;
  while ((pm = prioRe.exec(text)) !== null) {
    if (overlaps(pm.index, pm[0].length, consumed)) continue;
    priority = `p${pm[1]}` as Priority;
    tokens.push({ kind: "priority", start: pm.index, length: pm[0].length });
    consumed.push({ start: pm.index, length: pm[0].length });
  }

  // 3. #labels.
  const labelRe = /#(\w+)/g;
  let lm: RegExpExecArray | null;
  while ((lm = labelRe.exec(text)) !== null) {
    if (overlaps(lm.index, lm[0].length, consumed)) continue;
    labelNames.push(lm[1].toLowerCase());
    tokens.push({ kind: "label", start: lm.index, length: lm[0].length });
    consumed.push({ start: lm.index, length: lm[0].length });
  }

  // 4. #list (first wins).
  const listRe = /#(\w+)/g;
  let sm: RegExpExecArray | null;
  while ((sm = listRe.exec(text)) !== null) {
    if (overlaps(sm.index, sm[0].length, consumed)) continue;
    if (!listName) listName = sm[1].toLowerCase();
    tokens.push({ kind: "list", start: sm.index, length: sm[0].length });
    consumed.push({ start: sm.index, length: sm[0].length });
  }

  // 5. Dates: today|tomorrow|tmr|<weekday>|<ISO> — skipping anything already
  //    consumed (e.g. a recurrence weekday). First valid date wins.
  const wordRe = /\b([A-Za-z]+|\d{4}-\d{2}-\d{2})\b/g;
  let wm: RegExpExecArray | null;
  while ((wm = wordRe.exec(text)) !== null) {
    if (overlaps(wm.index, wm[0].length, consumed)) continue;
    const d = resolveDate(wm[1], ref);
    if (!d) continue;
    if (!dueAt) dueAt = fmtLocalDay(d);
    tokens.push({ kind: "date", start: wm.index, length: wm[0].length });
    consumed.push({ start: wm.index, length: wm[0].length });
  }

  // Build the title by removing consumed spans, then normalizing whitespace.
  consumed.sort((a, b) => a.start - b.start);
  let title = "";
  let cursor = 0;
  for (const sp of consumed) {
    title += text.slice(cursor, sp.start);
    cursor = sp.start + sp.length;
  }
  title += text.slice(cursor);
  title = title.replace(/\s+/g, " ").trim();

  return { title, dueAt, priority, labelNames, listName, recurrence, tokens };
};

// ============================== between ==============================
export const between: Between = (before, after) => {
  if (before !== null && after !== null) return (before + after) / 2;
  if (before === null && after !== null) return after - 1;
  if (before !== null && after === null) return before + 1;
  return 0; // empty list
};

// ============================== nextOccurrence ==============================
export const nextOccurrence: NextOccurrence = (after, rule) => {
  const interval = Math.max(1, rule.interval ?? 1);
  const r = new Date(after);
  switch (rule.frequency) {
    case "daily":
      r.setDate(r.getDate() + interval);
      break;
    case "weekly":
      r.setDate(r.getDate() + 7 * interval);
      break;
    case "monthly":
      r.setMonth(r.getMonth() + interval);
      break;
    case "yearly":
      r.setFullYear(r.getFullYear() + interval);
      break;
  }
  return r;
};
