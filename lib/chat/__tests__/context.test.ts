import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import {
  RECENT_TAIL_MESSAGES,
  buildModelMessages,
  estimateTokens,
  messagesAfterWatermark,
  needsSummary,
  splitForCompaction,
} from "@/lib/chat/context";

const msg = (id: string, role: UIMessage["role"], text: string): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text }],
});

const thread = (n: number): UIMessage[] =>
  Array.from({ length: n }, (_, i) =>
    msg(`m${i}`, i % 2 === 0 ? "user" : "assistant", `message ${i}`),
  );

describe("estimateTokens", () => {
  it("approximates ~4 chars per token", () => {
    expect(estimateTokens("a".repeat(400))).toBe(Math.ceil(402 / 4)); // +2 for JSON quotes
  });
  it("handles nullish without throwing", () => {
    expect(estimateTokens(null)).toBe(1);
    expect(estimateTokens(undefined)).toBe(1);
  });
});

describe("messagesAfterWatermark", () => {
  it("returns all messages when there is no watermark", () => {
    const t = thread(5);
    expect(messagesAfterWatermark(t, null)).toBe(t);
  });
  it("returns only messages after the watermark id", () => {
    const t = thread(5);
    expect(messagesAfterWatermark(t, "m2").map((m) => m.id)).toEqual([
      "m3",
      "m4",
    ]);
  });
  it("falls back to all messages when the watermark id is gone", () => {
    const t = thread(3);
    expect(messagesAfterWatermark(t, "missing")).toBe(t);
  });
});

describe("splitForCompaction", () => {
  it("keeps everything in the tail when at or under the tail size", () => {
    const t = thread(RECENT_TAIL_MESSAGES);
    const { older, tail } = splitForCompaction(t);
    expect(older).toHaveLength(0);
    expect(tail).toHaveLength(RECENT_TAIL_MESSAGES);
  });
  it("splits the overflow into older + a verbatim tail", () => {
    const t = thread(RECENT_TAIL_MESSAGES + 5);
    const { older, tail } = splitForCompaction(t);
    expect(older).toHaveLength(5);
    expect(tail).toHaveLength(RECENT_TAIL_MESSAGES);
    expect(tail[tail.length - 1].id).toBe(`m${RECENT_TAIL_MESSAGES + 4}`);
  });
});

describe("needsSummary", () => {
  it("is false for an empty older slice", () => {
    expect(needsSummary([])).toBe(false);
  });
  it("is false below the trigger and true above it", () => {
    const small = [msg("a", "user", "hi")];
    expect(needsSummary(small)).toBe(false);
    const big = [msg("a", "user", "x".repeat(300_000))]; // ~75k tokens > 66k
    expect(needsSummary(big)).toBe(true);
  });
  it("honors a custom trigger", () => {
    expect(needsSummary([msg("a", "user", "hello there")], 1)).toBe(true);
  });
});

describe("buildModelMessages", () => {
  it("omits the system head when there is no summary", async () => {
    const out = await buildModelMessages({
      summary: null,
      liveMessages: [msg("a", "user", "what's due today?")],
    });
    expect(out[0].role).toBe("user");
  });
  it("prepends the rolling summary as a leading system message", async () => {
    const out = await buildModelMessages({
      summary: "The user is booking a meeting with Sarah on Tuesday.",
      liveMessages: [msg("a", "user", "add Tom too")],
    });
    expect(out[0].role).toBe("system");
    expect(String(out[0].content)).toContain("Sarah on Tuesday");
    expect(out[out.length - 1].role).toBe("user");
  });
});
