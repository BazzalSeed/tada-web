# Tada Web — v0 Design

> **Status:** Draft for review. Rough shape agreed 2026-06-24; **stack + product-shape revision 2026-06-26** (this update). The `docs/superpowers/prep/` pack is the newer source of truth for stack/agent decisions — this spec folds those in.
>
> **One-liner:** Todoist's to-do *flow* (ported from the native Tada app) + Tada's capture-first AI + a real "do it for me" layer + a chat/voice agent mode — as a local-first web app. **Not to-do. Ta-da.**

## 0. Decisions snapshot (for quick review)

**Locked:**
- Build the full app **except** a polished marketing site (a simple landing only).
- **Flow = native Tada's exact model:** one flat tagged pool, `All` is the single add surface, everything else is a read-only filter-View. *(Not Todoist's nesting, not Clawdia's complexity.)*
- **Stack (revised 2026-06-26):** Next.js (App Router/RSC), **TypeScript only — no Python.** **Neon** (serverless Postgres — app data + agent memory; pgvector). **Auth.js (NextAuth)** Google OAuth. **Vercel Blob** for capture images. **No realtime service** (the AI SDK streams; research progress polls/SSE). Vercel hosting.
- **AI runtime = Vercel AI SDK** (`ai` + `@ai-sdk/google`), provider-agnostic, runs Gemini. Extraction = a single schema-constrained `generateObject` call; the "do it for me" / chat / voice brain = the AI SDK tool-use loop with **built-in human-in-the-loop approval** on gated write-tools. **No workflow engine in v0.** "No agent SDK" only ever meant the **Claude** Agent SDK.
- **AI providers (NO Claude/Anthropic — cost):** **Gemini** for all image+text (`gemini-2.5-flash` extract/enrich, `gemini-2.5-pro` research); **OpenAI Realtime** for voice.
- **Execution model:** hybrid — **deterministic to-do spine; agent only where it earns it.** "Finish the todo" dispatches on `actionType`: meetings/reminders deterministic, **research is the only true agent.**
- **One capability = one fn, three callers:** each executor is a plain TS fn called **directly** by the tap path and the inbound-email webhook (no LLM), and wrapped as a **gated AI SDK tool** for chat/voice.
- **Never auto-execute a side effect.** Every write action shows its concrete effect and fires only on an explicit user action (tap or confirmed tool-call).
- **Accent = rust `#c8632e`** on the warm Clawdia cream substrate (the locked design system — **not** indigo). Auto dark mode via `prefers-color-scheme`.
- **Auth:** no login wall locally (implicit user); Google OAuth works e2e locally for integrations. Account creation is gated by a hand-rolled **invite code**. AI usage is gated by **plan** (free / pro / unlimited).

**Open (settle at build start — see §10):**
- Lead with **research-only** (zero auth) or also ship **Gmail invites** (Google OAuth) on night one.
- Exact Gemini model IDs + AI SDK surface (`responseSchema` vs `responseJsonSchema`); OpenAI Realtime browser-session shape (confirm via Context7).
- Inbound-email provider for hero flow #3.
- Which Clawdia primitives to vendor vs. rebuild.

## 1. North star

Two reasons to exist that Todoist can't match:

1. **Capture is the hero.** Screenshot / paste / drag an image → AI extracts **one or many** structured todos in one shot. Typing is AI-enhanced too (and you can **dictate** or **forward an email**). Todoist makes you type and file; Tada makes you capture and it files for you.
2. **It does the task for you** — the "Tada." The offer resolves into a **real executed action** (meeting invite, reminder, deep research), gated by one explicit tap. Not "remind me to book it" — *book it.*

The **All + Views** IA from native Tada is the organizing substrate, deliberately **simpler than Clawdia and simpler than Todoist**.

## 2. Experience model & visual references

What a teammate should picture before building. We are modeling the *experience* after two things, with a third as the look-and-feel guide.

### Target layout — the three-pane shape (Todoist web ∩ native Tada)
Both Todoist's web app and native Tada converge on the same shape; that is our target:

