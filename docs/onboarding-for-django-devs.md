# Onboarding for Django developers

You know Django and Python well; you don't know TypeScript or Next.js. This doc gets you productive in Tada Web by mapping every concept to its Django equivalent and walking each "golden flow" end-to-end through real files. Read `README.md` first for the layout, stack, and architecture.

> One rule that overrides intuition: **there is no Python here.** Everything — the "backend," the migrations, the AI calls — is TypeScript in one repo, one deploy. Where a Django project splits into Python (server) + JS (frontend), Next.js is one TypeScript codebase that runs *some* files on the server and *some* in the browser.

---

## 1. Concept map (Django → this repo)

| Django | Here | Notes |
|---|---|---|
| Python | **TypeScript** | Compiled to JS. `npm run typecheck` (`tsc --noEmit`) is your "does it even type-check" gate — like mypy but mandatory. |
| `pip` / `requirements.txt` / venv | **npm** / `package.json` / `node_modules/` | `npm install` reads `package.json`. `package-lock.json` is the pinned lockfile. |
| `manage.py` commands | **npm scripts** | `npm run dev`, `npm run build`, `npm test`, `npm run prisma:migrate`. Defined in `package.json` `"scripts"`. |
| `urls.py` (URLconf) | **the `app/` folder structure itself** | Routing is *file-system based*. A folder under `app/` with a `page.tsx` is a page URL; a folder with a `route.ts` is an API endpoint. No URL table — the path on disk *is* the URL. |
| A Django **view** that renders HTML | a **Server Component** (`page.tsx`, runs on the server) | Renders to HTML on the server, like a Django template view, but written in JSX (HTML-in-TS). |
| A Django **view** that returns `JsonResponse` (DRF/API) | a **Route Handler** (`app/api/**/route.ts`) | Exports `async function POST(req)`, `GET(...)`, etc. This is your "API view." Same role as a DRF `APIView`. |
| `urls.py` path converters `<int:id>` | **dynamic segments** `app/api/todos/[id]/route.ts` | `[id]` is the captured param; you read it from `ctx.params`. |
| Django **middleware** | **`proxy.ts`** (Next 16 renamed "middleware" → "proxy") | Runs before the route, on the Edge runtime. Here it's the auth redirect gate. |
| Django ORM models (`models.py`) | **`prisma/schema.prisma`** | Declarative model definitions. One schema file. |
| `makemigrations` / `migrate` | **`prisma migrate dev`** / **`prisma migrate deploy`** | `npm run prisma:migrate` generates + applies a migration; SQL lands in `prisma/migrations/`. |
| `Model.objects.filter(...)` | **`prisma.todo.findMany({ where: ... })`** | The generated Prisma client. Always async (`await`). |
| `settings.py` + env vars | **`.env` files** + `process.env.X` | `.env`, `.env.local`, `.env.test` (gitignored). `.env.example` is the committed template. |
| `request.user` / auth middleware | **`currentUser()`** in `lib/auth.ts` | The boundary every server handler calls first; throws `unauthorized` if no session. |
| Celery / background task | **inline `await` in a route** (v0) | Deep research "job" runs synchronously inside the request for now; the contract leaves room for a real queue later. |
| **(nothing in Django)** | **React + client state** | The interactive UI (`"use client"` files) keeps state in the browser via React hooks. Django has no equivalent — its pages are server-rendered and stateless between requests. This is the biggest new concept; see §3. |

### TypeScript survival kit

- `async`/`await` and `Promise<T>` are everywhere — like Python's `async def` / `await`. Nearly every DB or network call is awaited.
- `interface Foo { ... }` / `type Bar = ...` declare shapes (like a dataclass or a TypedDict, but checked at compile time only — erased at runtime).
- `foo?: string` means optional; `string | null` is a union (the value is a string *or* null), like Python's `Optional[str]`.
- `import { x } from "@/lib/y"` — `@/` is an alias for the repo root (configured in `tsconfig.json`), so `@/lib/...` is the server core and `@/app/lib/...` is the client code.
- **JSX**: `return <div>{title}</div>` is HTML embedded in TS. `.tsx` files contain JSX; `.ts` files don't.
- **Zod** (`z.object({...})`) is runtime schema validation — think DRF serializers or pydantic. Used to validate API input *and* to constrain the shape the AI model must return.

