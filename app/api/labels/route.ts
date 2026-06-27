// GET /api/labels — list the owner's labels.
// POST /api/labels { name } — upsert a label by name (lowercased), return it with
// its id. Name→id surface for enrichment-applied labels + the filter-builder.
// Deterministic, no LLM.
import { currentUser } from "@/lib/auth";
import { store } from "@/lib/store";
import { badRequest, handleApiError, json, readJson } from "@/lib/http";

export async function GET(_req: Request): Promise<Response> {
  try {
    const user = await currentUser();
    const labels = await store.labels(user.userId);
    return json({ labels });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await currentUser();
    const { name } = await readJson<{ name?: string }>(req);
    if (!name || !name.trim()) throw badRequest("name is required");
    const label = await store.upsertLabelByName(user.userId, name);
    return json({ label });
  } catch (err) {
    return handleApiError(err);
  }
}