```
┌────────────┬───────────────────────────┬──────────────┐
│  Sidebar   │      Content list         │  Detail pane │
│            │                           │  (slides in  │
│  All       │  + Add task (All only)    │   on select) │
│  Ask  ▸    │  ─────────────────        │              │
│  Today     │  ◐ todo · chips · offer   │  title       │
│  Views [+] │  ◐ todo …                 │  notes (md)  │
│   • work   │  ▾ Done (scoped)          │  properties  │
│   • errand │                           │  the offer   │
│            │                           │  capture img │
└────────────┴───────────────────────────┴──────────────┘
                      ⌘K command palette / quick-find
```
Keyboard-first, inline editing, instant — the model is **never** in the hot path of the list.

### What we borrow from Todoist (web)
- NL **quick-add** with live token parsing (`p1`, `@label`, `#view`, dates, `every …`).
- **Three-pane density** and the calm list-first reading rhythm.
- **Today / upcoming** framing and a `⌘K`-style palette.
- Keyboard-first interaction; inline property editing via popovers.

**What we deliberately drop** (see §9): deep nesting, board/kanban + calendar-grid, a filter query language, analytics/karma.

### What is pure native Tada
The **flat-pool + read-only filter-View flow**, **capture-first**, and **do-it-for-me** are native Tada's identity, not Todoist's. Two ground-truth references:
- **Source:** `~/projects/tada` (Swift — `App/`, `Sources/TadaUI`, `Sources/TadaModels`, `Sources/TadaExtractor`, `Sources/TadaExecution`).
- **Contract:** `docs/superpowers/prep/native-flow-contract-reference.md` — a near 1:1 port spec (data model, filter logic, quick-add parsing, offer states, add-card flow). Treat it as the behavioral law for the spine.

### Look & feel = the marketing site
The product should feel like the landing page kept its promise. Use the marketing site as the living look/touch/tone guide:
- **Reference artifact:** `design/landing-preview/index.html` (+ `screenshots/desktop.png`, `screenshots/mobile.png`).
- Warm cream substrate `#f0ece3` (light) / graphite `#1b1a18` (dark), **rust accent `#c8632e`**, EB Garamond display + Geist body + Caveat script wordmark. Glass cards; soft raised surfaces for active/selected state — **never a heavy black fill** (the highlight philosophy from `~/projects/bazzalseed.github.io`).
- Calm, capture-first voice: plain verbs, sentence case, the "Ta-da" delight reserved for the moment an action actually completes.

## 3. The exact flow (ported 1:1 from native Tada)

**One flat tagged pool. One add surface. Everything else is a filter-view.** (Source: `~/projects/tada/Sources/TadaUI/.../SidebarView.swift`, `ViewsViewModel.swift`, `MainWindowView.swift`; frozen in `native-flow-contract-reference.md`.)

- **Sidebar:** `All` (single home, the **only** place you add) · **`Ask`** (the chat/voice agent — a destination, *not* a filter-View; see §7) · **Views** `[+]` → `Today` (prebuilt `dateWindow=today`) + user `SavedView`s (named/icon'd/color'd persisted `FilterCriteria`). Labels are **not** nav — created inline while tagging; surfaced via Views or a quick label-tap.
- **Views are read-only filters.** The add card + inline "+ Add task" render **only in All**; capture always lands in All and snaps selection back.
- **FilterCriteria (shallow, no query language):** `labelIds` (any-of) · `minPriority` · `dateWindow` (`any|today|overdue|next7|noDate`) · `includeCompleted`.
- **Content list:** open todos + collapsible **Done** (scoped to the view) · drag-reorder (fractional index). Row: priority circle · title · meta chips (due · priority · `#labels`) · detail · "Reading…" state · **do-it-for-me offer** · dismiss.
- **Detail pane** slides in on select: title, markdown notes, priority/due/labels, the offer, source-capture thumbnail.
- **`⌘K`** command palette / quick-find.

