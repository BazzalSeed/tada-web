import type {
  ContactCandidate,
  ExecResult,
  Priority,
  Todo,
} from "@/lib/contracts";

// A gated write the agent has PROPOSED but not run — built from the tool call's
// input args while it sits in `approval-requested`. Drives the OfferCard's
// concrete-effect preview + Approve/Deny (the never-auto-execute surface). One
// variant per gated tool (create_todo / set_reminder / send_meeting_invite /
// deep_research).
export type ProposedAction =
  | { kind: "todo"; title: string; dueAt?: string | null; priority?: Priority }
  | {
      kind: "meeting";
      title: string;
      attendees?: string[];
      start?: string | null;
      durationMin?: number;
      notes?: string | null;
    }
  | { kind: "reminder"; text: string; remindAt?: string | null }
  | { kind: "research"; topic: string }
  // --- gated mutates that mirror the UI (FIX9): complete / reopen / edit ---
  | { kind: "complete" }
  | { kind: "uncomplete" }
  | {
      kind: "edit";
      title?: string;
      dueAt?: string | null;
      priority?: Priority;
      labels?: string[];
    };

// Presentational contract for chat/voice generative-UI tiles. Two sources:
// (1) a tool's executed result `card` ({type, ...}) streamed back after it runs
// (read tools auto-run; gated writes run server-side only after approval), and
// (2) a client-built `pending` offer (from the paused tool input) / `denied`
// note. The tile components render purely from this union.
export type ChatCard =
  // --- executed results (from part.output.card) ---
  // A created todo + its action-bearing subtasks. When the todo (or a subtask)
  // carries an action, the tile renders inline gated do-it buttons (→ /finish).
  | { type: "todo"; todo: Todo; subtasks?: Todo[] }
  | { type: "todos"; todos: Todo[] }
  | { type: "contacts"; query: string; candidates: ContactCandidate[] }
  | { type: "offer"; kind: "reminder" | "meeting"; result: ExecResult }
  | {
      type: "research";
      topic?: string;
      markdown?: string | null;
      status?: "running" | "done";
    }
  // --- client-side gated-write states ---
  | { type: "pending"; toolName: string; action: ProposedAction }
  | { type: "denied"; toolName: string };
