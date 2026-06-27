// POST /api/contacts/resolve — opening a meeting offer: bulk-resolve the raw
// extracted attendee names into the Attendee disambiguation flow (resolved email
// vs unresolved-with-candidates). The UI keeps Send gated until every attendee is
// resolved; the executor enforces the same gate server-side. Read-only, not metered.
import { currentUser } from "@/lib/auth";
import { contactResolverFor, resolveAttendees } from "@/lib/contacts";
import { json, badRequest, handleApiError, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await currentUser();
    const { names } = await readJson<{ names?: unknown }>(req);
    if (!Array.isArray(names) || names.some((n) => typeof n !== "string")) {
      throw badRequest("names must be an array of strings");
    }

    const attendees = await resolveAttendees(contactResolverFor(user), names as string[]);
    return json({ attendees });
  } catch (err) {
    return handleApiError(err);
  }
}
