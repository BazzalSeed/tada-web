// ============================================================================
// FIX2 — the "do it for me" OFFER preview. Pure, deterministic descriptor of the
// CONCRETE effect a todo's action will have, derived solely from its actionType +
// actionPayload + actionState. The tap-path row/detail-pane renders this BEFORE
// the tap ("the offer shows the concrete effect; the tap is the confirmation"),
// then POSTs /api/todos/:id/finish to execute. Shared by frontend + backend so
// the preview text and the executed effect can't drift.
//
// This is preview ONLY — it never executes anything (never auto-execute).
// ============================================================================

import type { ActionState, ActionType, Todo } from "@/lib/contracts";

// The single inline ask the offer surfaces when one essential field is missing
// (mirrors ExecResult.needsField from the executors).
export type OfferNeedsField = "start" | "attendees" | "remindAt" | null;

export interface OfferDescriptor {
  actionType: Exclude<ActionType, "none">;
  // CTA verb for the tap button, e.g. "Send invite", "Set reminder", "Research".
  verb: string;
  // One-line concrete effect, e.g. "Invite a@b.com · Tue Jul 1, 2:00 PM · 30m".
  effect: string;
  // When set, the action is blocked on ONE field — the row shows a single inline
  // ask instead of an armed tap (never-auto-execute parity with the executors).
  needsField: OfferNeedsField;
  // Mirror of todo.actionState so the row can show proposed / done / failed /
  // needs_disambiguation without re-deriving it.
  state: ActionState;
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const startOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayDelta = (a: Date, b: Date): number =>
  Math.round((startOfDay(a).getTime() - startOfDay(b).getTime()) / 86_400_000);

// Relative-aware date label from an offset-less local ISO ("2026-06-30T…"),
// mirroring the app's due-chip formatting so the unified offer reads the same:
// "Today" / "Tomorrow" / "Jun 30" / "Jun 30, 2027". `now`-injected.
function fmtDateLabel(iso: string, now: Date): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const due = new Date(y, (m || 1) - 1, d || 1);
  const delta = dayDelta(due, now);
  if (delta === 0) return "Today";
  if (delta === 1) return "Tomorrow";
  const base = `${MONTHS[due.getMonth()]} ${due.getDate()}`;
  return due.getFullYear() === now.getFullYear() ? base : `${base}, ${due.getFullYear()}`;
}

// Compact clock from the ISO time component → "2pm" / "2:30pm"; null for a
// date-only / midnight value (the domain's date-only encoding).
function fmtClock(iso: string): string | null {
  const t = iso.slice(11, 16);
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const [hh, mm] = t.split(":").map(Number);
  if (hh === 0 && mm === 0) return null;
  const period = hh < 12 ? "am" : "pm";
  const h12 = hh % 12 === 0 ? 12 : hh % 12;
  return mm === 0 ? `${h12}${period}` : `${h12}:${String(mm).padStart(2, "0")}${period}`;
}

// When-parts for the " · "-joined effect line: [] for no time; the raw string
// verbatim for a non-ISO value (a stray "next tuesday" must never become NaN);
// else [date] or [date, clock].
function whenParts(iso: string | null | undefined, now: Date): string[] {
  if (!iso) return [];
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return [iso];
  const date = fmtDateLabel(iso, now);
  const clock = fmtClock(iso);
  return clock ? [date, clock] : [date];
}

const fmtDuration = (min: number | null | undefined): string | null =>
  !min || min <= 0 ? null : `${min} min`;

// Builds the offer preview for a todo, or null when there's nothing to offer
// (actionType none, or the action is already done / has no proposed state).
// `now` is injected for the relative date label (defaults to the real clock).
export function describeOffer(todo: Todo, now: Date = new Date()): OfferDescriptor | null {
  const { actionType, actionPayload, actionState } = todo;
  if (actionType === "none") return null;
  // Only surface an offer while it's actionable: proposed (armed) or blocked on
  // disambiguation, or a prior failure the user can retry. A done action shows no
  // tap (the row reflects actionState elsewhere).
  if (actionState === "done") return null;

  if (actionType === "reminder") {
    const p = actionPayload?.kind === "reminder" ? actionPayload : null;
    const text = p?.text?.trim() || todo.title;
    const parts = [`Remind: ${text}`, ...whenParts(p?.remindAt, now)];
    return {
      actionType: "reminder",
      verb: "Set reminder",
      effect: parts.join(" · "),
      // Mirror the executor: any truthy remindAt is enough to fire; only a
      // missing time blocks with the single inline ask.
      needsField: p?.remindAt ? null : "remindAt",
      state: actionState,
    };
  }

  if (actionType === "meeting") {
    const p = actionPayload?.kind === "meeting" ? actionPayload : null;
    // Prefer resolved attendee emails; fall back to raw extracted names.
    const resolved = (p?.resolvedAttendees ?? [])
      .map((a) => a.email ?? a.name)
      .filter((x): x is string => !!x);
    const raw = p?.attendees ?? [];
    const who = resolved.length ? resolved : raw;
    const parts = [
      who.length ? `Invite ${who.join(", ")}` : null,
      ...whenParts(p?.start, now),
      fmtDuration(p?.durationMin ?? 30),
    ].filter((x): x is string => !!x);
    // Essential-field gate: missing time → ask start; missing people → ask attendees.
    const needsField: OfferNeedsField = !p?.start
      ? "start"
      : who.length === 0
        ? "attendees"
        : null;
    return {
      actionType: "meeting",
      verb: "Send invite",
      effect: parts.length ? parts.join(" · ") : `Book “${p?.title ?? todo.title}”`,
      needsField,
      state: actionState,
    };
  }

  // research
  const p = actionPayload?.kind === "research" ? actionPayload : null;
  const topic = p?.topic?.trim() || todo.title;
  return {
    actionType: "research",
    verb: "Research",
    effect: `Research: ${topic}`,
    needsField: null,
    state: actionState,
  };
}
