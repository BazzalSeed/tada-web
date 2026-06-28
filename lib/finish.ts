// ============================================================================
// T3.2 — "finish the todo": dispatch on actionType (the tap path). One dispatch
// point; meetings + reminders run through the deterministic executors. Research
// is the only agent loop and runs via /api/research (see lib/research.ts), so
// finishTodo guards it. NEVER auto-executes — only runs when explicitly called,
// and surfaces needsField for a single inline ask (state untouched until resolved).
//
// Meetings: raw attendee names are resolved against the user's contacts on the
// first attempt — a unique match books straight through; an ambiguous/zero match
// returns real candidates so the picker works (never auto-picks among matches).
// A finished SUBTASK reports its result up to the parent goal's notes.
// ============================================================================

import { contactResolverFor, resolveAttendees } from "./contacts";
import type {
  Attendee,
  ExecResult,
  Executors,
  TadaStore,
  Todo,
  UserCtx,
} from "./contracts";

type ResolveAttendeesFn = (names: string[]) => Promise<Attendee[]>;

export async function finishTodo(
  todo: Todo,
  user: UserCtx,
  ex: Executors,
  // Injectable for tests; defaults to the real Google contact resolver.
  resolve: ResolveAttendeesFn = (names) =>
    resolveAttendees(contactResolverFor(user), names),
): Promise<ExecResult> {
  switch (todo.actionType) {
    case "reminder":
      if (todo.actionPayload?.kind !== "reminder")
        return { ok: false, error: "missing reminder details" };
      return ex.setReminder(todo.actionPayload);
    case "meeting": {
      const p = todo.actionPayload;
      if (p?.kind !== "meeting")
        return { ok: false, error: "missing meeting details" };
      // The invite description is the MEETING's own context (the agent-set notes),
      // never the goal's notes — we deliberately don't leak prep research to
      // attendees, and booking never blocks on research finishing.
      const withNotes = { ...p, notes: p.notes ?? null };
      // First attempt with raw names → resolve to candidates. Unique resolves &
      // books; ambiguous/zero parks for the picker (applyFinishResult persists
      // the candidates onto the payload).
      if (!p.resolvedAttendees?.length && (p.attendees?.length ?? 0) > 0) {
        const resolved = await resolve(p.attendees!);
        const unresolved = resolved.filter(
          (a) => a.status !== "resolved" || !a.email,
        );
        if (unresolved.length) return { ok: false, needsDisambiguation: resolved };
        return ex.sendMeetingInvite({ ...withNotes, resolvedAttendees: resolved }, user);
      }
      return ex.sendMeetingInvite(withNotes, user);
    }
    case "research":
      // Research is long-running; the finish route delegates to runResearch.
      return { ok: false, error: "research runs via /api/research" };
    default:
      return { ok: false, error: "no action to finish" };
  }
}

// Append a line to a todo's notes (detail), preserving what's already there.
// Used to report a finished subtask's outcome up to its parent goal.
async function appendNote(
  store: TadaStore,
  userId: string,
  todoId: string,
  line: string,
): Promise<void> {
  const target = (await store.listTodos(userId)).find((t) => t.id === todoId);
  if (!target) return;
  const detail = target.detail ? `${target.detail}\n\n${line}` : line;
  await store.updateTodo(userId, todoId, { detail });
}

// A one-line confirmation appended to the parent's notes when a deterministic
// action-subtask finishes (research writes its own markdown via runResearch).
function resultLine(todo: Todo, result: ExecResult): string | null {
  if (todo.actionType === "meeting")
    return `📅 Meeting booked${result.actionExternalId ? ` (event ${result.actionExternalId})` : ""}.`;
  if (todo.actionType === "reminder") return "⏰ Reminder set.";
  return null;
}

// Persists the outcome on the todo. needsField → leave state untouched (the UI
// shows a single inline ask). ok → actionState 'done' + external id. else 'failed'
// (status stays open — finishing an action ≠ completing the todo, native parity).
export async function applyFinishResult(
  store: TadaStore,
  user: UserCtx,
  todo: Todo,
  result: ExecResult,
): Promise<void> {
  if (result.needsField) return;
  // Unresolved attendees → park the todo for the OfferView picker, persisting
  // the candidates onto the meeting payload. No send (never-auto-execute).
  if (result.needsDisambiguation) {
    const actionPayload =
      todo.actionPayload?.kind === "meeting"
        ? { ...todo.actionPayload, resolvedAttendees: result.needsDisambiguation }
        : todo.actionPayload;
    await store.updateTodo(user.userId, todo.id, {
      actionState: "needs_disambiguation",
      actionPayload,
    });
    return;
  }
  if (result.ok) {
    await store.updateTodo(user.userId, todo.id, {
      actionState: "done",
      actionExternalId: result.actionExternalId ?? null,
    });
    // A finished subtask reports its outcome up to the parent goal's notes.
    if (todo.parentId) {
      const line = resultLine(todo, result);
      if (line) await appendNote(store, user.userId, todo.parentId, line);
    }
  } else {
    await store.updateTodo(user.userId, todo.id, { actionState: "failed" });
  }
}
