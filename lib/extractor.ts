// ============================================================================
// T2.1 — Gemini extractor (the ExtractorClient seam from @/lib/contracts).
// Impl = AI SDK `generateObject` (gemini-2.5-flash) with a Zod schema mirroring
// ExtractorOutput. One unified ExtractorInput regardless of source (screenshot /
// manual text / forwarded email). Malformed model output → { todos: [] } (a
// failed extraction still leaves the capture-first plain todo standing).
//
// NO Claude/Anthropic in the runtime — Gemini for all image+text. The Gemini key
// is GEMINI_API_KEY, passed explicitly (the SDK default env name differs).
// ============================================================================

import { generateObject, NoObjectGeneratedError } from "ai";
import type { ModelMessage } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { z } from "zod";
import type {
  ActionPayload,
  ActionType,
  ExtractedTodo,
  ExtractorClient,
  ExtractorInput,
  ExtractorOutput,
  Priority,
} from "./contracts";

const DEFAULT_MODEL = "gemini-2.5-flash";

// ---- Zod schema mirroring ExtractorOutput ----
// actionPayload is a single flat object covering all variants (meeting/reminder/
// research) — Gemini structured output handles a flat object far better than a
// discriminated union; we re-tag it by actionType in normalize().
const barePayload = z
  .object({
    title: z.string().nullable(),
    attendees: z.array(z.string()).nullable(),
    start: z.string().nullable(),
    durationMin: z.number().nullable(),
    notes: z.string().nullable(),
    text: z.string().nullable(),
    remindAt: z.string().nullable(),
    topic: z.string().nullable(),
  })
  .partial()
  .nullable();

const extractedTodo = z.object({
  title: z.string(),
  detail: z.string().nullable().optional(),
  actionType: z.enum(["none", "meeting", "reminder", "research"]),
  actionPayload: barePayload.optional(),
  suggestedDueAt: z.string().nullable().optional(),
  suggestedPriority: z.enum(["none", "p1", "p2", "p3"]).nullable().optional(),
  suggestedListName: z.string().nullable().optional(),
  suggestedLabels: z.array(z.string()).nullable().optional(),
  recurrenceText: z.string().nullable().optional(),
  duplicateOf: z.string().nullable().optional(),
});

export const ExtractorOutputSchema = z.object({
  todos: z.array(extractedTodo),
});

type BarePayload = z.infer<typeof barePayload>;

// ---- System prompt (encodes the §6 extraction contract) ----
const SYSTEM_PROMPT = `You convert a captured input (a screenshot, a typed note, or a forwarded email) into a list of actionable to-do items for a task app.

Rules:
- Output 0..n todos. Zero is valid — if there is nothing actionable, return an empty list. Never invent tasks.
- Each title is an imperative phrase, <= 8 words (e.g. "Email Dakota the deck", "Book dentist").
- Ignore UI chrome (menu bars, editors, terminals, scrollbars) in screenshots.
- Classify actionType:
  - "meeting" only when a meeting/event is explicitly proposed (e.g. "Can we meet Tuesday at 2pm?").
  - "reminder" only for an explicit deadline or "remind me" phrasing.
  - "research" when the task is to look something up / investigate in depth.
  - otherwise "none".
- NEVER invent a time. Only set start/remindAt/suggestedDueAt when an explicit time appears; otherwise null.
- actionPayload (only when actionType != none): meeting -> {title, attendees?, start?, durationMin?, notes?}; reminder -> {text, remindAt?}; research -> {topic}. Leave all other fields null.
- Dedupe: if a todo matches one of the existing open titles, set duplicateOf to that exact title.
- Auto-organize from the user's REAL taxonomy only: suggest suggestedListName / suggestedLabels from the provided existing lists/labels, plus suggestedPriority and recurrenceText (raw phrase like "every monday") when clearly implied.`;

// Decodes base64 → bytes for the file content part (works in the node runtime).
function base64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}