### The "seam" pattern (important here)

The codebase is built around **frozen contracts** in `lib/contracts/` — pure TypeScript `interface`s with no implementation. Concrete modules (`lib/store.ts`, `lib/extractor.ts`, `lib/executors.ts`) implement those interfaces. This is dependency inversion: the same way you'd code Django against an abstract base class / a swappable storage backend so you can replace Postmark with SES without touching callers. When you see `import type { TadaStore } from "./contracts"`, that's the interface; `lib/store.ts` is the implementation.

---

## 2. Guided directory walkthrough — where to look for what

- **"Where's the URL for X?"** → find the matching folder under `app/`. `app/api/todos/route.ts` is `POST/GET /api/todos`. `app/app/page.tsx` is the page at `/app`.
- **"Where's the database query for X?"** → `lib/store.ts` (the `TadaStore` implementation — all todo/label/view CRUD) or the raw `prisma` client in `lib/db.ts`.
- **"What does a Todo look like?"** → `prisma/schema.prisma` (the table) and `lib/contracts/types.ts` (the TS type). They mirror each other; wire/DB keys are `snake_case` (`@map`), TS fields are `camelCase`.
- **"How does auth work?"** → `auth.ts` (Auth.js config: providers + callbacks), `lib/auth.ts` (`currentUser`, invite/admin gating), `proxy.ts` (the redirect gate), `auth.config.ts` (edge-safe subset for the proxy).
- **"Where's the AI?"** → `lib/extractor.ts` (capture extraction + quick-add enrichment), `lib/executors.ts` (reminder/meeting/research actions), `lib/research.ts` (the research agent loop), `lib/agent-tools.ts` (the chat/voice tool registry). All call Gemini via the Vercel AI SDK.
- **"Where's the UI?"** → `app/components/` grouped by domain (`capture/`, `todo/`, `chat/`, `voice/`, `shell/`, `views/`, `landing/`). Client-only logic is in `app/lib/`.
- **"How does the browser talk to the server?"** → `app/lib/api.ts` and `app/lib/capture.ts` are the client-side `fetch()` wrappers that hit the `app/api/**` routes.
- **"What are the rules/decisions?"** → `CLAUDE.md` (locked decisions).

The data model (`prisma/schema.prisma`): `Todo` (the one flat pool, with a self-relation `parentId` for one level of subtasks, a `sortIndex` float for drag-ordering, and `actionType`/`actionPayload`/`actionState` for "do it for me"), `Capture` (the raw input a todo came from), `TodoLabel`, `SavedView` (a stored `FilterCriteria` — views are *read-only filters*, not folders), `User`/`Account`/`Session` (Auth.js), `InviteCode`, `AiUsage` (quota), `Conversation`/`Message` (persisted chat — see [chat-persistence.md](chat-persistence.md)).

---

## 3. The thing Django doesn't have: client state & the flow

In Django, a page is server-rendered HTML; interactivity means more requests or hand-written JS. Here, the product app (`/app`) is a **React single-page experience**. The server sends an initial shell, then the browser holds the to-do pool in memory and re-renders instantly on every edit.

That in-memory store is `app/lib/store.tsx` — a React **reducer** (`useReducer`, conceptually a Redux-style `(state, action) => newState` function) wrapped in **context** so any component can read it. State = `{ todos, views, labels, captures, selection, selectedTodoId }`. Actions like `UPSERT_TODO`, `SET_DATA`, `RECONCILE_TODO` mutate it. Crucially, **the data model is never recomputed on the server for the list view** — filtering is a pure function over the in-memory pool.