### Capture — the hero flows
Capture is the product. All capture paths feed **one shared extractor** (`ExtractorInput → ExtractorClient.extract() → ExtractedTodo[]`, see `proposed-contracts.md`); they differ only in how the input is assembled. The **capture-first invariant applies to every one**: persist a `Capture` + a plain `Todo` *before* calling the extractor, so a failed extraction still leaves a usable todo.

1. **Screenshot → auto task (flagship).** Drop / paste / upload an image into the global dropzone → Gemini multimodal extraction → one or many structured todos auto-created (with `actionType` + `actionPayload` classified), each carrying a source-capture thumbnail. Zero-friction.
2. **Manual, AI-enhanced add — typed or dictated.** The user types in Quick Add (in `All`) **or taps the mic for dictate mode** (light, voice-only; speak one task → transcribe → same pipeline). Deterministic `parseQuickAdd` handles tokens for live inline highlight; Gemini enrichment runs in parallel to classify `actionType` and suggest due/priority/labels. A plain todo lands instantly from the parse, then enrichment proposes offers + refinements. *(Voice dictate is a modality of this flow — "a voice note is one version of quick add" — not the chat agent; it does not converse.)*
3. **Forward an email → tasks (fast-follow, P2.5).** The user forwards mail to a unique inbound alias `u_<id>@in.<domain>`; an inbound-email webhook maps alias→user and feeds subject + body + attachments through the **same** extractor. Asynchronous, server-side. Provider TBD (see `build-decisions.md` §7).

### Add-task UX (AI-enhanced manual path)
Live NL parse + inline highlight (port of `QuickAddParser.swift`): `p1/p2/p3`, `@label`, `#view`, `today/tomorrow/tmr/<weekday>/<ISO>`, `every day/week/<weekday>`. On submit → create plain todo immediately → async Gemini enrichment proposes offers + label/priority/date refinements. The mic toggles **dictate mode** (transcribe → fill the same field).

### Data model (ported from native; JSON-friendly)
`todos`: `id, createdAt, sourceCaptureId, title, detail, status(open|done|dismissed), actionType(none|meeting|reminder|research), actionPayload, actionState(none|proposed|done|failed), actionExternalId, dueAt, sortIndex(fractional), priority(none|p1|p2|p3), labelIds[], recurrence, parentId(one-level subtasks), reminderAt`.
`captures`: `id, createdAt, kind(image|text|file|email), blobPath, note`.
`views`: `id, name, colorHex, icon, sortIndex, criteria(JSON)`.
`labels`: `id, name(lowercased), colorHex`.

*(Full TS contracts in `proposed-contracts.md`; ground truth in `native-flow-contract-reference.md`.)*

## 4. Execution model — the hybrid line (key decision)

**Deterministic spine; agent only where it genuinely earns its cost.**

- The **to-do core is fully deterministic** and never waits on a model: capture→instant todo, store, list, drag, filters, done/dismiss. The model is **never** in the hot path of the list.
- **Extraction is one LLM call, not an agent loop.** "Deterministic" here means *fixed control flow* — a single schema-constrained `generateObject` call (still Gemini) parsing image/text/email into `ExtractedTodo[]`. The *agent loop* (model picks tools, reacts) is reserved for chat / voice / "do it for me."
- **"Finish the todo" is a dispatch on `actionType`,** decided by a cheap classify-at-creation step — not a blanket agent call:

| `actionType` | How "finish" runs | Why |
|---|---|---|
| `meeting` | **Deterministic** Google Calendar/Gmail invite (`events.insert` + `sendUpdates=all`) | Heavy parse already done at creation; a side-effect sent to real people wants determinism |
| `reminder` | **Deterministic** scheduled reminder / notification | Trivial, bounded |
| `research` | **Agent** (multi-step Gemini loop: search → fetch → synthesize → write into `todo.detail`) | Genuinely open-ended; the only true agent in v1 |
| `none` | no offer | — |

