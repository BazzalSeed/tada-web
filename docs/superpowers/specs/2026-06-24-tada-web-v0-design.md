# Tada Web — v0 Design

> **Status:** Draft for review. Rough shape agreed 2026-06-24; **stack + product-shape revision 2026-06-26** (this update — open decisions now settled, marketing promoted to a full lane, three differentiators, subtasks added). The `docs/superpowers/prep/` pack is the newer source of truth for stack/agent decisions — this spec folds those in.
>
> **One-liner:** Todoist's to-do *flow* (ported from the native Tada app) + Tada's capture-first AI + a real "do it for me" layer + a magical chat/voice agent — as a local-first web app. **Not to-do. Ta-da.**

## 0. Decisions snapshot (for quick review)

**Locked:**
- **The agent team builds the whole product autonomously** — the full app **and** the marketing landing — from this spec, without further prompting. The marketing site = the `gettada.app` landing (the `design/landing-preview/` made live); **the frontend finishes it at the end**, converting the waitlist CTAs into OAuth sign-in/up. **No separate marketing teammate** (the user iterates on marketing separately later — see `handoff-marketing.md`).
- **Three differentiators vs. Todoist** (see §1): (1) **capture is the hero** — three co-equal AI sources; (2) **it does the task for you**; (3) **a magical chat (voice + text)** that can do anything across your todos.
- **Flow = native Tada's model:** one flat tagged pool, `All` is the single add surface, everything else is a read-only filter-View. **One divergence from native: real Todoist-style subtasks in the UI** (one level — see §3).
- **Stack:** Next.js (App Router/RSC), **TypeScript only — no Python.** **Neon** (serverless Postgres — app data + agent memory; pgvector). **Auth.js (NextAuth)** Google OAuth. **Vercel Blob** for capture images. **No realtime service** (stream/poll/SSE). **Vercel** hosting; domain **`gettada.app`** (already owned in Vercel — provision site+app against it via Vercel MCP/CLI).
- **AI runtime = the Vercel AI SDK** (the npm package `ai`) — one SDK, the agent runtime. Gemini plugs in through its official provider adapter **`@ai-sdk/google`** (that is *not* a separate "Google SDK" — it's the AI SDK's Gemini dial-tone). Extraction = one `generateObject` call (Zod schema). "Do it for me" / chat = the AI SDK tool-use loop (`ToolLoopAgent` / `tool()` / `stopWhen`) with built-in human-in-the-loop approval. **No workflow engine in v0.** "No agent SDK" only ever meant the **Claude** Agent SDK.
- **AI providers (NO Claude/Anthropic — cost):** **Gemini** for all image+text (`gemini-2.5-flash` extract/enrich, `gemini-2.5-pro` research) via `@ai-sdk/google`; **OpenAI Realtime** for voice only.
- **Execution model:** hybrid — **deterministic to-do spine; agent only where it earns it.** "Finish the todo" dispatches on `actionType`: meetings/reminders deterministic, **research is the only true agent.**
- **One capability = one fn, three callers:** each executor is a plain TS fn called **directly** by the tap path and the inbound-email webhook (no LLM), and wrapped as a **gated AI SDK tool** for chat/voice.
- **Never auto-execute a side effect.** Every write action shows its concrete effect and fires only on explicit user action (tap or confirmed tool-call).
- **Accent = rust `#c8632e`** on the warm cream substrate (the locked design system — **not** indigo). Auto dark mode via `prefers-color-scheme`.
- **Design system = Clawdia's, copied verbatim at the token/palette level.** Clawdia's *components and voice* are a **feel-and-touch reference**, not a code port — build fresh, inspired by them (see §2, §7).
- **Auth:** no login wall locally (implicit user); Google OAuth works e2e locally. Account creation gated by a hand-rolled **invite code**; AI usage gated by **plan** (free / pro / unlimited).

All earlier "open decisions" are now **settled** and folded into the relevant sections below (no separate "open decisions" list).

## 1. North star

**Three** reasons to exist that Todoist can't match:

