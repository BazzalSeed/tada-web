// POST /api/voice/tool — the voice model's tool-calls land here. Routes through
// the SAME shared AgentTool registry as text chat. Read tools run immediately;
// GATED writes are withheld (status:"approval_required") until the client sends
// approved:true — server-side enforcement of "never auto-execute a side effect".
import { currentUser } from "@/lib/auth";
import { agentTools, runApprovedTool } from "@/lib/agent-tools";
import { json, HttpError, badRequest, handleApiError, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await currentUser();
    const { name, args, approved } = await readJson<{ name?: string; args?: unknown; approved?: boolean }>(req);

    if (!name) throw badRequest("missing tool name");
    const t = agentTools[name];
    if (!t) throw new HttpError(404, `unknown tool: ${name}`);

    // The OpenAI Realtime event delivers function arguments as a JSON *string* —
    // tolerate that (parse to an object) as well as a pre-parsed object.
    let argsObj: unknown = args ?? {};
    if (typeof args === "string") {
      try {
        argsObj = JSON.parse(args);
      } catch {
        throw badRequest("args must be a JSON object or valid JSON string");
      }
    }

    // Gated writes require an explicit approval before any side effect fires.
    if (t.gated && !approved) {
      return json({ status: "approval_required", name, args: argsObj });
    }

    const result = await runApprovedTool(name, argsObj, user);
    return json({ status: "ok", ...result });
  } catch (err) {
    return handleApiError(err);
  }
}
