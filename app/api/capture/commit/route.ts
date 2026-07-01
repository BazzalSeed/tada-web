// POST /api/capture/commit — create the user-approved todos against a prior
// capture (see /api/capture/propose). Returns the created todos.
import { currentUser } from "@/lib/auth";
import { commitCapture, type CommitRequest } from "@/lib/capture";
import { badRequest, handleApiError, json, readJson } from "@/lib/http";

function isValid(b: CommitRequest): boolean {
  return !!b.captureId && Array.isArray(b.todos) && b.todos.length > 0;
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await currentUser();
    const body = await readJson<CommitRequest>(req);
    if (!isValid(body)) {
      throw badRequest("commit requires captureId and a non-empty todos[]");
    }
    const result = await commitCapture(user, body);
    return json(result, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
