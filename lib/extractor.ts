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
const SYSTEM_PROMPT = `You convert a captured input (a screenshot, a typed note, or a forwarded email) into a list of actionable to-do items for a task app. EXTRACTING tasks is your primary job — bias toward extracting, not toward an empty list.

Rules:
- Output 0..n todos. Returning ZERO is ONLY correct when the input is genuinely non-actionable: a meme, a logo, a pure photo, a decorative/empty screen, or idle chatter with no asks. Whenever the input contains tasks, you MUST extract EVERY one of them — never return an empty list "to be safe", and never collapse several tasks into one generic catch-all.
- READ THE CONTENT. A screenshot of a notes app, a to-do/checklist, a reminders list, a chat/message thread, an email, a document, a sticky note, or any text that names things to do MUST yield one todo PER distinct task. Transcribe the user's own wording into an imperative.
- Each title is an imperative phrase, <= 8 words (e.g. "Email Dakota the deck", "Book dentist"). Preserve concrete details (names, amounts, dates) that the user wrote.
- Never invent tasks that aren't present. Extract what's there — no more, no less.
- Ignore pure UI chrome (the OS menu bar, window controls, scrollbars, app navigation) — but the CONTENT shown inside the app (the actual list items, message text, email body) is exactly what you extract.

- actionType marks what the app can DO FOR the user. Decide in this order; pick the FIRST that matches, else "none":
  1. "meeting" — a get-together with other people is proposed/requested: "meet", "call", "sync", "catch up", "lunch with", "schedule a 1:1", "Can we talk Tuesday 2pm?". Needs >=1 other person OR an explicit calendar event. Set actionPayload.attendees to the named people; start ONLY if an explicit time is given.
  2. "reminder" — a single time-anchored nudge for the user themself: "remind me to…", "don't forget…", an explicit deadline ("by Friday", "pay rent on the 1st"). No other attendees.
  3. "research" — open-ended look-up / compare / investigate: "research…", "find the best…", "compare X vs Y", "look into…". Set actionPayload.topic.
  4. "none" — a plain task with no time, no attendees, nothing to automate. THIS IS THE COMMON CASE — most todos are "none".

  Examples (input → actionType):
  - "Email Dakota the Q3 deck" → none (an action, but nothing to automate; no time, not a meeting).
  - "Coffee with Sam next Tuesday 10am" → meeting (attendees:["Sam"], start set).
  - "Remind me to renew my passport" → reminder (no time → remindAt null).
  - "Pay the electricity bill by the 15th" → reminder (explicit deadline).
  - "Find the best CRM for a 5-person team" → research (topic set).
  - "Buy milk" → none.

- NEVER invent a time. Only set start/remindAt/suggestedDueAt when an explicit time appears; otherwise null.
- actionPayload (only when actionType != none): meeting -> {title, attendees?, start?, durationMin?, notes?}; reminder -> {text, remindAt?}; research -> {topic}. Leave all other fields null.
- Dedupe: if a todo matches one of the existing open titles, set duplicateOf to that exact title.
- Auto-organize from the user's REAL taxonomy only: suggest suggestedListName / suggestedLabels from the provided existing lists/labels, plus suggestedPriority and recurrenceText (raw phrase like "every monday") when clearly implied.`;

const WEEKDAY_NAMES = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

// A dated instruction appended to the system prompt at call time so the model
// resolves relative dates ("by Friday", "next Tuesday 3pm", "tomorrow") to
// ABSOLUTE ISO-8601 — without this, Gemini emits the raw phrase, which is
// unparseable downstream (and, before the store guard, collapsed the capture).
// Pure given `now` (injected) so it's testable.
export function dateContextLine(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `\n\nDATE CONTEXT: Today is ${WEEKDAY_NAMES[now.getDay()]}, ${ymd} (the user's LOCAL date). Resolve EVERY relative date/time ("today", "tomorrow", "Friday", "next Tuesday 3pm", "by the 15th", "in 3 days") to an ABSOLUTE ISO-8601 LOCAL timestamp of the form yyyy-MM-ddTHH:mm:ss (NO timezone/offset). If only a date is implied, use yyyy-MM-ddT00:00:00. NEVER output a weekday name, a relative phrase, or any non-ISO string in suggestedDueAt, remindAt, or start — those fields MUST be valid ISO-8601 or null.`;
}

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

