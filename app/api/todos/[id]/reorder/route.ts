// POST /api/todos/:id/reorder — drag-reorder via fractional index.
// Body: { beforeId?, afterId? } — the neighbors the todo was dropped between.
import { currentUser } from "@/lib/auth";
import { store } from "@/lib/store";
import { handleApiError, json, readJson } from "@/lib/http";

type Ctx = { params: Promise<{ id: string }> };
type ReorderBody = { beforeId?: string | null; afterId?: string | null };

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await currentUser();
    const { id } = await ctx.params;
    const { beforeId, afterId } = await readJson<ReorderBody>(req);
    const todo = await store.reorderTodo(user.userId, id, beforeId, afterId);
    return json({ todo });
  } catch (err) {
    return handleApiError(err);
  }
}
