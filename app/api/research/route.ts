// POST /api/research { todoId } — start a deep-research job for a research todo.
// Runs under withQuota(deepResearch); writes the Markdown into todo.detail. v0 is
// synchronous (awaits the report); GET /api/research/:id polls status/result.
import { currentUser } from "@/lib/auth";
import { store } from "@/lib/store";
import { runResearch } from "@/lib/research";
import { badRequest, handleApiError, json, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await currentUser();
    const { todoId } = await readJson<{ todoId?: string }>(req);
    if (!todoId) throw badRequest("todoId is required");
    const todo = (await store.listTodos(user.userId)).find((t) => t.id === todoId);
    if (!todo) return json({ error: "todo not found" }, 404);
    if (todo.actionType !== "research") {
      throw badRequest("todo is not a research action");
    }
    const result = await runResearch(todo, user);
    return json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
