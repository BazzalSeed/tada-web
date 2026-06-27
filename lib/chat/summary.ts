// Layer-2 compaction — the rolling summary fold. When the messages older than
// the recent tail exceed SUMMARY_TRIGGER_TOKENS (see context.ts), this folds the
// PREVIOUS summary plus the slice being evicted into one updated summary with a
// single Gemini Flash call. Recursive (new = fold(old, evicted)) so it never
// re-reads the whole history — cost stays bounded.
//
// Runs in /api/chat's onFinish, off the user's critical path. On failure the
// caller leaves the watermark where it is and retries next turn; since the
// trigger (66k) is far under Flash's ~1M window, not summarizing is always safe.
import { generateText, type UIMessage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

const MODEL = "gemini-2.5-flash";

const SYSTEM = `You maintain a running summary of a conversation between a user and Tada, a capture-first to-do assistant that can act on the user's todos via tools.

Fold the EARLIER SUMMARY and the NEW MESSAGES into a single updated summary that future turns can rely on.

Preserve: the user's goals and any in-progress request, decisions made, unresolved threads, and the people / emails / dates / titles tied to pending actions (e.g. a meeting being booked), plus any stated preferences.
Omit: todo contents the assistant can re-fetch with its tools, pleasantries, and resolved one-off questions.

Write in third person ("The user ..."). Be concise — a few short paragraphs at most. Output only the summary text, no preamble.`;

// Flatten a UIMessage to plain text for the summary prompt: its text parts, plus
// a terse note of any tool calls so in-flight actions survive into the summary.
function renderMessage(m: UIMessage): string {
  const chunks: string[] = [];
  for (const part of m.parts) {
    if (part.type === "text") {
      chunks.push(part.text);
    } else if (typeof part.type === "string" && part.type.startsWith("tool-")) {
      chunks.push(`[${part.type.slice("tool-".length)}]`);
    }
  }
  const body = chunks.join(" ").trim();
  return body ? `${m.role}: ${body}` : "";
}

export function renderMessagesForSummary(messages: UIMessage[]): string {
  return messages.map(renderMessage).filter(Boolean).join("\n");
}

// Produce the updated rolling summary. `previousSummary` is null on first fold.
export async function summarizeOlder({
  previousSummary,
  olderMessages,
  apiKey = process.env.GEMINI_API_KEY,
}: {
  previousSummary: string | null | undefined;
  olderMessages: UIMessage[];
  apiKey?: string;
}): Promise<string> {
  const google = createGoogleGenerativeAI({ apiKey });
  const prompt = `EARLIER SUMMARY:\n${previousSummary?.trim() || "(none)"}\n\nNEW MESSAGES:\n${renderMessagesForSummary(olderMessages)}`;
  const { text } = await generateText({
    model: google(MODEL),
    system: SYSTEM,
    prompt,
  });
  return text.trim();
}
