// POST /api/enrich — async quick-add enrichment (T2.5). The add-card already
// created the plain todo via POST /api/todos; this returns AI SUGGESTIONS
// (offers/labels/dates/priority) for the UI to fold into pills. Non-mutating —
// the client applies accepted suggestions via PATCH. Metered as extractTodos.
import { currentUser } from "@/lib/auth";
import { runEnrich } from "@/lib/enrich";
import { badRequest, handleApiError, json, readJson } from "@/lib/http";

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await currentUser();
    const { text } = await readJson<{ text?: string }>(req);
    const trimmed = (text ?? "").trim();
    if (!trimmed) throw badRequest("text is required");
    const result = await runEnrich(user, trimmed);
    return json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
