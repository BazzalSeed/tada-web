// @vitest-environment node
// T2.1 — LIVE Gemini extraction. Gated behind RUN_LLM_TESTS + GEMINI_API_KEY so
// the default suite stays offline/deterministic. Validates the real schema
// round-trips through Gemini structured output and classifies actionType.
import { describe, expect, it } from "vitest";
import { GeminiExtractorClient, enrichExtractor } from "@/lib/extractor";

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

  // FIX7 — a clearly-tasked screenshot must RELIABLY yield structured todos
  // (not 0 → a generic "Screenshot capture" row). Render a to-do-list PNG and
  // extract it 3× to assert consistency.
  it("reliably extracts every task from a tasked screenshot (3× consistent)", async () => {
    const { default: sharp } = await import("sharp");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="640">
      <rect width="900" height="640" fill="#ffffff"/>
      <text x="40" y="70" font-family="Helvetica" font-size="40" font-weight="bold" fill="#111">Today's tasks</text>
      <text x="50" y="160" font-family="Helvetica" font-size="32" fill="#222">☐ Email Priya the Q3 budget</text>
      <text x="50" y="230" font-family="Helvetica" font-size="32" fill="#222">☐ Book dentist appointment</text>
      <text x="50" y="300" font-family="Helvetica" font-size="32" fill="#222">☐ Pay the electricity bill by Friday</text>
      <text x="50" y="370" font-family="Helvetica" font-size="32" fill="#222">☐ Pick up dry cleaning</text>
      <text x="50" y="440" font-family="Helvetica" font-size="32" fill="#222">☐ Call Marcus to schedule a 1:1</text>
    </svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const base64 = png.toString("base64");

    for (let i = 0; i < 3; i++) {
      const out = await extractor.extract({
        image: { base64, mimeType: "image/png" },
        existingOpenTitles: [],
        existingLists: [],
        existingLabels: [],
      });
      // 5 tasks on screen — must get most of them, never 0.
      expect(out.todos.length).toBeGreaterThanOrEqual(4);
    }
  }, 90_000);

  // FIX7 (reopened) — a screenshot with RELATIVE dates must extract todos with
  // VALID ISO due dates (not collapse to a generic "Screenshot capture", and not
  // emit an unparseable "Friday" that nulls/throws downstream).
  it("resolves relative dates in a tasked screenshot to valid ISO (not dropped)", async () => {
    const { default: sharp } = await import("sharp");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="420">
      <rect width="900" height="420" fill="#ffffff"/>
      <text x="40" y="70" font-family="Helvetica" font-size="38" font-weight="bold" fill="#111">Reminders</text>
      <text x="50" y="150" font-family="Helvetica" font-size="30" fill="#222">- Email Priya the budget by Friday</text>
      <text x="50" y="210" font-family="Helvetica" font-size="30" fill="#222">- Book the dentist next Tuesday</text>
      <text x="50" y="270" font-family="Helvetica" font-size="30" fill="#222">- Submit the report tomorrow</text>
    </svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const out = await extractor.extract({
      image: { base64: png.toString("base64"), mimeType: "image/png" },
      existingOpenTitles: [],
      existingLists: [],
      existingLabels: [],
    });
    expect(out.todos.length).toBeGreaterThanOrEqual(3); // NOT collapsed to a generic row
    const dated = out.todos.filter((t) => t.suggestedDueAt);
    expect(dated.length).toBeGreaterThanOrEqual(2); // the relative dates resolved
    // every emitted date is a VALID, parseable ISO timestamp (no "Friday"/NaN)
    for (const t of dated) {
      expect(Number.isNaN(new Date(t.suggestedDueAt!).getTime())).toBe(false);
      expect(t.suggestedDueAt!).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  }, 60_000);
});

describe.skipIf(!RUN)("enrichExtractor (live) — FIX4 fill-all", () => {
  it("expands a terse urgent task into one fully-specified todo", async () => {
    const out = await enrichExtractor.extract({
      text: "remind me to renew passport by friday, urgent",
      existingOpenTitles: [],
      existingLists: [],
      existingLabels: ["health", "work"],
    });
    expect(out.todos).toHaveLength(1);
    const t = out.todos[0];
    expect(t.suggestedDueAt).toBeTruthy(); // "friday" resolved
    // resolved against the CURRENT date (not a stale 2024) — enrich injects now.
    const due = new Date(t.suggestedDueAt!);
    expect(Number.isNaN(due.getTime())).toBe(false);
    expect(due.getFullYear()).toBe(new Date().getFullYear());
    expect(t.suggestedPriority).toBe("p1"); // "urgent"
    expect(t.actionType).toBe("reminder"); // explicit "remind me"
    expect(t.title.toLowerCase()).not.toContain("urgent"); // token stripped
  }, 30_000);

  it("does NOT invent a date when none is implied", async () => {
    const out = await enrichExtractor.extract({
      text: "buy oat milk",
      existingOpenTitles: [],
      existingLists: [],
      existingLabels: [],
    });
    expect(out.todos).toHaveLength(1);
    expect(out.todos[0].suggestedDueAt ?? null).toBeNull();
  }, 30_000);
});
