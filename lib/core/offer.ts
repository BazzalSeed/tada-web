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

// Format an offset-less local ISO ("2026-07-01T14:00:00") for the effect line.
// Deterministic (no locale / timezone surprises); omits the clock when midnight.
function fmtWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso; // show raw rather than "NaN"
  const date = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  const h = d.getHours();
  const m = d.getMinutes();
  if (h === 0 && m === 0) return date;
  const ampm = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${date}, ${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function fmtDuration(min: number | null | undefined): string | null {
  if (!min || min <= 0) return null;
  if (min % 60 === 0) return `${min / 60}h`;
  if (min > 60) return `${Math.floor(min / 60)}h${min % 60}m`;
  return `${min}m`;
}

// Builds the offer preview for a todo, or null when there's nothing to offer
// (actionType none, or the action is already done / has no proposed state).
export function describeOffer(todo: Todo): OfferDescriptor | null {
  const { actionType, actionPayload, actionState } = todo;
  if (actionType === "none") return null;
  // Only surface an offer while it's actionable: proposed (armed) or blocked on
  // disambiguation, or a prior failure the user can retry. A done action shows no
  // tap (the row reflects actionState elsewhere).
  if (actionState === "done") return null;

  if (actionType === "reminder") {
    const p = actionPayload?.kind === "reminder" ? actionPayload : null;
    const when = fmtWhen(p?.remindAt);
    const text = p?.text?.trim() || todo.title;
    return {
      actionType: "reminder",
      verb: "Set reminder",
      effect: when ? `Remind: ${text} · ${when}` : `Remind: ${text}`,
      needsField: when ? null : "remindAt",
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
    const when = fmtWhen(p?.start);
    const dur = fmtDuration(p?.durationMin ?? 30);
    const parts = [
      who.length ? `Invite ${who.join(", ")}` : null,
      when,
      dur,
    ].filter((x): x is string => !!x);
    // Essential-field gate: missing time → ask start; missing people → ask attendees.
    const needsField: OfferNeedsField = !when
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
