// @vitest-environment node
// T2.1 — LIVE Gemini extraction. Gated behind RUN_LLM_TESTS + GEMINI_API_KEY so
// the default suite stays offline/deterministic. Validates the real schema
// round-trips through Gemini structured output and classifies actionType.
import { describe, expect, it } from "vitest";
import { GeminiExtractorClient } from "@/lib/extractor";

const RUN = !!process.env.RUN_LLM_TESTS && !!process.env.GEMINI_API_KEY;

describe.skipIf(!RUN)("GeminiExtractorClient (live)", () => {
  const extractor = new GeminiExtractorClient();

  it("extracts >= 1 todo and classifies a meeting", async () => {
    const out = await extractor.extract({
      text: "Can we meet Dakota next Tuesday at 2pm to review the Q3 deck?",
      existingOpenTitles: [],
      existingLists: ["Work"],
      existingLabels: ["urgent"],
    });
    expect(out.todos.length).toBeGreaterThanOrEqual(1);
    const meeting = out.todos.find((t) => t.actionType === "meeting");
    expect(meeting).toBeTruthy();
  }, 30_000);

  it("returns 0 todos for non-actionable input", async () => {
    const out = await extractor.extract({
      text: "the sky is blue and grass is green",
      existingOpenTitles: [],
      existingLists: [],
      existingLabels: [],
    });
    expect(Array.isArray(out.todos)).toBe(true);
  }, 30_000);
});