The **flow model** (a locked product decision): one flat tagged pool of todos; **`All` is the only place you can add**; every other "View" (Today, a saved filter, a label) is a **read-only deterministic filter** over that pool given the current time. The filter engine is the pure function `applyFilter(criteria, todos, now)` in `lib/core/` (imported by both the UI and the chat agent so "what's due today" in chat returns exactly what the Today view shows). "Pure/deterministic given `now`" means: same inputs → same output, no hidden state — trivially testable (see `lib/core/__tests__/`).

Optimistic UI: when you quick-add a todo, the client immediately inserts a temporary row (a client-generated UUID), fires the API call, then swaps the temp row for the server's real row via the `RECONCILE_TODO` action (`app/lib/store.tsx`). That's why you'll see "temp id → server id" reconciliation logic — there's no page reload, so the client patches itself.

---

## 4. Golden flows, traced end-to-end through real files

Each flow lists: **input component/route → server lib functions → AI/external provider → persistence**. Cite-and-follow.

### Flow 1 — Capture → AI extraction of structured todos

The hero flow. Three sources (screenshot/image, typed-or-spoken quick-add, forwarded email) all funnel through **one capture-first pipeline**.

**Image / screenshot (drop, paste, or upload):**
1. `app/components/capture/CaptureZone.tsx` wraps the whole app and listens for global drop/paste. On an image it calls `captureImageFile()` in `app/lib/capture.ts`.
2. `app/lib/capture.ts` decides: small image → inline base64 in the POST body; large image (>4MB) → upload direct to Vercel Blob first (`POST /api/blob/upload`), then send the blob URL. Either way it `POST`s to `/api/capture`.
3. `app/api/capture/route.ts` (the route handler) authenticates via `currentUser()`, then calls `runCapture()` in `lib/capture.ts`.
4. `lib/capture.ts` `runCapture()` is the **capture-first spine**: it (a) persists a `Capture` row + a plain `Todo` *before any AI runs* (so a failed extraction still leaves a usable todo — the core invariant), (b) gathers existing titles/labels for dedupe, (c) runs the extractor under `withQuota(user, "extractTodos", ...)` (quota metering, `lib/quota.ts`), (d) the **first** extracted todo enriches the plain todo in place; the rest become new todos; dedupe drops `duplicateOf` matches.
5. The extractor is `lib/extractor.ts` (`GeminiExtractorClient.extract`): it calls the **Vercel AI SDK `generateObject`** against **Gemini `gemini-2.5-flash`** with a **Zod schema** mirroring `ExtractorOutput`. The image goes in as a `{type:'file'}` message part; a date-context line is appended so relative dates ("Friday") resolve to absolute ISO. Malformed model output is caught and returns `{ todos: [] }` — never crashes the capture.
6. Persistence: `Capture` + `Todo` rows via `lib/store.ts` (Prisma → Neon Postgres). The route returns the created todos; back in the browser `CaptureZone.tsx` dispatches `UPSERT_CAPTURE` + `UPSERT_TODO` into the store so rows appear instantly.

**Typed quick-add** (the add card in `All`): `app/components/capture/AddCardView.tsx` → client parses tokens live (`parseQuickAdd`) and creates the todo immediately, then `POST /api/enrich` (`app/api/enrich/route.ts`) runs the **enrichment** prompt (`enrichExtractor` in `lib/extractor.ts`, same Gemini model, a "fill-all, return exactly one todo" system prompt) to propose labels/dates/priority/an action offer asynchronously.

**Spoken quick-add (dictate)**: `app/components/capture/MicButton.tsx` turns speech into text and feeds the *same* quick-add path — it's not the live-voice agent (that's Flow 4).

> The extraction classifies each todo's `actionType` (`none` | `meeting` | `reminder` | `research`) and fills an `actionPayload`. That's what powers Flow 3.

### Flow 2 — The to-do "flow" (flat pool, All-only add, read-only Views)

