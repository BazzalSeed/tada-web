// DELETE /api/labels/:id — remove a label and strip it from all tagged todos
// (single atomic transaction; ownership-scoped).
import { currentUser } from "@/lib/auth";
import { store } from "@/lib/store";
import { handleApiError, json } from "@/lib/http";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const user = await currentUser();
    const { id } = await params;
    await store.deleteLabel(user.userId, id);
    return json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
