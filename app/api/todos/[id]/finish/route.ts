// POST /api/todos/:id/finish — the "do it for me" tap path. Dispatches on
// actionType: meeting/reminder via finishTodo (deterministic), research via the
// research runner. NEVER auto-executes — fires only on this explicit POST.
// Returns the ExecResult (incl. needsField for a single inline ask).
import { currentUser } from "@/lib/auth";
import { store } from "@/lib/store";
import { executors } from "@/lib/executors";
import { finishTodo, applyFinishResult } from "@/lib/finish";
import { runResearch } from "@/lib/research";
import { handleApiError, json } from "@/lib/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await currentUser();
    const { id } = await ctx.params;
    const todo = (await store.listTodos(user.userId)).find((t) => t.id === id);
    if (!todo) return json({ error: "todo not found" }, 404);

    // Idempotency: a finished action never re-runs (no duplicate calendar event /
    // research run on a double-tap). Return the already-done outcome as-is.
    if (todo.actionState === "done") {
      return json({
        ok: true,
        actionExternalId: todo.actionExternalId ?? undefined,
        markdown: todo.actionType === "research" ? (todo.detail ?? undefined) : undefined,
        alreadyDone: true,
      });
    }

    if (todo.actionType === "research") {
      const r = await runResearch(todo, user);
      return json(r);
    }

    const result = await finishTodo(todo, user, executors);
    await applyFinishResult(store, user, todo, result);
    return json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