1. **Capture is the hero.** AI turns raw input into structured todos — and the three sources are **equally first-class**:
   - **Screenshot / image** — drop, paste, or drag an image → extract one or many todos.
   - **AI-enhanced quick add** — type *or* speak a task; NL parsing + enrichment classify and refine it.
   - **Forward an email** — send mail to your alias → it becomes todos.
   All three feed **one shared extractor**. Todoist makes you type and file; Tada makes you capture, by whatever's at hand, and it files for you.
2. **It does the task for you** — the "Tada." The offer resolves into a **real executed action** (meeting invite, reminder, deep research), gated by one explicit tap. Not "remind me to book it" — *book it.*
3. **A magical chat — voice + text.** A conversational agent that can do *anything* across your todos: ask what's due, reorganize, capture, and trigger "do it for me." The thing a list app can't be: you can just talk to it.

The **All + Views** IA from native Tada is the organizing substrate, deliberately **simpler than Clawdia and simpler than Todoist** — with one addition: subtasks.

## 2. Experience model & visual references

What a teammate should picture before building. We model the *experience* after two products, with a third as the look-and-feel guide.

### Target layout — the three-pane shape (Todoist web ∩ native Tada)

```
┌────────────┬───────────────────────────┬──────────────┐
│  Sidebar   │      Content list         │  Detail pane │
│            │                           │  (slides in  │
│  All       │  + Add task (All only)    │   on select) │
│  Chat ▸    │  ─────────────────        │              │
│  Today     │  ◐ todo · chips · offer   │  title       │
│  Views [+] │    ▸ ◯ subtask  ◯ subtask │  notes (md)  │
│   • work   │  ◐ todo …                 │  properties  │
│   • errand │  ▾ Done (scoped)          │  the offer   │
│            │                           │  capture img │
└────────────┴───────────────────────────┴──────────────┘
                      ⌘K command palette / quick-find
```
Keyboard-first, inline editing, instant — the model is **never** in the hot path of the list.

### What we borrow from Todoist (web)
NL quick-add with live token parsing; three-pane density and calm list rhythm; today/upcoming framing; a `⌘K` palette; keyboard-first inline editing; **and one-level subtasks** (indent, expand/collapse, "2/5 done" rollup). **Dropped** (see §9): deep multi-level nesting, board/calendar layouts, a filter query language, analytics/karma.

### What is pure native Tada
The **flat-pool + read-only filter-View flow**, **capture-first**, and **do-it-for-me** are native Tada's identity. Two ground-truth references for *behavior*:
- **Source:** `~/projects/tada` (Swift — `App/`, `Sources/TadaUI`, `Sources/TadaModels`, `Sources/TadaExtractor`, `Sources/TadaExecution`).
- **Contract:** `docs/superpowers/prep/native-flow-contract-reference.md` — near 1:1 port spec for the spine (data model, filter logic, quick-add parsing, offer states, add-card flow).

### Look & feel = the marketing site + Clawdia (reference, not port)
The product should feel like the landing page kept its promise.
- **Feel/tone reference:** `design/landing-preview/index.html` (+ `screenshots/`). Warm cream `#f0ece3` (light) / graphite `#1b1a18` (dark), **rust accent `#c8632e`**, EB Garamond display + Geist body + Caveat wordmark. Soft raised surfaces for active state — **never a heavy black fill**.
- **Clawdia (`docs/superpowers/prep/clawdia-port-manifest.md` + `~/projects/clawdia-marketing-agent`):** copy the **tokens/palette verbatim**; treat its **components and voice as a feel-and-touch reference only** — build our own, inspired by them. No obligation to vendor exact files.

## 3. The exact flow (ported from native Tada, + subtasks)

**One flat tagged pool. One add surface. Everything else is a filter-view.** (Source: `~/projects/tada/...`; frozen in `native-flow-contract-reference.md`.)