No AI. This is the deterministic spine.
1. The app shell is `app/components/shell/AppShellContainer.tsx` / `AppShell.tsx` (three panes: sidebar | list | detail) plus `CommandPalette.tsx` (the ⌘K quick-find). Entry point: `app/app/page.tsx` wraps everything in `TadaProvider` (the store) + `DataBootstrap` (loads the pool from the API on mount).
2. The sidebar (`app/components/shell/Sidebar.tsx`) selects a `NavSelection` (All / a label / a SavedView / Today). Selecting a view is **read-only navigation** — it just changes which filter is applied; it never lets you add there. Only `All` shows the add card.
3. Rendering the list: the selected criteria run through `applyFilter(criteria, todos, now)` (pure, `lib/core/`) over the in-memory pool. `app/lib/selectors.ts` adapts the store state to what the list view needs. `app/components/todo/TodoList.tsx` / `TodoRow.tsx` render rows; one level of subtasks via `SubtaskList.tsx` (parent shows a `done/total` rollup; completing all children does **not** auto-complete the parent — native parity).
4. Mutations (toggle done, edit, drag-reorder) call `app/lib/api.ts` → `PATCH /api/todos/:id` / `POST /api/todos/:id/reorder` (`app/api/todos/[id]/...`). Reorder uses a fractional `sortIndex` so a drag only rewrites one row. All of this lands in `lib/store.ts` → Prisma → Neon. The UI updates optimistically.
5. Views are created/edited with a filter builder (`app/components/views/FilterBuilder.tsx` / `ViewEditor.tsx`) that composes a `FilterCriteria` (labels ANY-of, min priority, date window, include-completed); saved via `POST /api/... labels/views`. A `SavedView` is literally a stored `FilterCriteria` — there are no folders.

### Flow 3 — "Do it for me" / the offer → gated execution

A captured todo can carry an `actionType`. The offer is *proposed* at capture time but **never auto-executed**.
1. When extraction sets `actionType !== "none"`, `lib/capture.ts` stores `actionState: "proposed"` (never `done`). The UI shows an offer (`app/components/todo/OfferPanel.tsx`, copy from `app/lib/offer.ts` / `lib/core/offer.ts`) describing the concrete effect ("Book a 30-min meeting with Sam, Tue 10am").
2. The user taps to run it → `POST /api/todos/:id/finish` (`app/api/todos/[id]/finish/route.ts`). This is the **tap path**.
3. The route dispatches on `actionType`:
   - **reminder / meeting → `finishTodo()`** in `lib/finish.ts`, which calls the matching **deterministic executor** in `lib/executors.ts`:
     - `setReminder` — validates the time; v0 just confirms (the app surfaces due reminders from `reminderAt`; no push infra). Missing time → `needsField: "remindAt"` → a single inline ask.
     - `sendMeetingInvite` — needs a start time and resolved attendees. It calls **Google Calendar API** with the user's stored OAuth refresh token (`lib/google.ts` refreshes the access token). Unresolved attendee names → `needsDisambiguation` (the offer shows a contact picker, resolved via `lib/contacts.ts` / Google People); **Send stays gated until every attendee resolves** — an unresolved attendee never auto-sends to the wrong person.
   - **research → `runResearch()`** in `lib/research.ts` (the route special-cases this). This is **the only agent loop**: it runs under `withQuota(deepResearch)` (reserves 10 credits, refunds on failure) and calls `executors.deepResearch`, which uses the AI SDK `generateText` against **Gemini `gemini-2.5-pro`** to produce a Markdown report, then writes it into `todo.detail` and sets `actionState: "done"`.
4. `applyFinishResult()` (`lib/finish.ts`) persists the outcome on the todo: `done` + an external id (e.g. the Calendar event id) on success, `failed` on error, or parks it `needs_disambiguation`. Finishing an *action* does **not** complete the *todo* — they're separate (native parity).

The key architectural point: there is **one executor function per capability**, and the tap path above calls it directly. Flows 4 and 5 wrap those *same* functions as gated tools — no duplicated logic.

### Flow 4 — Voice capture/agent (OpenAI Realtime)

