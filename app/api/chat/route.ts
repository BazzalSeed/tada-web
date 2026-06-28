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
- search_contacts — look up a saved contact's email (optional; booking resolves names itself).
Always read first to get a todo's id, then act on it.

Capturing actions (create_todo): when the user wants something DONE — book a meeting, set a reminder, run research — CREATE A TODO that carries that action; do NOT try to execute it yourself. Use create_todo's action field (type meeting/reminder/research). Creating the todo is safe and runs immediately; the app renders a "do it" button and the USER taps it to actually book/remind/research. So never say it's booked/done — say you've set it up and they can run it.
- Meeting: action.type "meeting", attendees as names (the app resolves them) or emails, start as the local time, optional durationMin/notes.
- Research: action.type "research" with the topic — its report writes into the todo's notes when run.
- Combined ("book a meeting with Hansen and research X as prep"): create ONE parent meeting todo, with a research SUBTASK (subtasks: [{ title, action: { type: "research", topic } }]). The research report lands in the parent's notes and feeds the invite. Don't make two separate top-level todos for one goal.

Mutations (complete/uncomplete/update a todo): these DO show an Approve/Deny card — first query_todos/list_todos for the id, then call the tool; don't confirm in text first.

Be concise. For anything actionable, create the todo and tell the user to tap to run it.`;

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