// ---- Enrichment system prompt (T2.5 / FIX4) ----
// Quick-add / dictate sends ONE terse task the user typed or spoke. Enrichment's
// job is to EXPAND it into a fully-specified todo — fill every field the user
// left implicit — without inventing facts. Distinct from capture (which splits
// arbitrary input into 0..n todos and is conservative about times); here the
// input is already known to be a single task, so we always return exactly one
// enriched todo and lean INTO sensible inference.
export const ENRICH_SYSTEM_PROMPT = `You enrich a SINGLE to-do the user just typed or spoke into the quick-add box. Expand their terse phrase into one fully-specified todo for a task app.

Return EXACTLY ONE todo (never zero, never split into several) — the enriched version of their input. Fill in as many fields as you reasonably can, but never fabricate specifics (names, exact times, amounts) the user didn't imply.

- title: a clean imperative, <= 8 words. Fix casing/grammar; keep the user's concrete details. Do NOT keep raw tokens like "p1", "@work", "tomorrow" in the title — those become structured fields.
- suggestedPriority: infer urgency. "urgent/asap/important/critical/by EOD" -> p1; a soft deadline or "soon" -> p2; routine -> p3; truly neutral -> none. An explicit p1/p2/p3 always wins.
- suggestedDueAt: resolve relative/explicit dates ("today", "tomorrow", "friday", "next week", "by the 15th", "in 3 days") to an ISO local date (yyyy-MM-ddT00:00:00). If a clock time is stated, include it. If NO date is implied, null — don't invent one.
- recurrenceText: the raw cadence phrase if the task repeats ("every monday", "daily", "weekly"); else null.
- suggestedLabels: 0-2 tags. STRONGLY prefer reusing the user's existing labels (provided). Only propose a new lowercase label when it clearly fits and none existing match. No label is fine.
- actionType + actionPayload — what the app can DO FOR them (pick the FIRST that matches, else "none"):
  1. meeting — meeting/call/sync with other people. Set payload.title to a short event title (≤6 words, e.g. "Follow up on Claudia"). attendees = named people. start: include ONLY when the user gives a time. If they give a clock time but NO day, anchor start's DATE to suggestedDueAt if you set one, else today — never invent a different weekday.
  2. reminder — a single time-anchored nudge for themself ("remind me…", a deadline). payload.text = the nudge.
  3. research — open-ended look-up/compare/investigate. payload.topic set.
  4. none — a plain task. Most todos are none; only classify when it genuinely matches.
- detail: a SHORT (one sentence) helpful note ONLY when it adds real value (e.g. a checklist hint or the implied next step). Usually null — never pad.
- duplicateOf: if it matches one of the user's existing open titles, set it to that exact title.`;

export interface GeminiExtractorOptions {
  apiKey?: string;
  model?: string;
  system?: string; // override the system prompt (e.g. enrichment vs capture)
  now?: () => Date; // injectable clock for the date-context line (tests)
}

export class GeminiExtractorClient implements ExtractorClient {
  constructor(private readonly opts: GeminiExtractorOptions = {}) {}

  async extract(input: ExtractorInput): Promise<ExtractorOutput> {
    const google = createGoogleGenerativeAI({
      apiKey: this.opts.apiKey ?? process.env.GEMINI_API_KEY,
    });
    // Append the current-date context so relative dates resolve to ISO.
    const system =
      (this.opts.system ?? SYSTEM_PROMPT) +
      dateContextLine(this.opts.now?.() ?? new Date());
    try {
      const { object } = await generateObject({
        model: google(this.opts.model ?? DEFAULT_MODEL),
        schema: ExtractorOutputSchema,
        system,
        messages: buildExtractionMessages(input),
        // Deterministic decoding — extraction should be stable run-to-run, so the
        // same clearly-tasked image doesn't oscillate between N todos and 0.
        temperature: 0,
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

// Dedicated enrichment client (T2.5 / FIX4) — same schema, fill-all prompt.
export const enrichExtractor = new GeminiExtractorClient({
  system: ENRICH_SYSTEM_PROMPT,
});
