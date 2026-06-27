// @vitest-environment node
// T2.1 — Gemini extractor unit tests. `generateObject` is mocked (no network);
// the real NoObjectGeneratedError class is kept so the malformed-output path is
// exercised for real. A live Gemini call is covered by a separate gated test.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("ai", async (orig) => ({
  ...(await orig<typeof import("ai")>()),
  generateObject: vi.fn(),
}));
vi.mock("@ai-sdk/google", () => ({
  createGoogleGenerativeAI:
    () =>
    (model: string) => ({ __model: model }),
}));

import { generateObject, NoObjectGeneratedError } from "ai";
import {
  GeminiExtractorClient,
  buildExtractionMessages,
} from "@/lib/extractor";
import type { ExtractorInput } from "@/lib/contracts";

const genObj = generateObject as unknown as ReturnType<typeof vi.fn>;
const base: ExtractorInput = {
  existingOpenTitles: [],
  existingLists: [],
  existingLabels: [],
};

beforeEach(() => vi.clearAllMocks());

describe("buildExtractionMessages", () => {
  it("encodes an image as a {type:'file'} part with its mediaType", () => {
    const msgs = buildExtractionMessages({
      ...base,
      image: { base64: "QUJD", mimeType: "image/png" },
      note: "from a screenshot",
    });
    const parts = msgs[0].content as Array<Record<string, unknown>>;
    const file = parts.find((p) => p.type === "file");
    expect(file).toBeTruthy();
    expect(file!.mediaType).toBe("image/png");
    // note + a text instruction part are present
    expect(parts.some((p) => p.type === "text")).toBe(true);
  });

  it("encodes forwarded email as text (from/subject/body)", () => {
    const msgs = buildExtractionMessages({
      ...base,
      email: { from: "a@b.com", subject: "Lunch?", body: "Can we meet Tue 2pm?" },
    });
    const text = (msgs[0].content as Array<Record<string, unknown>>)
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("\n");
    expect(text).toContain("Lunch?");
    expect(text).toContain("Can we meet Tue 2pm?");
  });
});

describe("GeminiExtractorClient.extract", () => {
  it("returns normalized todos with a tagged actionPayload", async () => {
    genObj.mockResolvedValue({
      object: {
        todos: [
          {
            title: "Meet Dakota",
            actionType: "meeting",
            actionPayload: {
              title: "Sync with Dakota",
              attendees: ["dakota@x.com"],
              start: "2026-06-30T14:00:00",
              durationMin: 30,
            },
            suggestedLabels: ["work"],
          },
        ],
      },
    });
    const out = await new GeminiExtractorClient({ apiKey: "k" }).extract({
      ...base,
      text: "meet dakota tuesday 2pm",
    });
    expect(out.todos).toHaveLength(1);
    const t = out.todos[0];
    expect(t.title).toBe("Meet Dakota");
    expect(t.actionType).toBe("meeting");
    // bare payload normalized to the tagged union (kind added)
    expect(t.actionPayload).toMatchObject({ kind: "meeting", title: "Sync with Dakota" });
    expect(t.suggestedLabels).toEqual(["work"]);
  });

  it("drops actionPayload to null when actionType is 'none'", async () => {
    genObj.mockResolvedValue({
      object: { todos: [{ title: "Buy milk", actionType: "none", actionPayload: { topic: "x" } }] },
    });
    const out = await new GeminiExtractorClient({ apiKey: "k" }).extract({
      ...base,
      text: "buy milk",
    });
    expect(out.todos[0].actionPayload).toBeNull();
  });

  it("returns [] gracefully when the model yields no valid object", async () => {
    genObj.mockRejectedValue(
      new NoObjectGeneratedError({
        message: "no object",
        cause: new Error("bad"),
        text: "garbage",
        response: {} as never,
        usage: {} as never,
        finishReason: "stop",
      }),
    );
    const out = await new GeminiExtractorClient({ apiKey: "k" }).extract({
      ...base,
      text: "whatever",
    });
    expect(out).toEqual({ todos: [] });
  });
});