- **Heavy parsing/classification moves to todo-creation time.** The extractor outputs `actionType` + a structured `actionPayload` (e.g. a complete meeting: attendees, time, duration, title), so most "finish" actions are fully specified before the user taps.
- **Safety gate without an agent:** the offer **shows the concrete effect before the tap** ("Send invite to dakota@acme.com · Tue 2pm · 30m"). The tap *is* the confirmation. **One missing essential field** → a single inline question, deterministic — never a form, never an agent.

### One capability, one fn, three callers (the agent-first seam)
Build each capability **once as a plain TS fn** (`extractTodos`, `createTodo`, `updateTodo`, `setReminder`, `sendMeetingInvite`, `deepResearch`), then expose it three ways — only one involves the LLM:
- **Tap / form path** → calls the executor **directly** (NO LLM — the UI already knows tool + args). Deterministic, cheap, testable.
- **Chat / voice path** → the same fn wrapped as an AI SDK `tool({ inputSchema, execute })`; here the LLM picks tool + args (the agent loop). `extractTodos` is itself a tool, so chat can "parse this **and** book the meeting."
- **Webhook path** (inbound email) → calls the executor **directly** (no agent routing).

So the agent + shared tool registry exists and is reused across tap / chat / voice, but the tap path bypasses the LLM whenever intent is already known. **Read-tools** (`web_search`, `fetch`, `list_todos`, `check_calendar`) auto-run inside the agent; **write-tools** (`createTodo`, `setReminder`, `sendMeetingInvite`, `sendEmail`) are **gated** via the AI SDK's built-in human-in-the-loop approval (propose → show effect → approve → fire).

### Two flagship "do it for me" capabilities
1. **Send a follow-up meeting invite** — Google Calendar/Gmail via Google OAuth. *Mostly deterministic* (classify→invite); agent only for fuzzy/multi-step asks.
2. **Deep research on a topic** — the agent skill; writes a markdown report into the todo's detail. **Zero auth dependency.** Runs as a background async fn (raised `maxDuration` under Fluid Compute; progress to a job row / SSE). **No workflow engine in v0** — the Workflow Development Kit is a later upgrade behind the same `Executors` seam.

## 5. Architecture

```
Next.js (App Router, RSC) — tada-web
├─ UI ............... vendored & rebranded Tada design system (ex-@clawdia/ui), rust accent
│   ├─ App shell: Sidebar (All · Ask · Views[+]) | Content list | Detail pane | ⌘K palette
│   ├─ Capture: dropzone (HERO) · manual add card (typed + dictate) · inbound email (server-side)
│   ├─ Chat: the `Ask` tab — useChat stream, generative-UI tiles, gated write approvals
│   ├─ Voice: SpiroOrb VoiceStage call mode inside the chat tab (rebranded)
│   └─ Simple landing + Auth.js sign-in — NOT a full marketing site
├─ Server (route handlers / server actions)
│   ├─ Extractor ........ image|text|email → {todos[] + actionType + actionPayload}  (Gemini, generateObject)
│   ├─ Inbound email .... POST /api/inbound/email: verify sig → alias→user → extractor
│   ├─ Enrichment ....... manual todo → offers + label/date proposals                (Gemini)
│   ├─ Executors ........ plain fns: sendMeetingInvite, setReminder, deepResearch (1 fn / 3 callers)
│   ├─ Agent ............ Vercel AI SDK tool-loop (Gemini provider); read auto, write gated
│   ├─ Voice session .... OpenAI Realtime relay; same AgentTool registry as the brain
│   ├─ Quota ............ withQuota() choke point around every model call (plan gating)
│   └─ Store ............ todos/views/labels/captures (Prisma → Neon)
└─ Data ............. Neon Postgres (app + agent memory, pgvector) · Vercel Blob (capture images)
                      Auth.js accounts (Google refresh token) · no realtime service
```

