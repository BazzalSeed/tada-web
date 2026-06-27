// GET /api/captures — the user's captures (newest-first) for thumbnail hydration
// on load. A separate route from /api/todos keeps the frozen Todo contract clean;
// frontend's DataBootstrap fetches this to populate capturesById so a capture's
// image renders + survives reload (paired with always-persist-blobPath in runCapture).
import { currentUser } from "@/lib/auth";
import { store } from "@/lib/store";
import { json, handleApiError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET(_req: Request): Promise<Response> {
  try {
    const user = await currentUser();
    const captures = await store.listCaptures(user.userId);
    return json({ captures });
  } catch (err) {
    return handleApiError(err);
  }
}
