// FIX2 — "do it for me" offer model (the spec's headline differentiator #2).
// Pure helpers shared by the detail-pane OfferPanel and the row offer chip:
//  • offerEffect(todo) → the CONCRETE effect shown before the tap (the tap is the
//    confirmation — never auto-execute).
//  • reflectFinish(todo, res) → the local Todo patch mirroring what the finish
//    route already persisted server-side (applyFinishResult + research), so the UI
//    updates without a refetch.

import type { ActionPayload, Todo } from "@/lib/contracts";
import type { FinishResponse } from "./api";
import { formatDue } from "./format";

export interface OfferEffect {
  eyebrow: string; // "Send meeting invite"
  title: string; // the concrete subject
  lines: string[]; // when · duration · who
  cta: string; // the do-it button label
}

// Format an ISO date for the effect; pass natural phrases through verbatim (the
// extractor mostly emits ISO, but a stray "6pm today" must never become NaN).
function whenLabel(iso: string | null | undefined, now: Date): string | null {
  if (!iso) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? formatDue(iso, now).label : iso;
}

// True when the todo carries an actionable, not-yet-done offer.
export function hasOffer(todo: Todo): boolean {
  return todo.actionType !== "none" && todo.actionState !== "done";
}

// Describe the concrete effect of finishing this todo. Returns null for `none`.
export function offerEffect(todo: Todo, now: Date): OfferEffect | null {
  const p = todo.actionPayload;
  switch (todo.actionType) {
    case "meeting": {
      const m = p?.kind === "meeting" ? p : null;
      const when = whenLabel(m?.start, now);
      const who =
        m?.resolvedAttendees
          ?.map((a) => a.email ?? a.name)
          .filter(Boolean)
          .join(", ") ||
        (m?.attendees ?? []).join(", ");
      const lines: string[] = [];
      const dur = m?.durationMin ?? 30;
      lines.push([when ?? "time TBD", `${dur} min`].join(" · "));
      if (who) lines.push(`with ${who}`);
      return {
        eyebrow: "Send meeting invite",
        title: m?.title ?? todo.title,
        lines,
        cta: "Send invite",
      };
    }
    case "reminder": {
      const r = p?.kind === "reminder" ? p : null;
      const when = whenLabel(r?.remindAt, now);
      return {
        eyebrow: "Set reminder",
        title: r?.text ?? todo.title,
        lines: when ? [when] : [],
        cta: "Set reminder",
      };
    }
    case "research": {
      const r = p?.kind === "research" ? p : null;
      return {
        eyebrow: "Run deep research",
        title: r?.topic ?? todo.title,
        lines: ["Writes a report into this todo's notes"],
        cta: "Run research",
      };
    }
    default:
      return null;
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
    const actionPayload: ActionPayload | null | undefined =
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
