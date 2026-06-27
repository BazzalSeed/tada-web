# Chat persistence & memory

How the text agent (`/api/chat`) remembers a conversation across reloads while
keeping per-turn cost bounded. Voice (OpenAI Realtime) keeps its own session
state today; folding voice turns into the same thread is a future follow-on.

## Principles

- **DB is the source of truth; compute is stateless.** Every turn rehydrates from
  Postgres, so any serverless instance can serve any turn. Same model as the
  Claude Agent SDK's query mode — trivial to scale.
- **Display ≠ model context.** We persist *every* raw message (full scroll-back on
  reload) but feed the model only a **bounded slice** each turn. Bounding the
  model input is the cost lever; it never touches what the user sees.
- **Never silently forget without saying so.** When a thread is compacted, a thin
  divider marks where the assistant's recall above is condensed (see below).

## Data model (`prisma/schema.prisma`)

- **`Conversation`** — `id`, `userId`, `title?`, `summary?`, `summaryThroughId?`,
  timestamps. `summary` + `summaryThroughId` are the rolling-compaction state:
  the summary covers every message up to and including the watermark.
- **`Message`** — `id`, `conversationId`, `role`, `parts` (JSON), `createdAt`.
  Stores the full AI SDK `UIMessage` shape so tool tiles re-render verbatim.

The client mints a conversation `id` for a fresh chat; the row is created lazily
on the first POST. One visible thread at a time (**Option 1**): `New chat` resets
to a new id; old threads stay in the DB but aren't browsable (no session list).

## Request flow

- **`GET /api/chat`** — on mount, returns the user's most recent conversation
  (`conversationId` + full `messages` + `summaryThroughId`), or a fresh id with an
  empty thread. `useChat({ id, messages })` hydrates from it.
- **`POST /api/chat`** — body carries `conversationId`. The server:
  1. `getOrCreateConversation` (ownership check + compaction meta, one query),
  2. builds the model input = rolling summary + the **live window** (messages
     after the watermark), pruned — `buildModelMessages`,
  3. streams the Gemini tool-loop,
  4. on `onEnd`: `persistMessages` (the new turn), then `compactIfNeeded`.

## Two-layer context management (`lib/chat/`)

Cost lever, **not** a correctness cliff — Gemini Flash's ~1M-token window means
trigger tuning only bounds spend; nothing overflows.

- **Layer 1 — prune (always, free).** `pruneMessages` strips reasoning traces and
  stale tool-call/result payloads (`toolCalls: 'before-last-3-messages'`). Safe
  here because the agent re-fetches state via tools every turn, so old
  `query_todos` output is noise after the fact. This alone holds most sessions.
- **Layer 2 — rolling summary (rare, one Flash call).** When the messages *older
  than the recent tail* exceed `SUMMARY_TRIGGER_TOKENS`, fold `(old summary +
  evicted slice)` into a new summary (`summarizeOlder`) and advance the watermark.
  Recursive, so it never re-reads the whole history. Runs in `onEnd`, off the
  user's path; on failure the watermark stays put and we retry next turn.

### Knobs (`lib/chat/context.ts`)

| Constant | Default | Meaning |
|---|---|---|
| `RECENT_TAIL_MESSAGES` | `12` | messages always kept verbatim |
| `SUMMARY_TRIGGER_TOKENS` | `66_000` | older-than-tail tokens that trigger Layer 2 |

Token estimate is the AI SDK heuristic (`JSON.stringify(...).length / 4`) — no
tokenizer dependency; we only need a threshold, not exact counts.

## What the summary keeps / drops

Keeps: in-flight intent, decisions, unresolved threads, and the names/emails/
dates/titles tied to pending actions (e.g. a meeting being booked), plus stated
preferences. Drops: todo contents (re-fetched via tools), pleasantries, resolved
one-offs. Re-enters context as a leading `system` message.

## Compaction divider (UX)

Compaction only changes what the *model* sees. The user always keeps full
scroll-back. When a conversation has been compacted, the thread renders one thin
line at the watermark — *"Earlier messages condensed for the assistant"* — so a
"like I said at the top" reference sets the right expectation. Rare at 66k.

## Files

| File | Role |
|---|---|
| `lib/chat/context.ts` | pure seam: estimate, watermark slice, split, `buildModelMessages` |
| `lib/chat/summary.ts` | the Gemini Flash rolling-summary fold |
| `lib/chat/store.ts` | Postgres CRUD (load/persist/ownership/summary) |
| `lib/chat/compact.ts` | `onEnd` orchestration: split → summarize → advance watermark |
| `app/api/chat/route.ts` | GET (load latest) + POST (stream, persist, compact) |
| `app/components/chat/ChatView.tsx` | load on mount, conversation id, New chat, divider |
