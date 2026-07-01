// POST /api/capture/propose — capture-first extract WITHOUT persisting todos.
// Returns proposals for the user to review before commit (see /api/capture/commit).
import { currentUser } from "@/lib/auth";
import { proposeCapture, type CaptureRequest } from "@/lib/capture";
import { badRequest, handleApiError, json, readJson } from "@/lib/http";

function hasContent(b: CaptureRequest): boolean {
  return !!(b.text?.trim() || b.note?.trim() || b.image || b.blobPath || b.email);
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await currentUser();
    const body = await readJson<CaptureRequest>(req);
    if (!hasContent(body)) {
      throw badRequest("capture requires text, image, note, blobPath, or email");
    }
    const result = await proposeCapture(user, body);
    return json(result, 200);
  } catch (err) {
    return handleApiError(err);
  }
}
