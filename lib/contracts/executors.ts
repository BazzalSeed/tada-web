// ============================================================================
// FROZEN v0 CONTRACT — "do it for me": dispatch on actionType.
// Each capability is ONE executor fn. The tap path calls it directly when the
// payload is complete; the agent calls the same fn as a GATED tool. Meetings &
// reminders are deterministic; research is the only agent loop (Gemini 2.5 Pro).
// Never auto-execute a side effect.
// ============================================================================

import type { ActionPayload, Attendee, Todo } from "./types";
import type { UserCtx } from "./auth";

export interface ExecResult {
  ok: boolean;
  actionExternalId?: string;
  error?: string;
  needsField?: string; // single missing essential field -> one inline ask
  needsDisambiguation?: Attendee[]; // unresolved attendees (each w/ candidates) -> OfferView picker; blocks Send
}

export interface Executors {
  // Google Calendar (events.insert + sendUpdates:'all') via the user's stored
  // refresh token — no Gmail (calendar.events scope only; avoids restricted scopes).
  sendMeetingInvite(
    p: Extract<ActionPayload, { kind: "meeting" }>,
    user: UserCtx,
  ): Promise<ExecResult>;
  // Deterministic reminder / local notification.
  setReminder(
    p: Extract<ActionPayload, { kind: "reminder" }>,
  ): Promise<ExecResult>;
  // Background agent loop; progress streamed; writes markdown into todo.detail.
  deepResearch(
    p: Extract<ActionPayload, { kind: "research" }>,
    onProgress?: (s: string) => void,
  ): Promise<{ markdown: string }>;
}

// Routes by todo.actionType to the matching executor (tap path).
// Impl lives in backend-owned lib/, typed against this alias.
export type FinishTodo = (
  todo: Todo,
  user: UserCtx,
  ex: Executors,
) => Promise<ExecResult>;
