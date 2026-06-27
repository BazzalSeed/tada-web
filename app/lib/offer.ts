// FIX2/FIX11 — "do it for me" offer (the spec's headline differentiator #2).
// The CONCRETE effect + the never-auto-execute gate come from ONE source of
// truth: the pure `describeOffer(todo)` in @/lib/core, shared by frontend and
// backend so the preview text and the executed effect can't drift (and so the FE
// can't arm a tap the executor would reject — e.g. a meeting with no attendees).
// This module is a thin PRESENTATION adapter (eyebrow label + done confirmation)
// plus reflectFinish (mirroring the server-persisted outcome locally).

import type { ActionState, Todo } from "@/lib/contracts";
import { describeOffer, type OfferNeedsField } from "@/lib/core";
import type { FinishResponse } from "./api";

export interface OfferEffect {
  eyebrow: string; // header label, e.g. "Send meeting invite"
  lines: string[]; // the canonical concrete-effect line(s) from describeOffer
  cta: string; // the do-it button label (describeOffer.verb)
  needsField: OfferNeedsField; // single inline ask (start|attendees|remindAt|null)
  state: ActionState;
}

const EYEBROW: Record<"meeting" | "reminder" | "research", string> = {
  meeting: "Send meeting invite",
  reminder: "Set reminder",
  research: "Run deep research",
};

// The concrete subject shown as the offer heading (presentation only).
export function offerSubject(todo: Todo): string {
  const p = todo.actionPayload;
  if (p?.kind === "meeting") return p.title || todo.title;
  if (p?.kind === "reminder") return p.text || todo.title;
  if (p?.kind === "research") return p.topic || todo.title;
  return todo.title;
}

// True when the todo carries an actionable, not-yet-done offer.
export function hasOffer(todo: Todo): boolean {
  return describeOffer(todo) != null;
}

// Presentation adapter over describeOffer — the single source of truth for what
// the tap will do. Returns null when there's nothing to offer (none / done).
export function offerEffect(todo: Todo): OfferEffect | null {
  const d = describeOffer(todo);
  if (!d) return null;
  return {
    eyebrow: EYEBROW[d.actionType],
    lines: [d.effect],
    cta: d.verb,
    needsField: d.needsField,
    state: d.state,
  };
}

// Calm executed-confirmation copy for an already-finished action.
export function doneEyebrow(todo: Todo): string {
  switch (todo.actionType) {
    case "meeting":
      return "Invite sent";
    case "reminder":
      return "Reminder set";
    case "research":
      return "Research written into notes";
    default:
      return "Done";
  }
}

// Mirror the server-persisted outcome onto the local todo (no refetch). Returns
// null when nothing should change yet (needsField → the UI shows a single ask
// and the action state is intentionally left untouched).
export function reflectFinish(
  todo: Todo,
  res: FinishResponse,
): Partial<Todo> | null {
  if (res.needsField) return null;
  if (res.needsDisambiguation) {
    const actionPayload =
      todo.actionPayload?.kind === "meeting"
        ? { ...todo.actionPayload, resolvedAttendees: res.needsDisambiguation }
        : todo.actionPayload;
    return { actionState: "needs_disambiguation", actionPayload };
  }
  if (res.ok) {
    if (todo.actionType === "research") {
      return {
        actionState: "done",
        actionExternalId: "research",
        detail: res.markdown ?? todo.detail,
      };
    }
    return { actionState: "done", actionExternalId: res.actionExternalId ?? null };
  }
  return { actionState: "failed" };
}
