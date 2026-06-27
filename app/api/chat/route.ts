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

const SYSTEM = `You are Tada, a capture-first to-do assistant. You can do anything the app's UI can do across the user's todos.

Reading (run these yourself, no approval needed):
- query_todos — answer "what's due today / this week / overdue", filter by label/priority/status, or text-search. It mirrors the app's Views exactly (same filter engine). Prefer it over list_todos for any specific question; use list_todos only for an unfiltered dump.
- search_contacts — find an attendee's email for a meeting.
Always read first to get a todo's id, then act on it.

Writing (create/complete/uncomplete/update a todo, set a reminder, book a meeting, run research): CALL THE TOOL DIRECTLY when the user asks — the app shows an Approve/Deny card before anything runs, so do NOT ask "shall I?" or confirm in text first; just call the tool and let the card gate it. To complete/reopen/edit a todo, first query_todos (or list_todos) to get its id, then call complete_todo / uncomplete_todo / update_todo with that id.

Be concise. Never claim a write happened until it's approved and executed.`;

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
