# Proposed contracts (TypeScript) — for architect ratification

> **PROPOSALS, not frozen.** Overnight prep (2026-06-25), synthesized from `native-flow-contract-reference.md` + the Gemini/voice seams. The architect ratifies/edits these, then they become law. Ported 1:1 from native Tada where possible (field names → camelCase TS; JSON wire keys = snake_case, matching native coding keys).

## Enums
```ts
type TodoStatus  = 'open' | 'done' | 'dismissed';
type Priority    = 'none' | 'p1' | 'p2' | 'p3';          // p4 = none (native parity)
type ActionType  = 'none' | 'meeting' | 'reminder' | 'research';
type ActionState = 'none' | 'proposed' | 'done' | 'failed';
type DateWindow  = 'any' | 'today' | 'overdue' | 'next7' | 'noDate';
type RecurFreq   = 'daily' | 'weekly' | 'monthly' | 'yearly';
```

## Core data model
```ts
interface Todo {
  id: string;
  createdAt: string;            // ISO8601, local (offset-less) — native semantics
  sourceCaptureId: string;
  title: string;                // imperative, ≤ ~8 words
  detail?: string | null;       // markdown (research writes here)
  status: TodoStatus;
  actionType: ActionType;
  actionPayload?: ActionPayload | null;
  actionState: ActionState;
  actionExternalId?: string | null;   // calendar event id / message id once executed
  dueAt?: string | null;
  sortIndex: number;            // fractional; lower sorts higher; default -createdAt epoch
  priority: Priority;
  listId?: string | null;       // null = Inbox/All
  labelIds: string[];
  recurrence?: RecurrenceRule | null;
  parentId?: string | null;     // one-level subtasks
  reminderAt?: string | null;
}

interface Capture { id: string; createdAt: string; kind: 'image'|'text'|'file'|'email'; blobPath?: string|null; note?: string|null; }
interface TodoLabel { id: string; name: string; /* lowercased */ colorHex: string; }
interface SavedView { id: string; name: string; colorHex: string; icon: string; sortIndex: number; criteria: FilterCriteria; }
interface RecurrenceRule { frequency: RecurFreq; interval?: number; weekday?: number; /* 1=Sun..7=Sat */ }

// tagged union; wire form is a bare object named by actionType
type ActionPayload =
  | { kind: 'meeting';  title: string; attendees?: string[]|null; start?: string|null; durationMin?: number; notes?: string|null; }
  | { kind: 'reminder'; text: string; remindAt?: string|null; }
  | { kind: 'research'; topic: string; }
```

## Filtering (pure, deterministic)
```ts
interface FilterCriteria { labelIds: string[]; minPriority?: Priority|null; dateWindow: DateWindow; includeCompleted: boolean; }
type ViewSelection = { kind:'all' } | { kind:'today' } | { kind:'project'; id:string } | { kind:'label'; id:string };

// matching order (native FilterEngine): dismissed-out → status(open unless includeCompleted)
//   → priority ≥ minPriority → labels ANY-of → dateWindow. now-injected for testability.
function applyFilter(c: FilterCriteria, todos: Todo[], now: Date): Todo[];
function criteriaFor(sel: ViewSelection, views: SavedView[]): FilterCriteria;
```

## Quick Add parse (live highlight)
```ts
interface ParseToken { kind: 'date'|'priority'|'label'|'list'; start: number; length: number; }
interface ParsedQuickAdd {
  title: string; dueAt?: string|null; priority: Priority;
  labelNames: string[]; listName?: string|null; recurrence?: RecurrenceRule|null; tokens: ParseToken[];
}
// tokens: p1/p2/p3 · @label · #list · today|tomorrow|tmr|<weekday>|<ISO yyyy-MM-dd> · "every <unit|weekday>"
function parseQuickAdd(text: string, now?: Date): ParsedQuickAdd;
```

## Extractor seam (Gemini conformer)
```ts
interface ExtractorInput {
  // one unified input; the extractor accepts it regardless of ingestion source
  // (screenshot / manual text / forwarded email — see the 3 hero flows in the spec §2)
  image?: { base64: string; mimeType: string } | null;
  text?: string | null;
  note?: string | null;
  email?: {                           // forwarded-email source (hero flow #3)
    from?: string; subject?: string; body: string;
    attachments?: { base64: string; mimeType: string }[];
  } | null;
  existingOpenTitles: string[];       // dedupe
  existingLists: string[]; existingLabels: string[];
}
interface ExtractedTodo {
  title: string; detail?: string|null;
  actionType: ActionType; actionPayload?: ActionPayload|null;   // classify-at-creation
  suggestedDueAt?: string|null; suggestedPriority?: Priority|null;
  suggestedListName?: string|null; suggestedLabels?: string[];
  recurrenceText?: string|null; duplicateOf?: string|null;
}
interface ExtractorOutput { todos: ExtractedTodo[]; }            // 0..n; [] is valid
interface ExtractorClient { extract(input: ExtractorInput): Promise<ExtractorOutput>; }
// Gemini impl: generateContent({ model:'gemini-2.5-flash', contents:[inlineData?, text],
//   config:{ responseMimeType:'application/json', responseSchema: ExtractorOutputSchema } })
```

