// PATCH /api/todos/:id — partial update (deterministic, no LLM). Body is a
// Partial<Todo> patch; ownership is enforced in the store (404 if not the owner's).
import { currentUser } from "@/lib/auth";
import type { Todo } from "@/lib/contracts";
import { store } from "@/lib/store";
import { handleApiError, json, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await currentUser();
    const { id } = await ctx.params;
    const patch = await readJson<Partial<Todo>>(req);
    const todo = await store.updateTodo(user.userId, id, patch);
    return json({ todo });
  } catch (err) {
    return handleApiError(err);
  }
}
