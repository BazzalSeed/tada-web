// POST /api/voice/usage — token accounting for a voice turn. The browser reports
// Realtime usage as turns complete; we meter each turn against the plan via
// withQuota(chatTurn) (unlimited plans pass through; exhausted plans get 402).
import { currentUser } from "@/lib/auth";
import { withQuota } from "@/lib/quota";
import { json, handleApiError, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await currentUser();
    const usage = await readJson<{ inputTokens?: number; outputTokens?: number }>(req).catch(() => ({}));

    // Reserve one turn's credit. Throws QuotaError (-> 402) when the plan is spent.
    await withQuota(user, "chatTurn", async () => true);

    return json({ status: "ok", recorded: usage });
  } catch (err) {
    return handleApiError(err);
  }
}