### AI providers (cost-conscious — NO Claude)
| Job | Provider | Notes |
|---|---|---|
| Capture extraction (image→todos + classify) | **Gemini Flash** (multimodal) via AI SDK `generateObject` | structured output for the `ExtractedTodo[]` contract |
| Manual-add enrichment / NL fallback | **Gemini Flash** | detect offers, propose label/priority/date |
| Research agent | **Gemini Pro** | AI SDK tool-loop, gated writes, background async |
| Voice loop | **OpenAI Realtime** (`gpt-realtime`) | Gemini stays the tool brain behind the orb |

Keys (gitignored `.env`): `GEMINI_API_KEY`, `OPENAI_API_KEY`, `DATABASE_URL` (Neon), Auth.js + Google OAuth creds, `BLOB_READ_WRITE_TOKEN`. The to-do core builds and runs **without** AI keys.

### Design-system port
Copy what we want from `~/projects/clawdia-marketing-agent/packages/ui` into tada-web and **rebrand to stand alone** (strip every "Clawdia" name; vendor the generated token CSS/TS — we do **not** wire their Python `tokens.py` pipeline; swap accent to rust). Reuse especially `SpiroOrb` + `VoiceStage`; build the todo-specific UI fresh. Token contract = CSS custom properties holding all tokens.

## 6. Auth, data & accounts

- **No login wall in v0** — fully functional locally as a single implicit user. But **OAuth works end-to-end locally** for integrations.
- **Auth = Auth.js (NextAuth), Google provider.** Request `access_type=offline` + `prompt=consent` so the Google `refresh_token` persists in the `accounts` table; **we refresh it ourselves** against `oauth2.googleapis.com/token` for the Gmail/Calendar executors (rotate in the `jwt`/`session` callback). Auth.js owns *identity*; we own the *Google integration credential*.
- **Google OAuth (Gmail/Calendar) locally — works, no CASA blocker.** `http://localhost` redirect URIs allowed; scopes `calendar.events` + `gmail.send` (+ `calendar.readonly`). **Testing** mode + self as test user grants restricted scopes immediately; CASA is a production-scale concern. Start with a standalone **"Connect Google"** integration on the implicit user; fold into a unified "Sign in with Google that also grants Gmail/Calendar" when Auth.js lands.
- **DB = Neon** (serverless Postgres; app data + agent memory; pgvector). Keep the schema in **Prisma**, provider-neutral; P0 can run plain docker-compose Postgres and switch to Neon by connection string when the first integration lands. **Captures = Vercel Blob** (signed direct-from-browser uploads). **No realtime** — stream via the AI SDK; research progress polls a job row or pushes over SSE.
- **Clean seam:** a `currentUser()` boundary every query passes through, so single-implicit-user today → multi-user later reshapes nothing in the data layer.

### Invite codes (hand-rolled — gates account *creation*, once)
The code gates **account creation only, not every sign-in.** OAuth has no separate signup/login button; the Auth.js `signIn` callback branches: existing user → admit (no code); brand-new user → require a valid pending invite or reject. Returning logins are plain Google forever. The user rarely types the code — they click an invite link `/join?code=ABC` that stashes it in a cookie before the Google bounce (with a manual "have a code?" box as fallback).
- **Stored codes (shareable):** `invite_codes` table (`code`, `max_uses`, `used_count`, `expires_at`, `invited_email?`), generated with `nanoid`. Pre-check on the landing for UX; **authoritative atomic redeem in the `signIn` callback** — `UPDATE invite_codes SET used_count = used_count+1 WHERE code=$1 AND used_count<max_uses AND (expires_at IS NULL OR expires_at>now()) RETURNING id` (no row ⇒ reject). `max_uses` = 1 (personal) / N (shared beta). Tie `invited_email` to a `waitlist` row for a waitlist → invite → signup funnel.
- **Signed invite links (targeted):** email an HMAC/JWT `{email, exp}`; verify signature + email at signup, store nothing.
- **No admin UI for v0** — mint/revoke with a script (or a route guarded by the `unlimited` plan).