### Inbound email ingestion (hero flow #3 — forward an email)
Each user gets a unique inbound alias `u_<id>@in.<domain>`. The user forwards/sends mail there; a webhook receives it, verifies the provider signature, resolves alias→user, builds an `ExtractorInput` (email source), and runs the **same** capture-first pipeline (persist `Capture{kind:'email'}` + plain `Todo` *before* `extract()`). Asynchronous, server-side; same `ExtractorClient`. **Provider is an open decision** (Postmark inbound / SendGrid Inbound Parse / Cloudflare Email Workers / Gmail watch — see `build-decisions.md`); the contract below is provider-agnostic.
```ts
function aliasForUser(userId: string): string;            // → `u_${userId}@in.${INBOUND_DOMAIN}`
function userIdFromAlias(toAddress: string): string|null; // reverse: parse the alias back to a user id

interface InboundEmail { from: string; to: string; subject?: string; text?: string; html?: string;
  attachments?: { base64: string; mimeType: string; filename?: string }[]; }

// POST /api/inbound/email  — provider webhook
//   1. verify provider signature (reject if invalid)
//   2. parse provider payload → InboundEmail
//   3. user = userIdFromAlias(email.to)  (reject/drop if unknown)
//   4. persist Capture{kind:'email'} + a plain Todo (capture-first)
//   5. build ExtractorInput{ email:{ from, subject, body: text ?? html, attachments }, … }
//   6. extractor.extract(input) → create todos for `user`
async function handleInboundEmail(req: Request): Promise<Response>;
```

## "Do it for me" — dispatch on actionType (the key contract)
```ts
// Each capability is ONE executor fn (deterministic). The tap path calls it directly when the
// payload is complete; the agent calls the same fn as a GATED tool. Reminders/meetings = deterministic.
// Research = an agent loop.

interface ExecResult { ok: boolean; actionExternalId?: string; error?: string; needsField?: string; }

interface Executors {
  sendMeetingInvite(p: Extract<ActionPayload,{kind:'meeting'}>, user: UserCtx): Promise<ExecResult>; // Google Cal+Gmail
  setReminder(p: Extract<ActionPayload,{kind:'reminder'}>): Promise<ExecResult>;                      // local notif
  deepResearch(p: Extract<ActionPayload,{kind:'research'}>, onProgress?: (s:string)=>void): Promise<{ markdown: string }>;
}

async function finishTodo(todo: Todo, user: UserCtx, ex: Executors): Promise<ExecResult>; // routes by todo.actionType

// Agent tool registry (shared by tap-when-fuzzy + chat + voice). Read auto-run; write gated.
// Runtime = Vercel AI SDK (Gemini provider): each AgentTool maps to an AI SDK `tool({ inputSchema, execute })`;
// `card` is returned as generative UI (a tile). See stack-decisions.md Q3.
interface AgentTool { name: string; gated: boolean; inputSchema: unknown /* zod schema */;
  run(args: unknown, user: UserCtx): Promise<{ output: string; card?: unknown }>; }
// gated tools (sendMeetingInvite, sendEmail) use the AI SDK's human-in-the-loop approval
// (approval-requested → Approve/Deny) before run() — no auto-execute of side effects.
```

## Voice seam (vendored from Clawdia, reimplemented backend)
```ts
type VoiceStatus = 'connecting'|'listening'|'thinking'|'speaking'|'error'|'ended';
interface VoiceSessionCallbacks { onStatus(s:VoiceStatus):void; onTranscript(t:{user:string;assistant:string}):void;
  onTool(t:{tool:string;label:string;detail?:string}|null):void; onError(m:string):void; onClosed?(turns:unknown[]):void; }
interface VoiceSession { start(seed?:()=>unknown[]):Promise<void>; stop():void; setMicEnabled(b:boolean):void; level():number; }
// routes: POST /api/voice/session (mint ephemeral OpenAI secret + embed our tool defs),
//         POST /api/voice/tool (→ AgentTool registry, gated writes), POST /api/voice/usage.
```

## Invariants (carry from native — do not violate)
1. One flat tagged pool; `All` is the only add surface; everything else is a read-only filter-View.
2. **Capture-first (all three hero flows — screenshot, manual, forwarded email):** persist Capture + a plain Todo *before* calling the extractor; a failed extraction still leaves a usable todo. The three flows differ only in how `ExtractorInput` is assembled (image / text / email); they share one `ExtractorClient`.
3. **Never auto-execute a side effect:** every write action shows its concrete effect and fires only on an explicit user action (tap, or confirmed agent tool-call).
4. Filtering is pure/deterministic given `now`.
5. One missing essential field → single inline ask, not a form.
6. The extractor/voice/executors are seams behind interfaces (swap providers without touching the core).
