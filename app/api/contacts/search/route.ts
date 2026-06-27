// POST /api/contacts/search — the per-attendee picker in the meeting offer. Free
// text -> ranked ContactCandidate[] from the user's Google contacts. Read-only,
// not metered. Backs both the chat search_contacts tool and the disambiguation UI.
import { currentUser } from "@/lib/auth";
import { contactResolverFor } from "@/lib/contacts";
import { json, badRequest, handleApiError, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await currentUser();
    const { query } = await readJson<{ query?: string }>(req);
    if (typeof query !== "string" || !query.trim()) throw badRequest("missing query");

    const candidates = await contactResolverFor(user).resolve(query);
    return json({ candidates });
  } catch (err) {
    return handleApiError(err);
  }
}