### Plan gating / AI-call quotas
**Three plans: `free`, `pro`, `unlimited` — `unlimited` is admin-only** (it bypasses the meter). Two separable concerns: **plan quota** (billing-grade, monthly, source of truth = Neon) vs. optional **burst rate-limit** (abuse, ephemeral, Redis).
- **Meter in credits, not raw calls** (research ≫ extract): `COST = { extractTodos:1, chatTurn:1, deepResearch:10 }`; `PLANS = { free:{monthlyCredits:50}, pro:{monthlyCredits:2000}, unlimited:{monthlyCredits:Infinity} }`.
- **Usage keyed by period ⇒ no cron, no reset.** Row PK `(user_id, period)` where `period='2026-06'`; a new month → no row yet → starts at 0. "Reset" is implicit in the key.
- **Atomic conditional consume** (race-safe): ensure the row (`INSERT … ON CONFLICT DO NOTHING`), then `UPDATE ai_usage SET used = used + $cost WHERE user_id=$1 AND period=$2 AND used + $cost <= $limit RETURNING used` — no row ⇒ over limit, reject. `limit` from `PLANS[user.plan]`; admins short-circuit before the check.
- **One choke point:** a `withQuota(user, capability, run)` wrapper around every model call (tap/chat/voice all inherit it). **Reserve + refund** for `deepResearch`. Return **402** (quota → show upgrade) vs **429** (burst → slow down).
- **Optional later:** Upstash Ratelimit for short-window burst; Vercel AI Gateway for cross-provider spend observability. Scaling note (the per-call `UPDATE` is fine well beyond v0; Redis escape hatch documented, not built) — see `stack-decisions.md` Q6.

## 7. Chat & voice — the `Ask` agent

A dedicated **chat tab** in the sidebar (`Ask`), not a filter-View. It is the home of the conversational agent and its voice mode.

### Chat tab (text)
- **What it does:** talk *about* your todos and *act on* them — query ("what's overdue?", "what did I capture from that email?"), create/update todos, and trigger "do it for me." Backed by the shared **AgentTool registry** (§4) over the **Vercel AI SDK** (`useChat`, streaming).
- **Generative UI tiles:** tools return React components, so the agent answers with a **todo tile**, an **offer/confirmation card**, or a **research-progress tile** — not just text.
- **Gated writes:** write-tools surface the AI SDK's **approval prompt** (Approve / Deny) inline before firing — the "never auto-execute a side effect" invariant, built in.
- **Empty state:** serif prompt + suggestion cards ("What's due today?", "Plan my afternoon", "Research <topic>", "Book a follow-up with <name>"). Calm, capture-first tone.
- **Memory:** agent memory lives in Neon (pgvector) so the assistant has continuity across sessions.

