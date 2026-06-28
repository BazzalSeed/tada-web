// ============================================================================
// FROZEN v0 CONTRACT — extractor seam + inbound-email ingestion.
// One unified ExtractorInput regardless of source (screenshot / manual text /
// forwarded email). Impl = AI SDK `generateObject` (Gemini 2.5 Flash) with a Zod
// schema mirroring ExtractorOutput; image passed as {type:'file', mediaType:'image'}.
// ============================================================================

import type { ActionPayload, ActionType, Priority } from "./types";

export interface ExtractorInput {
  /** User's IANA timezone (e.g. "America/New_York"), so relative dates resolve to the user's local day. */
  timeZone?: string | null;
  image?: { base64: string; mimeType: string } | null;
  text?: string | null;
  note?: string | null;
  email?: {
    from?: string;
    subject?: string;
    body: string;
    attachments?: { base64: string; mimeType: string }[];
  } | null;
  existingOpenTitles: string[]; // dedupe
  existingLists: string[];
  existingLabels: string[];
}

export interface ExtractedTodo {
  title: string;
  detail?: string | null;
  actionType: ActionType;
  actionPayload?: ActionPayload | null; // classify-at-creation
  suggestedDueAt?: string | null;
  suggestedPriority?: Priority | null;
  suggestedListName?: string | null;
  suggestedLabels?: string[];
  recurrenceText?: string | null; // raw phrase, e.g. "every monday"
  duplicateOf?: string | null; // matching existing title => skip create
}

export interface ExtractorOutput {
  todos: ExtractedTodo[]; // 0..n; [] is valid
}

export interface ExtractorClient {
  extract(input: ExtractorInput): Promise<ExtractorOutput>;
}

// ---- Inbound email ingestion (hero flow #3 — forward an email) ----
// Provider = Postmark; alias = u_<id>@in.gettada.app. Same capture-first pipeline.
export const INBOUND_DOMAIN = "in.gettada.app";

export type AliasForUser = (userId: string) => string;

export type UserIdFromAlias = (toAddress: string) => string | null;

export interface InboundEmail {
  from: string;
  to: string;
  subject?: string;
  text?: string;
  html?: string;
  attachments?: { base64: string; mimeType: string; filename?: string }[];
}

// POST /api/inbound/email — verify signature -> parse -> alias->user ->
//   capture-first (Capture{kind:'email'} + plain Todo) -> extract() -> create todos.
export type HandleInboundEmail = (req: Request) => Promise<Response>;
