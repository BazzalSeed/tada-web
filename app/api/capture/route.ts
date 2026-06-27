// POST /api/capture — image/text capture → capture-first → extract().
// Returns the created todos (the plain todo always; enriched/extra todos when
// extraction succeeds). Quota is metered inside the pipeline (extractTodos).
import { currentUser } from "@/lib/auth";
import { runCapture, type CaptureRequest } from "@/lib/capture";
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
    const result = await runCapture(user, body);
    return json(result, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