- **Sidebar:** `All` (single home, the **only** place you add) · **`Chat`** (the voice+text agent — a destination, *not* a filter-View; see §7) · **Views** `[+]` → `Today` + user `SavedView`s. Labels are created inline while tagging; surfaced via Views or a quick label-tap.
- **Views are read-only filters.** The add card renders **only in All**; capture always lands in All and snaps selection back.
- **FilterCriteria (shallow, no query language):** `labelIds` (any-of) · `minPriority` · `dateWindow` (`any|today|overdue|next7|noDate`) · `includeCompleted`.
- **Content list:** open todos + collapsible **Done** (scoped) · drag-reorder (fractional index). Row: priority circle · title · meta chips (due · priority · `#labels` · subtask count) · detail · **do-it-for-me offer** · dismiss.
- **Subtasks (the one divergence from native):** a todo can have **one level** of subtasks (Todoist-style). Row shows an expand/collapse caret + a `done/total` rollup; subtasks render indented under the parent; completing all subtasks doesn't auto-complete the parent (explicit). Data model already carries `parentId` (one-level) — we surface it in the UI. *(Multi-level nesting is out of scope — §9.)*
- **Detail pane** slides in on select: title, markdown notes, priority/due/labels, **subtask list (add/complete/reorder)**, the offer, source-capture thumbnail.
- **`⌘K`** command palette / quick-find.

### Capture — three co-equal hero sources
Capture is the product. All paths feed **one shared extractor** (`ExtractorInput → ExtractorClient.extract() → ExtractedTodo[]`, see `proposed-contracts.md`); they differ only in how input is assembled. The **capture-first invariant applies to every one**: persist a `Capture` + a plain `Todo` *before* calling the extractor, so a failed extraction still leaves a usable todo.

1. **Screenshot / image.** Drop / paste / upload into the global dropzone → Gemini multimodal extraction → one or many structured todos auto-created (with `actionType` + `actionPayload` classified), each carrying a capture thumbnail.
2. **AI-enhanced quick add — typed or spoken.** Type in Quick Add (in `All`) **or tap the mic for dictate mode** (light, voice-only: speak one task → transcribe → same pipeline). Deterministic `parseQuickAdd` drives live inline highlight; Gemini enrichment runs in parallel to classify `actionType` and suggest due/priority/labels. *(Voice dictate is just this flow with voice input — distinct from the Chat agent, which converses.)*
3. **Forward an email.** Send mail to a unique alias `u_<id>@in.<domain>`; a **Postmark inbound** webhook maps alias→user and feeds subject + body + attachments through the **same** extractor. Asynchronous, server-side.

### Data model (ported from native; JSON-friendly)
`todos`: `id, createdAt, sourceCaptureId, title, detail, status(open|done|dismissed), actionType(none|meeting|reminder|research), actionPayload, actionState(none|proposed|done|failed), actionExternalId, dueAt, sortIndex(fractional), priority(none|p1|p2|p3), labelIds[], recurrence, parentId(one-level subtasks), reminderAt`.
`captures`: `id, createdAt, kind(image|text|file|email), blobPath, note`.
`views`: `id, name, colorHex, icon, sortIndex, criteria(JSON)`.
`labels`: `id, name(lowercased), colorHex`.

*(Full TS contracts in `proposed-contracts.md`; ground truth in `native-flow-contract-reference.md`.)*

## 4. Execution model — the hybrid line (key decision)

**Deterministic spine; agent only where it genuinely earns its cost.**

- The **to-do core is fully deterministic** and never waits on a model: capture→instant todo, store, list, drag, filters, subtasks, done/dismiss. The model is **never** in the hot path of the list.
- **Extraction is one LLM call, not an agent loop.** A single schema-constrained `generateObject` call (Zod schema, Gemini via `@ai-sdk/google`) parses image/text/email into `ExtractedTodo[]`. The *agent loop* (model picks tools, reacts) is reserved for chat / voice / "do it for me."
- **"Finish the todo" is a dispatch on `actionType`,** decided by a cheap classify-at-creation step:

| `actionType` | How "finish" runs | Why |
|---|---|---|
| `meeting` | **Deterministic** Google Calendar/Gmail invite (`events.insert` + `sendUpdates=all`) | Heavy parse done at creation; a side-effect to real people wants determinism |
| `reminder` | **Deterministic** scheduled reminder / notification | Trivial, bounded |
| `research` | **Agent** (multi-step Gemini loop: search → fetch → synthesize → write into `todo.detail`) | Open-ended; the only true agent in v1 |
| `none` | no offer | — |

- **Safety gate without an agent:** the offer **shows the concrete effect before the tap** ("Send invite to dakota@acme.com · Tue 2pm · 30m"). The tap *is* the confirmation. **One missing essential field** → a single inline question, deterministic.

### One capability, one fn, three callers (the agent-first seam)
Build each capability **once as a plain TS fn** (`extractTodos`, `createTodo`, `updateTodo`, `setReminder`, `sendMeetingInvite`, `deepResearch`), exposed three ways — only one involves the LLM:
- **Tap / form path** → calls the executor **directly** (NO LLM). Deterministic, testable.
- **Chat / voice path** → the same fn wrapped as an AI SDK `tool({ inputSchema, execute })`; the LLM picks tool + args (the agent loop). `extractTodos` is itself a tool, so chat can "parse this **and** book it."
- **Webhook path** (inbound email) → calls the executor **directly** (no agent routing).

**Read-tools** (`web_search`, `fetch`, `list_todos`, `check_calendar`) auto-run inside the agent; **write-tools** (`createTodo`, `setReminder`, `sendMeetingInvite`, `sendEmail`) are **gated** via the AI SDK's built-in approval (propose → show effect → approve → fire).

### Two flagship "do it for me" capabilities (both ship)
1. **Send a follow-up meeting invite** — Google Calendar/Gmail via Google OAuth. Mostly deterministic.
2. **Deep research on a topic** — the agent skill; writes a markdown report into the todo's detail. Zero auth dependency. Background async fn (raised `maxDuration` under Fluid Compute; progress to a job row / SSE). **No workflow engine in v0** — the WDK is a later upgrade behind the same `Executors` seam.

## 5. Architecture

```
Next.js (App Router, RSC) — tada-web                          domain: gettada.app (Vercel)
├─ UI ............... fresh Tada design system (Clawdia tokens copied; components built fresh), rust accent
│   ├─ App shell: Sidebar (All · Chat · Views[+]) | Content list (+ subtasks) | Detail pane | ⌘K
│   ├─ Capture: dropzone · quick-add (typed + dictate) · inbound email (server-side) — 3 co-equal sources
│   ├─ Chat (text, ChatGPT-like): useChat thread + composer (mic button), generative-UI tiles, gated approvals
│   ├─ Chat (voice): immersive stage (orb — Clawdia animation as first pass), iOS-call chrome
│   └─ Marketing landing (gettada.app) + OAuth sign-in/up — finished by frontend at the end
├─ Server (route handlers / server actions)
│   ├─ Extractor ........ image|text|email → {todos[] + actionType + actionPayload}  (Gemini, generateObject)
│   ├─ Inbound email .... POST /api/inbound/email: Postmark webhook → verify → alias→user → extractor
│   ├─ Enrichment ....... manual todo → offers + label/date proposals                (Gemini)
│   ├─ Executors ........ plain fns: sendMeetingInvite, setReminder, deepResearch (1 fn / 3 callers)
│   ├─ Agent ............ Vercel AI SDK tool-loop (Gemini via @ai-sdk/google); read auto, write gated
│   ├─ Voice session .... OpenAI Realtime (WebRTC); /api/voice/{session,tool,usage}; same AgentTool registry
│   ├─ Quota ............ withQuota() choke point around every model call (plan gating)
│   └─ Store ............ todos/views/labels/captures/subtasks (Prisma → Neon)
└─ Data ............. Neon Postgres (app + agent memory, pgvector) · Vercel Blob (capture images)
                      Auth.js accounts (Google refresh token) · no realtime service
```