The only place OpenAI is used (everything else is Gemini).
1. `app/components/voice/VoiceStage.tsx` is the immersive call overlay (the `SpiroOrb` animation + status + mute/end). On mount it starts a session via the hook `app/lib/voice/useVoiceSession.ts`.
2. The hook requests a short-lived client secret from `POST /api/voice/session` (`app/api/voice/session/route.ts`), which mints an **OpenAI Realtime** session server-side (the real `OPENAI_API_KEY` never reaches the browser) with the **shared agent tool registry** embedded as function-tool defs (`toOpenAIToolDefs()` in `lib/agent-tools.ts`). The browser then connects to OpenAI directly over **WebRTC** with that secret.
3. When the voice model wants to call a tool, the call round-trips through `POST /api/voice/tool` (`app/api/voice/tool/route.ts`). Read tools (`list_todos`, `query_todos`, `search_contacts`) run immediately. **Gated write tools** (create/complete/update todo, set reminder, book meeting, research) return `status: "approval_required"` until the client sends `approved: true` — server-side enforcement of "never auto-execute." On approval, `runApprovedTool()` runs the *same* executor from Flow 3.
4. A gated write surfaces an inline Approve/Deny `OfferCard` on the voice stage; nothing fires until the user approves.

### Flow 5 — Text chat (AI SDK `useChat`)

1. `app/components/chat/ChatView.tsx` is the ChatGPT-style thread (uses the AI SDK `useChat` hook, which streams from `/api/chat` and manages messages + tool-approval state).
2. `app/api/chat/route.ts` authenticates, then `streamText()` against **Gemini `gemini-2.5-flash`** with the system prompt + `toAiSdkTools(user)` (`lib/agent-tools.ts`), metered by `withQuota(chatTurn)`. `stopWhen: stepCountIs(6)` bounds the tool-use loop.
3. The tool registry is **the same** `lib/agent-tools.ts` used by voice. Read tools auto-run; **gated** writes are marked `needsApproval: true`, which makes the AI SDK pause in `approval-requested` and run the tool's `execute` **server-side only after the user clicks Approve** — the client can't fabricate a result. The executors are again the same ones from Flow 3.
4. Each tool returns `{ output, card }`; the client renders a generative-UI tile (todo list, offer, research report) from the card (`app/components/chat/` tiles). `query_todos` reuses `applyFilter` so chat answers match the app's Views exactly.

---

## 5. Notes, gotchas, and what *isn't* here

- **No Claude/Anthropic at runtime** — a hard cost decision. Gemini does all text+image; OpenAI does voice only. Don't add Anthropic calls to the product path.
- **Two `lib/` dirs** trip people up: `lib/` = server core, `app/lib/` = client. Server-only code (Prisma, API keys, executors) must never be imported into a `"use client"` file.
- **`"use client"`** at the top of a `.tsx` file means it runs in the browser (can use hooks/state/events). Files without it are Server Components by default (run on the server, can hit the DB directly, can't use browser state).
- **Wire vs TS casing:** DB/JSON keys are `snake_case`, TS fields `camelCase`. Prisma `@map` and manual mapping bridge them.
- **Email capture (Flow 1, email source) is built but dormant** — `lib/inbound.ts` + `app/api/inbound/email/route.ts` exist and are tested against fixtures, but no live inbound-email provider is wired (the provider decision is deferred post-launch). So in practice today the live capture sources are screenshot, typed/spoken quick-add, and voice/chat — **not** forward-an-email.
- **Deep research runs synchronously** inside the finish request in v0 (no real job queue yet), though the contract and `GET /api/research/:id` leave room for one.
- **Tests** live in `__tests__/` folders next to the code (Vitest). `.live.test.ts` files hit real providers (Gemini/Blob) and need real keys; the rest are pure/mocked. Run `npm test`.

When in doubt, follow the imports: a route handler in `app/api/**/route.ts` will `import` the real work from `lib/`, and the contract it satisfies is in `lib/contracts/`.
