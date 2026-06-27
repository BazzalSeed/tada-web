// POST /api/chat — the text agent (AI SDK useChat endpoint). Gemini 2.5 Flash +
// the shared AgentTool registry: read tools auto-run, write tools are gated
// (human-in-the-loop approval before execute). Metered by withQuota(chatTurn).
// NO Claude/Anthropic.
import { streamText, convertToModelMessages, stepCountIs } from "ai";
import type { UIMessage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { currentUser } from "@/lib/auth";
import { withQuota } from "@/lib/quota";
import { toAiSdkTools } from "@/lib/agent-tools";
import { handleApiError, readJson } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

const SYSTEM = `You are Tada, a capture-first to-do assistant. Help the user manage their tasks. You can list/inspect todos and search contacts on your own. For write actions (create a todo, set a reminder, book a meeting, run research), CALL THE TOOL DIRECTLY when the user asks for it — the app then shows the user an Approve/Deny card before anything runs, so do NOT ask "shall I?" or request confirmation in your text reply first; just call the tool and let the card handle approval. Be concise. Never claim a write happened until it's approved and executed.`;

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await currentUser();
    const { messages } = await readJson<{ messages: UIMessage[] }>(req);

    const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

    // Reserve the chat turn up front; stream the model response with the tools.
    const result = await withQuota(user, "chatTurn", async () =>
      streamText({
        model: google("gemini-2.5-flash"),
        system: SYSTEM,
        messages: await convertToModelMessages(messages),
        tools: toAiSdkTools(user),
        stopWhen: stepCountIs(6),
      }),
    );
    return result.toUIMessageStreamResponse();
  } catch (err) {
    return handleApiError(err);
  }
}