### AI providers (cost-conscious — NO Claude)
| Job | Provider | Notes |
|---|---|---|
| Capture extraction (image→todos + classify) | **Gemini 2.5 Flash** via `@ai-sdk/google` + `generateObject` | Zod schema for `ExtractedTodo[]` |
| Manual-add enrichment / NL fallback | **Gemini 2.5 Flash** | offers, label/priority/date |
| Research agent | **Gemini 2.5 Pro** | AI SDK tool-loop, gated writes, background async |
| Voice loop | **OpenAI Realtime** (`gpt-realtime`, WebRTC) | Gemini stays the tool brain behind the orb |

**AI SDK surface (concrete):** extraction = `generateObject` with a **Zod** schema (the SDK emits the provider responseSchema for you — write Zod, not raw JSON schema); pass the image as `{type:'file', mediaType:'image'}` in the message content. Agent loop = `ToolLoopAgent` (or `generateText` + `tool()` + `stopWhen`). Voice tool-calls route into the same `tool()` registry.

Keys (gitignored `.env`): `GEMINI_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL` (Neon), Auth.js + Google OAuth creds, `BLOB_READ_WRITE_TOKEN`, Postmark token, `ADMIN_EMAILS` (admin allowlist — §6). The to-do core builds and runs **without** AI keys.

