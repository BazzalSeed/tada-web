// GET /api/research/:id — poll a research todo's status + result. id = todo id.
// Returns the actionState (none|proposed|done|failed) and the Markdown report
// once written into todo.detail.
import { currentUser } from "@/lib/auth";
import { store } from "@/lib/store";
import { handleApiError, json } from "@/lib/http";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx): Promise<Response> {
  try {
    const user = await currentUser();
    const { id } = await ctx.params;
    const todo = (await store.listTodos(user.userId)).find((t) => t.id === id);
    if (!todo) return json({ error: "todo not found" }, 404);
    return json({
      status: todo.actionState,
      markdown: todo.detail ?? null,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