// Builds the user message: image as a {type:'file'} part; text/note/email/taxonomy
// as text parts. Exported for direct unit testing of input shaping.
export function buildExtractionMessages(input: ExtractorInput): ModelMessage[] {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "file"; data: Uint8Array; mediaType: string }
  > = [];

  if (input.image) {
    content.push({
      type: "file",
      data: base64ToBytes(input.image.base64),
      mediaType: input.image.mimeType,
    });
  }

  const text: string[] = [];
  if (input.text) text.push(input.text);
  if (input.note) text.push(`Note: ${input.note}`);
  if (input.email) {
    const e = input.email;
    text.push(
      [
        "Forwarded email:",
        e.from ? `From: ${e.from}` : null,
        e.subject ? `Subject: ${e.subject}` : null,
        "",
        e.body,
      ]
        .filter((l) => l !== null)
        .join("\n"),
    );
  }
  text.push(
    `Existing open titles (for dedupe): ${JSON.stringify(input.existingOpenTitles)}`,
    `Existing lists: ${JSON.stringify(input.existingLists)}`,
    `Existing labels: ${JSON.stringify(input.existingLabels)}`,
    "Extract the actionable to-dos as structured data.",
  );
  content.push({ type: "text", text: text.join("\n\n") });

  return [{ role: "user", content }];
}

// Re-tags a bare payload into the contract's tagged ActionPayload union by type.
function tagPayload(
  actionType: ActionType,
  p: BarePayload | null | undefined,
): ActionPayload | null {
  if (actionType === "none") return null;
  const b = p ?? {};
  if (actionType === "meeting") {
    return {
      kind: "meeting",
      title: b.title ?? "",
      attendees: b.attendees ?? null,
      start: b.start ?? null,
      durationMin: b.durationMin ?? 30,
      notes: b.notes ?? null,
    };
  }
  if (actionType === "reminder") {
    return { kind: "reminder", text: b.text ?? "", remindAt: b.remindAt ?? null };
  }
  return { kind: "research", topic: b.topic ?? "" };
}

function normalize(raw: z.infer<typeof ExtractorOutputSchema>): ExtractorOutput {
  const todos: ExtractedTodo[] = raw.todos.map((t) => ({
    title: t.title,
    detail: t.detail ?? null,
    actionType: t.actionType,
    actionPayload: tagPayload(t.actionType, t.actionPayload),
    suggestedDueAt: t.suggestedDueAt ?? null,
    suggestedPriority: (t.suggestedPriority ?? null) as Priority | null,
    suggestedListName: t.suggestedListName ?? null,
    suggestedLabels: t.suggestedLabels ?? [],
    recurrenceText: t.recurrenceText ?? null,
    duplicateOf: t.duplicateOf ?? null,
  }));
  return { todos };
}

export interface GeminiExtractorOptions {
  apiKey?: string;
  model?: string;
}

export class GeminiExtractorClient implements ExtractorClient {
  constructor(private readonly opts: GeminiExtractorOptions = {}) {}

  async extract(input: ExtractorInput): Promise<ExtractorOutput> {
    const google = createGoogleGenerativeAI({
      apiKey: this.opts.apiKey ?? process.env.GEMINI_API_KEY,
    });
    try {
      const { object } = await generateObject({
        model: google(this.opts.model ?? DEFAULT_MODEL),
        schema: ExtractorOutputSchema,
        system: SYSTEM_PROMPT,
        messages: buildExtractionMessages(input),
      });
      return normalize(object);
    } catch (err) {
      // Malformed / unparseable model output → a valid empty extraction.
      // Capture-first means the plain todo already exists, so [] is safe.
      if (NoObjectGeneratedError.isInstance(err)) return { todos: [] };
      throw err;
    }
  }
}

// Default singleton for the capture pipeline (T2.2).
export const extractor = new GeminiExtractorClient();
