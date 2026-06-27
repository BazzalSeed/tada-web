// POST /api/chat — the text agent (AI SDK useChat endpoint). Gemini 2.5 Flash +
// the shared AgentTool registry: read tools auto-run, write tools are gated
// (human-in-the-loop approval before execute). Metered by withQuota(chatTurn).
//
// Persistence + memory: the conversation lives in Postgres (lib/chat/store), and
// the model receives only a bounded slice each turn — the rolling summary plus a
// pruned recent window (lib/chat/context). After the turn streams, we persist the
// new messages and fold older ones into the summary if needed (lib/chat/compact).
// Stateless compute, DB is the source of truth. NO Claude/Anthropic.
import { streamText, stepCountIs, generateId } from "ai";
import type { UIMessage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { currentUser } from "@/lib/auth";
import { withQuota } from "@/lib/quota";
import { toAiSdkTools } from "@/lib/agent-tools";
import { handleApiError, readJson, badRequest, json } from "@/lib/http";
import {
  buildModelMessages,
  composeSystem,
  messagesAfterWatermark,
} from "@/lib/chat/context";
import {
  getOrCreateConversation,
  loadLatestConversation,
  persistMessages,
} from "@/lib/chat/store";
import { compactIfNeeded } from "@/lib/chat/compact";

export const runtime = "nodejs";
export const maxDuration = 60;

// GET /api/chat — what the chat window loads on mount: the user's most recent
// conversation (id + full message history for display), or a fresh id with an
// empty thread when they've never chatted. The row itself is created lazily on
// the first POST, so a minted id costs nothing until used.
export async function GET(): Promise<Response> {
  try {
    const user = await currentUser();
    const latest = await loadLatestConversation(user.userId);
    if (latest) {
      return json({
        conversationId: latest.id,
        messages: latest.messages,
        summaryThroughId: latest.summaryThroughId,
      });
    }
    return json({ conversationId: crypto.randomUUID(), messages: [], summaryThroughId: null });
  } catch (err) {
    return handleApiError(err);
  }
}

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
    const { messages, conversationId } = await readJson<{
      messages: UIMessage[];
      conversationId?: string;
    }>(req);

    if (typeof conversationId !== "string" || !conversationId) {
      throw badRequest("conversationId is required");
    }

    // Ownership check + compaction state in one query.
    const meta = await getOrCreateConversation(user.userId, conversationId);

    // The model sees only the live window (after the summary watermark), pruned;
    // the rolling summary rides in the system instruction, never as a message.
    const live = messagesAfterWatermark(messages, meta.summaryThroughId);
    const modelMessages = await buildModelMessages(live);

    const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });

    // Reserve the chat turn up front; stream the model response with the tools.
    const result = await withQuota(user, "chatTurn", async () =>
      streamText({
        model: google("gemini-2.5-flash"),
        system: composeSystem(SYSTEM, meta.summary),
        messages: modelMessages,
        tools: toAiSdkTools(user),
        stopWhen: stepCountIs(6),
      }),
    );

    return result.toUIMessageStreamResponse({
      originalMessages: messages,
      // The assistant reply needs a stable id to persist by. toUIMessageStream
      // only auto-assigns one when the last original message is an assistant
      // message — ours is always the user's turn, so without this the response
      // gets an empty id and successive replies collide onto one row (and the
      // compaction watermark lands on "").
      generateMessageId: generateId,
      onEnd: async ({ messages: finalMessages }) => {
        // Persist the completed turn, then fold older messages into the summary
        // if the live window has grown past the trigger. Off the user's path.
        await persistMessages(conversationId, finalMessages);
        await compactIfNeeded({
          conversationId,
          summary: meta.summary,
          summaryThroughId: meta.summaryThroughId,
          messages: finalMessages,
        });
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
