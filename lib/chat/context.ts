// Chat context management — the pure, deterministic seam between the persisted
// conversation (every raw message, in Postgres) and what the model actually
// receives each turn (a bounded slice). Two layers:
//
//   Layer 1 (always, free): convert → pruneMessages strips reasoning traces and
//     stale tool-call/result payloads (safe here — the agent re-fetches state
//     via tools every turn, so old query_todos output is noise after the fact).
//   Layer 2 (rare, one Flash call): when the messages older than the recent tail
//     exceed SUMMARY_TRIGGER_TOKENS, they get folded into a rolling summary (see
//     lib/chat/summary.ts) and dropped from the live window. buildModelMessages
//     prepends that summary; it never resends the summarized prefix.
//
// Cost lever, not a correctness cliff: Gemini Flash has a ~1M-token window, so
// the trigger only bounds per-turn cost. No tokenizer dependency — the estimate
// is the AI SDK's own heuristic.
import {
  convertToModelMessages,
  pruneMessages,
  type ModelMessage,
  type UIMessage,
} from "ai";

// Kept verbatim every turn — comfortably covers a multi-turn disambiguation flow
// ("book with Sarah" → "make it Tuesday" → "add Tom").
export const RECENT_TAIL_MESSAGES = 12;

// Layer 2 fires only when the older-than-tail slice exceeds this many estimated
// tokens. Generous on purpose (hero interface keeps lots of verbatim context);
// still far under Flash's ~1M ceiling, so it's pure cost tuning.
export const SUMMARY_TRIGGER_TOKENS = 66_000;

const SUMMARY_SYSTEM_PREFIX = "Summary of the earlier conversation so far:\n";

// AI SDK heuristic: ~4 chars/token over the serialized payload. Good enough to
// decide when to compact; we never need exact token counts.
export function estimateTokens(value: unknown): number {
  return Math.ceil(JSON.stringify(value ?? "").length / 4);
}

// The live window: messages after the summary watermark. Everything at or before
// the watermark is represented by the rolling summary and never resent.
export function messagesAfterWatermark(
  messages: UIMessage[],
  watermarkId: string | null | undefined,
): UIMessage[] {
  if (!watermarkId) return messages;
  const idx = messages.findIndex((m) => m.id === watermarkId);
  return idx === -1 ? messages : messages.slice(idx + 1);
}

// Split the live window (messages after the summary watermark) into the part
// eligible for summarization (`older`) and the verbatim `tail`.
export function splitForCompaction(
  messages: UIMessage[],
  tail: number = RECENT_TAIL_MESSAGES,
): { older: UIMessage[]; tail: UIMessage[] } {
  if (messages.length <= tail) return { older: [], tail: messages };
  return { older: messages.slice(0, -tail), tail: messages.slice(-tail) };
}

// True when the older slice is worth a Flash summary call this turn.
export function needsSummary(
  older: UIMessage[],
  trigger: number = SUMMARY_TRIGGER_TOKENS,
): boolean {
  return older.length > 0 && estimateTokens(older) > trigger;
}

// Build the model input: the rolling summary (if any) as a leading system
// message, then the Layer-1-pruned live messages. `liveMessages` are the
// messages AFTER the summary watermark — the summarized prefix is represented
// by `summary` alone and never resent.
export async function buildModelMessages({
  summary,
  liveMessages,
}: {
  summary: string | null | undefined;
  liveMessages: UIMessage[];
}): Promise<ModelMessage[]> {
  const converted = await convertToModelMessages(liveMessages, {
    ignoreIncompleteToolCalls: true,
  });
  const pruned = pruneMessages({
    messages: converted,
    reasoning: "all",
    toolCalls: "before-last-3-messages",
    emptyMessages: "remove",
  });
  const head: ModelMessage[] = summary
    ? [{ role: "system", content: SUMMARY_SYSTEM_PREFIX + summary }]
    : [];
  return [...head, ...pruned];
}
