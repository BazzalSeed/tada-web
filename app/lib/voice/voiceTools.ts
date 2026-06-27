// Pure helpers for the voice tool loop — kept framework-free + side-effect-free so
// the gating logic (the never-auto-execute-by-voice invariant) is unit-testable
// without WebRTC. The session (realtimeVoice.ts) orchestrates; these decide.

import type { ChatCard, ProposedAction } from "@/app/components/chat/cards";
import type { Priority } from "@/lib/contracts";

// The Realtime model emits a function call with `arguments` as a JSON *string*.
// Our /api/voice/tool route reads `{ name, args, approved }` — so we parse the
// string into `args` and POST that. A malformed arguments string → {}.
export interface VoiceToolRequest {
  name: string;
  args: unknown;
  call_id?: string;
}

export function buildToolRequest(call: {
  name: string;
  arguments: string;
  call_id?: string;
}): VoiceToolRequest {
  let args: unknown = {};
  try {
    args = call.arguments ? JSON.parse(call.arguments) : {};
  } catch {
    args = {};
  }
  return { name: call.name, args, call_id: call.call_id };
}

// What /api/voice/tool returns. Gated writes (pre-approval) come back as
// approval_required with the args echoed; everything else is an executed result.
export interface VoiceToolResponse {
  status?: "ok" | "approval_required" | string;
  name?: string;
  args?: unknown;
  output?: unknown;
  card?: ChatCard | null;
  call_id?: string | null;
}

export type ToolOutcome =
  | { kind: "approval"; name: string; args: unknown }
  | { kind: "result"; output: string; card: ChatCard | null };

// Interpret the bridge response: a gated write awaiting approval → surface a
// confirm (NOTHING executes yet); anything else → an executed result to feed
// back to the model. `output` is coerced to a string (the Realtime
// function_call_output requires one).
export function interpretToolResponse(resp: VoiceToolResponse): ToolOutcome {
  if (resp.status === "approval_required") {
    return { kind: "approval", name: resp.name ?? "", args: resp.args ?? {} };
  }
  const output =
    typeof resp.output === "string"
      ? resp.output
      : JSON.stringify({ status: "error", reason: "tool unavailable" });
  return { kind: "result", output, card: resp.card ?? null };
}

// The function_call_output payload sent back over the data channel when the user
// DENIES a gated write — nothing ran; the model acknowledges and moves on.
export const DENIED_OUTPUT = JSON.stringify({
  status: "declined",
  reason: "The user declined this action, so nothing was done.",
});

const PRIORITIES = new Set<Priority>(["none", "p1", "p2", "p3"]);
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

// Map a gated voice tool's echoed args → the proposed action shown in the
// VoiceStage confirm card (reuses the chat OfferCard). One per gated tool.
export function proposedActionFromCall(name: string, args: unknown): ProposedAction | null {
  const a = (args ?? {}) as Record<string, unknown>;
  if (name === "create_todo") {
    const p = str(a.priority);
    return {
      kind: "todo",
      title: str(a.title) ?? "New todo",
      dueAt: str(a.dueAt) ?? null,
      priority: p && PRIORITIES.has(p as Priority) ? (p as Priority) : undefined,
    };
  }
  if (name === "send_meeting_invite") {
    return {
      kind: "meeting",
      title: str(a.title) ?? "New meeting",
      attendees: Array.isArray(a.attendees) ? (a.attendees.filter((x) => typeof x === "string") as string[]) : [],
      start: str(a.start) ?? null,
      durationMin: typeof a.durationMin === "number" ? a.durationMin : 30,
      notes: str(a.notes) ?? null,
    };
  }
  if (name === "set_reminder") {
    return { kind: "reminder", text: str(a.text) ?? "Reminder", remindAt: str(a.remindAt) ?? null };
  }
  if (name === "deep_research") {
    return { kind: "research", topic: str(a.topic) ?? "Research" };
  }
  return null;
}
