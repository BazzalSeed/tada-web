// ============================================================================
// FROZEN v0 CONTRACT — core domain enums + data model.
// Ported 1:1 from native Tada (prep/native-flow-contract-reference.md) with the
// web settlements baked in (prep/proposed-contracts.md). DO NOT change a frozen
// signature without the Architect's sign-off — build lanes consume these.
//
// Wire keys are snake_case (Prisma @map); these TS fields are camelCase.
// Dates are ISO8601 strings; offset-less local timestamps preserve native semantics.
// ============================================================================

// ---- Enums (string unions; stored as String columns, see prisma/schema.prisma) ----
export type TodoStatus = "open" | "done" | "dismissed";
export type Priority = "none" | "p1" | "p2" | "p3"; // p4 == none (native parity)
export type ActionType = "none" | "meeting" | "reminder" | "research";
export type ActionState =
  | "none"
  | "proposed"
  | "done"
  | "failed"
  | "needs_disambiguation";
export type DateWindow = "any" | "today" | "overdue" | "next7" | "noDate";
export type RecurFreq = "daily" | "weekly" | "monthly" | "yearly";
export type CaptureKind = "image" | "text" | "file" | "email";

// Priority ordering for threshold filtering (higher rank == more urgent).
export const PRIORITY_RANK: Record<Priority, number> = {
  none: 0,
  p3: 1,
  p2: 2,
  p1: 3,
};

export interface RecurrenceRule {
  frequency: RecurFreq;
  interval?: number; // every N units; default 1, clamped >= 1
  weekday?: number; // 1=Sun .. 7=Sat (weekly anchoring)
}

// ---- Contact resolution (meeting attendee disambiguation) ----
export interface ContactCandidate {
  name: string;
  email: string;
  org?: string;
  photoUrl?: string;
  rank?: number; // higher == better match
}

// A meeting attendee progressing unresolved(name) -> resolved(email).
export interface Attendee {
  name?: string;
  email?: string;
  status: "unresolved" | "resolved";
  candidates?: ContactCandidate[]; // per-attendee picks while disambiguating
}

// Tagged union; the wire form is a bare object named by actionType.
export type ActionPayload =
  | {
      kind: "meeting";
      title: string;
      attendees?: string[] | null; // raw extracted names (extractor emits this)
      resolvedAttendees?: Attendee[] | null; // disambiguation flow; Send gated until all resolved
      start?: string | null; // ISO8601 local, offset-less
      durationMin?: number; // default 30
      notes?: string | null;
    }
  | { kind: "reminder"; text: string; remindAt?: string | null }
  | { kind: "research"; topic: string };

export interface Todo {
  id: string;
  createdAt: string; // ISO8601, offset-less local
  sourceCaptureId: string;
  title: string; // imperative, <= ~8 words
  detail?: string | null; // markdown (research writes here)
  status: TodoStatus;
  actionType: ActionType;
  actionPayload?: ActionPayload | null;
  actionState: ActionState;
  actionExternalId?: string | null; // calendar event id / message id once executed
  dueAt?: string | null;
  sortIndex: number; // fractional; lower sorts higher; default -createdAt epoch
  priority: Priority;
  listId?: string | null; // null == Inbox/All
  labelIds: string[];
  recurrence?: RecurrenceRule | null;
  parentId?: string | null; // one-level subtasks
  reminderAt?: string | null; // local notification time (distinct from dueAt)
}

export interface Capture {
  id: string;
  createdAt: string;
  kind: CaptureKind;
  blobPath?: string | null;
  note?: string | null;
}

export interface TodoLabel {
  id: string;
  name: string; // lowercased
  colorHex: string;
}

export interface FilterCriteria {
  labelIds: string[]; // ANY-of
  minPriority?: Priority | null; // rank threshold
  dateWindow: DateWindow;
  includeCompleted: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  colorHex: string;
  icon: string;
  sortIndex: number;
  criteria: FilterCriteria;
}

export type ViewSelection =
  | { kind: "all" }
  | { kind: "today" }
  | { kind: "project"; id: string }
  | { kind: "label"; id: string };