### Voice mode (inside the chat tab)
- A mic / call control in `Ask` drops into the immersive **SpiroOrb `VoiceStage`** (vendored from Clawdia, rebranded rust): particle cloud (connecting) → gathered rosette (listening) → speaking, with an optional single showcased card; iOS-style Mute/End + minimize. No chat log *during* the call; the transcript builds silently and returns to the chat thread on hang-up.
- Wired to **OpenAI Realtime**; the **same** Gemini AgentTool registry is the brain — it can read/modify tasks and trigger the same gated executors the tap path uses (write-tools still confirmed before firing).
- **This is the only home for immersive voice.** It is distinct from **quick-add dictate** (§3, hero flow #2), which is light, single-shot capture in the add card with no agent loop.

## 8. Build phasing (a coherent spine always lands)

1. **P0 — spine:** design-system port/rebrand (rust), app shell (All / Ask shell / Views / detail / ⌘K), todo CRUD, NL parse + live highlight, filters, drag-reorder, labels, recurrence, Done section. *A real Todoist-feel to-do app, themed.*
2. **P1 — hero capture (flows 1 & 2):** paste/drag/upload → Gemini multimodal `generateObject` → **multi-todo** extraction + `actionType`/`actionPayload` classify + capture thumbnail; manual-add enrichment **incl. dictate mode**. Both through the shared `ExtractorClient`.
3. **P2 — the Tada:** dispatch-on-`actionType` finish. **Deep research agent first** (zero auth). Then **deterministic meeting invite** once the Google OAuth seam exists. Reminders. Offer→executed loop, gated writes. Plan gating (`withQuota`) wraps every model call from here.
4. **P2.5 — forward-an-email capture (hero flow #3, fast-follow):** per-user alias + `POST /api/inbound/email` webhook → verify signature → alias→user → same `ExtractorClient`. Depends on per-user identity (auth) + inbound-email infra (provider open).
5. **P3 — chat & voice (`Ask`):** chat tab (`useChat`, tiles, gated approvals) over the shared tool registry; then `VoiceStage` voice mode over OpenAI Realtime. Invite-code gating + Auth.js accounts land alongside (chat/voice quota needs a real user).
6. **P4 — landing:** simple landing page + Auth.js sign-in + `POST /api/waitlist` (own `waitlist` table in Neon). Not a polished marketing site.

## 9. Explicitly out of scope for v0
- Multi-user / collaboration (assignees, comments, shared views).
- Polished marketing site.
- Board (kanban) / calendar-grid layouts — list-first like native Tada.
- Deep nesting, a filter query language, analytics/karma.
- Browser-extension capture (fast-follow).
- A workflow engine (WDK) — deep research is a plain background async fn in v0.
- An admin UI for invites/plans — scripts only.
- Any Claude/Anthropic model usage in the product runtime.

## 10. Open decisions to settle at build start
1. **Skill scope night one:** research-only (zero auth) vs. also ship Gmail invites (Google OAuth).
2. **One Google flow vs two:** standalone "Connect Google" on the implicit user first vs. a unified "Sign in with Google" that also grants Gmail/Calendar when Auth.js lands. *(Recommended: start standalone — see `build-decisions.md` §6.)*
3. **Gemini model IDs + AI SDK surface** (`responseSchema` vs `responseJsonSchema`) — confirm via Context7.
4. **OpenAI Realtime browser-session/relay shape** — confirm via Context7 / the Clawdia port.
5. **Which Clawdia primitives** to vendor vs. rebuild (audit `packages/ui` at port time).
6. **Inbound-email provider** for hero flow #3 (Postmark inbound is the lean default — see `build-decisions.md` §7). Deferred to P2.5.

## 11. Build team & process (overnight)

A coordinated agent team (build-time quality spend on Opus-class models — unrelated to the product's Gemini/runtime choice; model is set per role). Coding roles at high effort.

| Agent | Owns | Notes |
|---|---|---|
| **Architect** | Freezes **invariants + contracts** first; ports/rebrands the design system (rust); scaffolds (Next.js + Prisma/Neon + Auth.js + Vercel Blob + env seams) | Contracts = data model, `ExtractorClient`, `AgentTool`/executor signatures, front↔back API shapes, design-token contract. **Sequence the token port early** so frontend *and* marketing unblock. |
| **Frontend** | The app: shell (All/Ask/Views/detail/⌘K), todo UI, capture dropzone + dictate, chat/voice | Stays 100% on the app; does **not** touch the landing |
| **Backend** | Extractor, enrichment, executors, research agent, voice relay, quota, store | Runs in parallel with frontend **only after** contracts are frozen |
| **Marketing** | The public front door: one polished landing + sign-in/waitlist entry | Independent lane; soft-depends on design tokens. A great landing, not a sprawling site |
| **Reviewer** | Per-phase review (after P0, P1, P2, …) | Prompt: **"report every finding with confidence + severity; filter downstream"** — conservative filters drop recall |

**Process mapping (superpowers):** spec review → `writing-plans` (architect: spec → frozen plan + contracts) → `subagent-driven-development` / `executing-plans` (frontend + backend in parallel; marketing in its own lane) → `requesting-code-review` per phase.

**Invariant discipline (from the native build):** the architect's frozen contracts are **law** — implementers fill in bodies, never silently change a frozen signature; if one seems wrong, flag the architect. This is what let the native app's overnight build stay coherent without a human in the loop.
