// ============================================================================
// T3.2 — "finish the todo": dispatch on actionType (the tap path). One dispatch
// point; meetings + reminders run through the deterministic executors. Research
// is the only agent loop and runs via /api/research (see lib/research.ts), so
// finishTodo guards it. NEVER auto-executes — only runs when explicitly called,
// and surfaces needsField for a single inline ask (state untouched until resolved).
// ============================================================================

import type {
  ExecResult,
  Executors,
  FinishTodo,
  TadaStore,
  Todo,
  UserCtx,
} from "./contracts";

export const finishTodo: FinishTodo = async (todo, user, ex: Executors) => {
  switch (todo.actionType) {
    case "reminder":
      if (todo.actionPayload?.kind !== "reminder")
        return { ok: false, error: "missing reminder details" };
      return ex.setReminder(todo.actionPayload);
    case "meeting":
      if (todo.actionPayload?.kind !== "meeting")
        return { ok: false, error: "missing meeting details" };
      return ex.sendMeetingInvite(todo.actionPayload, user);
    case "research":
      // Research is long-running; the finish route delegates to runResearch.
      return { ok: false, error: "research runs via /api/research" };
    default:
      return { ok: false, error: "no action to finish" };
  }
};

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
  if (result.ok) {
    await store.updateTodo(user.userId, todo.id, {
      actionState: "done",
      actionExternalId: result.actionExternalId ?? null,
    });
  } else {
    await store.updateTodo(user.userId, todo.id, { actionState: "failed" });
  }
}