> **Env-var nuance (don't trip on this).** Our `GEMINI_API_KEY` is the newer **`AQ.`-prefixed** Gemini key (tested via the `X-goog-api-key` header). **`@ai-sdk/google` defaults to reading `GOOGLE_GENERATIVE_AI_API_KEY`**, so pass ours **explicitly** rather than relying on the default name: `createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY })`. Voice model is **`gpt-realtime`** (confirmed live on the account). Both keys are verified working.

### Design-system approach
Copy Clawdia's **token files verbatim** (`tokens.ts` + `tokens.generated.css` + `tokens/` + `styles.css`) — **no accent swap** (Clawdia's original sienna *is* our rust `#c8632e`; the manifest's indigo-swap is cancelled). Components (incl. the voice orb/stage) are **built fresh** using Clawdia as a feel reference — vendor a file only if it's genuinely faster. Token contract = CSS custom properties.

### Hosting / domain
Vercel project deployed to **`gettada.app`** (owned). The team provisions the project + domain via the **Vercel MCP/CLI**. Suggested split: marketing at the apex `gettada.app`, the app at `app.gettada.app` (architect confirms at setup).

## 6. Auth, data & accounts

- **No login wall in v0** — fully functional locally as a single implicit user; OAuth works e2e locally for integrations.
- **Auth = Auth.js (NextAuth), Google provider.** `access_type=offline` + `prompt=consent` → the Google `refresh_token` persists in the `accounts` table; **we refresh it ourselves** for the Gmail/Calendar executors. Auth.js owns *identity*; we own the *Google integration credential*.
- **Google OAuth (Gmail/Calendar) locally — no CASA blocker.** `localhost` redirect URIs allowed; scopes `calendar.events` + `gmail.send` (+ `calendar.readonly`). Testing mode + self as test user grants restricted scopes. Both flagship skills ship: research (zero auth) and the meeting invite (Google OAuth).
- **DB = Neon** (app data + agent memory; pgvector). Schema in **Prisma**, provider-neutral. **Captures = Vercel Blob** (signed direct uploads). **No realtime** — research progress polls a job row or pushes over SSE.
- **Clean seam:** a `currentUser()` boundary every query passes through.

### Invite codes (hand-rolled — gates account *creation*, once)
The code gates **account creation only.** The Auth.js `signIn` callback branches: existing user → admit (no code); brand-new user → require a valid pending invite or reject. Returning logins are plain Google forever. Invite link `/join?code=ABC` stashes the code in a cookie before the Google bounce (manual "have a code?" box as fallback).
- **Stored codes:** `invite_codes` table (`code`, `max_uses`, `used_count`, `expires_at`, `invited_email?`), `nanoid`-generated; **atomic redeem in the `signIn` callback** (`UPDATE … WHERE used_count<max_uses … RETURNING id`). Tie `invited_email` to a `waitlist` row.
- **Signed links (targeted):** HMAC/JWT `{email, exp}`; verify at signup, store nothing.
- **No admin UI for v0** — mint/revoke with `scripts/mint-invite.ts` (prints a code / `/join?code=` link).

### Admins & how to test sign-in
- **Admins via an `ADMIN_EMAILS` allowlist (env, comma-separated).** In the `signIn` callback, an email in `ADMIN_EMAILS` **bypasses the invite gate** and, on account creation, is assigned **`plan='unlimited'`**. This is the *only* way to get `unlimited` — there is no self-serve upgrade in v0.
- **Bootstrap admin = `seedzpy@gmail.com`.** Set `ADMIN_EMAILS=seedzpy@gmail.com` in `.env` → "Sign in with Google" works e2e with **no code** and unlimited AI. The full OAuth flow (consent → token → Gmail/Calendar) runs locally against `localhost`.
- **Non-admin testers** go through the real path: an invite code (from the mint script) → Google sign-in → `free`/`pro` plan. So the e2e *is* OAuth + invite-gating; admins are simply allowlisted past the gate.

### Plan gating / AI-call quotas
**Three plans: `free`, `pro`, `unlimited` — `unlimited` is admin-only** (granted via the `ADMIN_EMAILS` allowlist above; no self-serve upgrade in v0).
- **Credits, not raw calls:** `COST = { extractTodos:1, chatTurn:1, deepResearch:10 }`; `PLANS = { free:{50}, pro:{2000}, unlimited:{Infinity} }`.
- **Usage keyed by period ⇒ no cron.** Row PK `(user_id, period='2026-06')`; new month → no row → starts at 0.
- **Atomic conditional consume:** `UPDATE ai_usage SET used = used + $cost WHERE … AND used + $cost <= $limit RETURNING used`.
- **One choke point:** `withQuota(user, capability, run)` around every model call. Reserve+refund for `deepResearch`. **402** (quota) vs **429** (burst).
- Optional later: Upstash Ratelimit (burst), Vercel AI Gateway (spend). Scaling note in `stack-decisions.md` Q6.

## 7. Chat — the text + voice agent

A dedicated **`Chat`** tab in the sidebar (a destination, not a filter-View), home of the conversational agent. **Closer to ChatGPT than to Clawdia:** you land in a text thread, and a **mic button in the composer** drops you into a distinct voice mode. Two designs, one entry point — not a same-surface mic toggle, and not two separate places you navigate to.

### Text chat (the default — ChatGPT-like)
- **Design:** a familiar **text thread + composer**, *not* a Clawdia-styled surface — clean message blocks, generous whitespace, our rust/cream tokens and serif accents for warmth. The composer carries the **mic button** that enters voice mode. Serif empty-state + suggestion cards ("What's due today?", "Plan my afternoon", "Research <topic>", "Book a follow-up with <name>").
- **What it does:** talk *about* todos and *act on* them — query, create/update (incl. subtasks), and trigger "do it for me." Shared **AgentTool registry** over the **Vercel AI SDK** (`useChat`, streaming).
- **Generative-UI tiles:** tools return React components — a **todo tile**, an **offer/confirmation card**, a **research-progress tile** — not just text.
- **Gated writes:** inline **Approve / Deny** before any write fires.
- **Memory:** agent memory in Neon (pgvector) for continuity across sessions.

### Voice chat (entered via the composer mic)
- **Design:** a distinct **immersive stage** — full-bleed, an animated **orb**, minimal chrome, iOS-call-style Mute/End + minimize, an optional single showcased card. **No transcript log during the call**; it builds silently and returns to the text thread on hang-up. **The orb animation may copy Clawdia's `SpiroOrb` as a first pass** (then iterate); everything else is ours.
- **Engine:** **OpenAI Realtime over WebRTC** (`/api/voice/{session,tool,usage}` — ephemeral-secret mint server-side). The **same** Gemini AgentTool registry is the brain; write-tools stay gated before firing.
- **Distinct from quick-add dictate** (§3), which is light, single-shot capture in the add card with no agent loop.

## 8. Build phasing (a coherent spine always lands; team builds it all)

The team builds **every phase** autonomously. Phasing is sequencing, not a stopping point.

1. **P0 — spine:** design-system setup (Clawdia tokens, rust), app shell (All / Chat shell / Views / detail / ⌘K), todo CRUD, **subtasks (one-level UI)**, NL parse + live highlight, filters, drag-reorder, labels, recurrence, Done.
2. **P1 — capture (3 co-equal sources):** image dropzone → Gemini `generateObject` multi-todo extraction + classify + thumbnail; quick-add enrichment **incl. dictate**; (email lands in P2.5). All through the shared `ExtractorClient`.
3. **P2 — the Tada:** dispatch-on-`actionType`. **Deep research** (zero auth) **and** the **deterministic meeting invite** (Google OAuth) both ship. Reminders. Offer→executed loop, gated writes. `withQuota` wraps every model call from here.
4. **P2.5 — email capture:** per-user alias + `POST /api/inbound/email` (**Postmark**) → verify → alias→user → same `ExtractorClient`.
5. **P3 — Chat (text + voice):** the text thread (`useChat`, tiles, gated approvals) and the immersive voice stage (OpenAI Realtime/WebRTC), both over the shared tool registry. Invite-code gating + Auth.js accounts land alongside.
6. **P4 — landing + sign-in (frontend finishes it):** make `design/landing-preview/` live at `gettada.app`; **convert the waitlist CTAs (top-right + final section) into OAuth sign-in/up** (Auth.js Google, invite-gated; no-invite → `/api/waitlist` capture). Done by the frontend at the end — **no separate marketing teammate**.

## 9. Explicitly out of scope for v0
- Multi-user / collaboration (assignees, comments, shared views).
- **Multi-level** subtask nesting (v0 is one level).
- Board (kanban) / calendar-grid layouts — list-first.
- A filter query language, analytics/karma.
- Browser-extension capture (fast-follow).
- A workflow engine (WDK) — deep research is a plain background async fn in v0.
- An admin UI for invites/plans — scripts only.
- Any Claude/Anthropic model usage in the product runtime.

## 10. Build team & process (autonomous build)

A coordinated agent team builds the **whole product without further prompting** — everything in this spec ships, regardless of timeframe (build-time quality spend on Opus-class models — unrelated to the product's Gemini/runtime choice; model set per role). Coding roles at high effort.

| Agent | Owns | Notes |
|---|---|---|
| **Architect** | Freezes **invariants + contracts** first; sets up the design system (Clawdia tokens, rust); scaffolds (Next.js + Prisma/Neon + Auth.js + Vercel Blob + env seams); **provisions Vercel + `gettada.app` via MCP/CLI** | Contracts = data model (incl. subtasks), `ExtractorClient`, `AgentTool`/executor signatures, front↔back API shapes, token contract. Sequence the token setup early so frontend + marketing unblock. |
| **Frontend** | The app: shell (All/Chat/Views/detail/⌘K), todo UI **+ subtasks**, capture dropzone + dictate, **text-chat design + voice-chat design**; **at the very end, makes `design/landing-preview/` live at `gettada.app` and converts the waitlist CTAs (top-right + final section) into OAuth sign-in/up** | Owns the app *and* the final landing wire-up. No separate marketing teammate. |
| **Backend** | Extractor, enrichment, executors, research agent, voice relay, quota, store | Parallel with frontend **after** contracts are frozen |
| **Reviewer** | Per-phase review (after P0, P1, P2, …) | Prompt: **"report every finding with confidence + severity; filter downstream"** — conservative filters drop recall |

**Process mapping (superpowers):** spec review → `writing-plans` (architect: spec → frozen plan + contracts) → `subagent-driven-development` / `executing-plans` (frontend + backend in parallel; marketing in its own lane) → `requesting-code-review` per phase.

**Invariant discipline (from the native build):** the architect's frozen contracts are **law** — implementers fill in bodies, never silently change a frozen signature; if one seems wrong, flag the architect. This kept the native app's build coherent without a human in the loop.
