// Layer-2 orchestration — runs in /api/chat's onFinish, off the user's path.
// Looks at the live window (messages after the current watermark); if the slice
// older than the recent tail exceeds the trigger, folds it into the rolling
// summary and advances the watermark. Best-effort: any failure leaves the
// watermark untouched and we retry next turn (safe — the trigger sits far under
// Flash's context ceiling, so skipping a fold never overflows).
import type { UIMessage } from "ai";
import {
  messagesAfterWatermark,
  needsSummary,
  splitForCompaction,
} from "./context";
import { summarizeOlder } from "./summary";
import { saveSummary } from "./store";

export async function compactIfNeeded({
  conversationId,
  summary,
  summaryThroughId,
  messages,
}: {
  conversationId: string;
  summary: string | null;
  summaryThroughId: string | null;
  messages: UIMessage[];
}): Promise<void> {
  const live = messagesAfterWatermark(messages, summaryThroughId);
  const { older } = splitForCompaction(live);
  if (!needsSummary(older)) return;

  const newWatermark = older[older.length - 1]?.id;
  if (!newWatermark) return;

  try {
    const next = await summarizeOlder({
      previousSummary: summary,
      olderMessages: older,
    });
    await saveSummary(conversationId, next, newWatermark);
  } catch (err) {
    // Leave the watermark where it is; next turn re-attempts with a bit more
    // context. Never surfaced to the user.
    console.error("chat compaction failed:", err);
  }
}
