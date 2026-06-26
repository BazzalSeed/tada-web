# Stack decisions — waitlist, Postgres, app architecture

> **⚠️ REVISION 2026-06-26 (user decision) — supersedes Q2 below and parts of the Net stack.** The DB/Auth/Storage stack changed: **Supabase is dropped.** Use **Neon** (serverless Postgres — app data + agent memory; pgvector available), **Auth.js (NextAuth)** for Google OAuth, and **Vercel Blob** for capture-image storage. **No realtime service** (AI SDK streams; poll/SSE for research progress). The Q2 section's *reasoning* is kept for history but its recommendation (Supabase) is **no longer in effect**. Agent-runtime additions (durable workflows, plan gating, invite codes) are captured in the new **§Q4–Q6 addendum** at the bottom. Everything else (Q1 waitlist, Q3 monolingual TS) stands.
>
> Decision memo (2026-06-25). Three connected infra questions for Tada Web. Each: **Recommendation → Why → Trade-offs → What to confirm.** Verified against current docs via Context7 (Neon serverless driver, Vercel AI SDK + Workflow Development Kit, Vercel Fluid Compute durations + `waitUntil`/cron).
>
> Locked facts assumed: Vercel hosting · Next.js App Router for the app · Gemini for all image+text · OpenAI Realtime for voice · **no Claude / no Claude Agent SDK** — the **Vercel AI SDK** is the agent runtime (provider-agnostic, runs Gemini; see Q3) · deterministic to-do spine, research = the only true agent loop (can run minutes) · captures include images (need blob storage → **Vercel Blob**) · Google OAuth (via **Auth.js**) for Gmail/Calendar + user sign-in · Postgres = **Neon**.

---

## Q1 — Waitlist email collection: own DB endpoint vs Resend

### Recommendation
**Own the data, rent the send.** Store signups in **our own Postgres `waitlist` table** via a real serverless endpoint (`POST /api/waitlist`) — that table is the source of truth. Do **not** adopt Resend Audiences as the store. When launch comes, use a transactional email service (Resend) purely as the **send transport**: `SELECT email FROM waitlist` → batch send. This is the hybrid, and it's the cleanest path: one owned table now, zero send dependency until the day you actually email people.

The user's instinct is correct — Resend Audiences is overkill as a store when Postgres already exists. The only thing a raw DB row can't do is *send*, and that's a launch-day concern, not a signup-time one. So defer the send dependency entirely and keep collection trivial.

### Why
- **You already have Postgres** (Q2). Adding a `waitlist` table is one migration; no new vendor, no new SDK, no data living in someone else's audience list.
- **You own the data** — export, segment, dedupe, GDPR-delete, and join against real users at launch, all in SQL. Resend Audiences would make the email list a second source of truth you'd have to reconcile.
- **The send is a one-time event.** You don't need a managed audience to send one launch broadcast. At launch, pull emails from the table and hand them to Resend's batch send API (or any ESP). Picking the ESP can wait until launch week.
- **The endpoint is tiny** (~25 lines) and runs as a normal Vercel function. The marketing landing stays static `index.html`; it just POSTs to `/api/waitlist`.

### Minimal `waitlist` schema
```sql
CREATE TABLE waitlist (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  email_norm  text GENERATED ALWAYS AS (lower(trim(email))) STORED,
  source      text,                          -- utm / referrer, optional
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX waitlist_email_norm_uniq ON waitlist (email_norm);
```
Unique index on the normalized email gives idempotent signups for free (re-submitting the same address is a no-op, not an error).

### Endpoint sketch (~25 lines, Neon serverless driver — see Q2)
```ts
// app/api/waitlist/route.ts   (Next.js App Router) — or api/waitlist.ts on the static landing
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let email: string, source: string | undefined;
  try { ({ email, source } = await req.json()); }
  catch { return json({ error: 'bad_json' }, 400); }

  if (typeof email !== 'string' || !EMAIL.test(email.trim()))
    return json({ error: 'invalid_email' }, 400);

  try {
    const [row] = await sql`
      INSERT INTO waitlist (email, source) VALUES (${email}, ${source ?? null})
      ON CONFLICT (email_norm) DO NOTHING
      RETURNING id`;
    return json({ ok: true, created: Boolean(row) }, 200);  // created:false = already on list
  } catch {
    return json({ error: 'server_error' }, 500);
  }
}

const json = (b: unknown, status: number) =>
  new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
```
`ON CONFLICT DO NOTHING` handles dupes silently; `created` tells the client whether it was a new signup. (If Q2 lands on Supabase, swap `neon()` for the Supabase client / `supabase-js` insert — same shape.)

### Trade-offs
- **We build the send path ourselves** at launch (pull emails → batch via Resend). That's ~30 lines and a Resend API key, vs. Resend Audiences' built-in broadcast UI. Worth it to avoid a second source of truth.
- **No managed unsubscribe/compliance UI** until we wire the ESP. Fine for a pre-launch waitlist; add `unsubscribed_at` to the table when we send.
- **We carry deliverability ourselves** at send time (domain auth / SPF / DKIM). That's true of any ESP and is a launch-week task regardless.

### What to confirm
- Which Postgres (Q2) — picks the driver in the endpoint (`@neondatabase/serverless` vs `supabase-js`).
- Whether the waitlist endpoint lives on the **static landing** (a standalone `/api/waitlist` serverless function in the same Vercel project) or inside the future Next.js app. Lean: ship it now alongside the static landing; it carries over unchanged.
- Add light abuse protection before going live (basic rate limit / honeypot field) — not blocking, but cheap.

---

## Q2 — Postgres: Supabase vs Neon (for the main app)

> **❌ SUPERSEDED 2026-06-26 — decision reversed to Neon + Auth.js + Vercel Blob.** The user chose Neon for Postgres (incl. agent memory), Auth.js for OAuth, and (implied) Vercel Blob for capture images. The reasoning below is retained only to document *why Supabase was originally attractive* and therefore *what assembly we now owe*: stand up Auth.js (Google provider, offline access → refresh token in the `accounts` table, we refresh it ourselves) and Vercel Blob (signed client uploads). Realtime is dropped (stream/poll instead). Read the rest of this section as the checklist of what Neon does **not** bundle, not as a live recommendation.

### Recommendation
**Supabase.** Tada needs Postgres **+ Google OAuth user auth + blob storage for image captures** (+ possibly realtime). Supabase bundles all four behind one platform and one project, which is the least-assembly fit for exactly Tada's needs. Neon is a cleaner *database*, but it's only the database — choosing Neon means separately standing up Auth.js and a separate blob store (Vercel Blob / R2 / S3) and wiring them together. For Tada's specific shopping list, that assembly tax outweighs Neon's lean/Vercel-native appeal.

**The waitlist (Q1) should use the same Supabase Postgres** — one `waitlist` table in the same DB. (Insert via `supabase-js` or any Postgres driver against the Supabase connection string.)

> Note: this *updates* `build-decisions.md` §4, which recommended "Prisma + local Postgres now, adopt Supabase when OAuth lands." That sequencing is still fine for the deterministic spine (P0/P1 have no auth surface), but the **destination is Supabase** for the reasons below — so pick Supabase as the target now and keep the Prisma schema Supabase-portable, rather than treating the DB choice as still-open. See the conflicts section at the end.

### Why
- **Auth is on Tada's critical path and it's specifically Google OAuth.** Supabase Auth does `signInWithOAuth({ provider: 'google' })` out of the box and exposes `provider_token` / `provider_refresh_token`. Tada needs the Google refresh token anyway for Gmail/Calendar executors — Supabase surfaces it on the OAuth callback. (Caveat below.)
- **Captures are images → blob storage is a hard requirement, not a maybe.** Supabase Storage (`.from(bucket).upload(...)`, plus `createSignedUploadUrl` for direct client uploads) covers it in the same platform/project as the DB and auth, with row-level access tied to the same user. With Neon you'd bolt on a separate blob vendor and reconcile identity across two systems.
- **Realtime is "possibly" needed** (live to-do updates / research progress). Supabase Realtime is included; with Neon you'd add another mechanism.
- **One platform, one set of credentials, one mental model** for db + auth + storage (+ realtime). For a v0 with a small team, that consolidation is the dominant factor.

### Trade-offs
- **Lock-in.** The core asset — Postgres — is portable (it's just Postgres; `pg_dump`/restore to Neon or anywhere). The *sticky* parts are Auth (the `auth.users` table + JWT model) and Storage (bucket API + RLS policies). Migrating off later means re-homing auth and re-pointing storage, not the data itself. Acceptable: those are the pieces Supabase is saving us from building.
- **Neon's genuine wins we're forgoing:** scale-to-zero, DB branching (a branch per preview deploy), and the first-party "Vercel Postgres" integration. Real, but they optimize the database in isolation — not auth+storage+db together, which is what Tada needs.
- **Google refresh-token caveat (carry from `build-decisions.md` §6):** Supabase returns `provider_refresh_token` on the OAuth response, but **does not refresh it for you**. We must capture it on the callback and store + refresh it ourselves against `oauth2.googleapis.com/token` for the Gmail/Calendar executors. Supabase Auth handles *identity*; we still own the *Google integration credential*. This is the same conclusion §6 reached and doesn't change with Supabase.
- **Keep an escape hatch:** access Postgres through a plain driver / Prisma where practical, so the data layer isn't gratuitously coupled to Supabase client APIs. Reserve `supabase-js` for the things only it does well (Auth, Storage, Realtime).

### What to confirm
- That `provider_refresh_token` arrives with the **scopes Tada needs** (`calendar.events`, `gmail.send`) — request them via `options.scopes` and `access_type=offline` / `prompt=consent` on the Google provider config.
- Local-dev story: `supabase start` (full local stack in Docker) vs. develop against a hosted Supabase project. (`build-decisions.md` §4 flagged the local-stack setup weight — still the main cost of choosing Supabase early.)
- Whether to keep **Prisma** as the schema/migration tool over Supabase Postgres (recommended for the typed data model) vs. Supabase migrations. Either works; Prisma keeps the schema portable.
- Storage upload path: direct client upload via signed URL vs. server-side upload through a route handler (signed URL avoids piping image bytes through a function).

---

## Q3 — App architecture: Next.js-only (TypeScript) vs a Python core for the agent layer

### Recommendation
**Monolingual Next.js / TypeScript for v0. No Python.** The agent runtime is the **Vercel AI SDK** (a thin, provider-agnostic TS toolkit, running Gemini). Extraction, the tool-use agent loop, and the deterministic executors all live in Next.js route handlers — one language, one repo, one deploy. Two things this resolves: **(a)** we *are* building a real agent (a tool-use loop) — the only thing ever rejected was the **Claude Agent SDK** (Anthropic-coupled), never agency; **(b)** the real architectural question isn't language, it's **where the minutes-long research agent runs**, and the answer is a **background job on Vercel (Node/TS)** — not a different language.

### Agent runtime — Vercel AI SDK (not hand-rolled, not Agno, not Python)
The loop that powers chat / voice / "do it for me" runs on the **Vercel AI SDK**. Verified via Context7, it gives us — in-process with Next.js:
- **Agentic tool loop** — multi-step tool calling (`stopWhen` / `maxSteps`) or a fully manual loop when we want control over gating.
- **Chat UI** — `useChat` (streaming, React-native).
- **Tiles / generative UI** — tools return React components (`streamUI`), so the agent answers with a task tile or confirmation card, not just text.
- **Gated actions, built in** — first-class human-in-the-loop tool approval (`approval-requested` → Approve/Deny), which *is* our "never auto-execute a side effect" invariant. We don't hand-roll it.
- **Gemini** via the Google provider (honors no-Claude); **voice** (OpenAI Realtime) routes its tool-calls into the **same** `AgentTool` registry — one toolset across tap / chat / voice.

Why not the alternatives:
- **Hand-rolled `@google/genai` loop** — what earlier drafts assumed; still viable, but we'd re-implement streaming, multi-step chaining, tiles, and the approval UX by hand. The AI SDK gives those for free, and we can still drop to a manual loop where a tool needs custom control.
- **Agno (Python framework)** — strong *backend brain* (built-in memory, vector/RAG knowledge, multi-agent teams, AgentOS runtime), but it's **Python** (reverses the no-Python decision) and **backend-centric** — it doesn't own the frontend tiles / inline-confirm / `useChat` UX that are Tada's hard parts, and its strengths (multi-agent teams, RAG) are our "not yet."

**Escape hatch:** if the "do it for you" brain later outgrows a single-loop assistant (heavy memory + knowledge-grounded, multi-agent reasoning), a dedicated **Python Agno service** can sit **behind the `Executors` / `AgentTool` / `deepResearch` seams** — the chat/voice/tile front stays on the AI SDK. A clean later upgrade, not a door we're closing now.

### Why (monolingual TS)
- **The whole AI surface is first-class TS.** Multimodal extraction (structured JSON via `responseSchema` / the AI SDK's `generateObject`) and the tool-use agent loop run through the Vercel AI SDK's Google (Gemini) provider — the shape `build-decisions.md` §1 and `proposed-contracts.md` already specify, now via the AI SDK rather than a from-scratch loop. Nothing here needs Python.
- **The classic reasons for a Python core don't apply.** No heavy in-house ML, no Python-only libs, and the only agent tooling we rejected is the **Claude Agent SDK** (Anthropic-coupled) and heavy Python orchestration frameworks (LangGraph / Agno-as-core) — the AI SDK is a thin TS toolkit, not that. Gemini is a remote API call from any language. Adding Python would buy a second runtime, a second deploy target, and a TS↔Python contract boundary — for zero capability gain.
- **The real tension is execution time, and it's solvable in-platform.** Vercel functions have a max duration (default short; with **Fluid Compute** up to **800s on Pro/Enterprise**, Node and Python runtimes alike). The research agent can exceed even that, so it should not run inline inside the request that triggers it. The fix is a background-job pattern, all in Node/TS:

  **Background-job approach for long research (v0):**
  1. **Dispatch returns immediately.** `POST /api/research` validates, writes a `research_job` row (`status='queued'`) tied to the todo, and returns. Use `waitUntil()` / Next.js `after()` to kick off work *after* the response so the user isn't blocked.
  2. **Run the agent loop in the background worker** (a Vercel function with `maxDuration` raised under Fluid Compute, or a dedicated long-running worker — still Node/TS). It runs the Gemini tool loop (web search/fetch → synthesize), writing progress + partial markdown into the job/todo row as it goes.
  3. **Surface progress** by polling the job row or via Supabase Realtime (Q2) — the UI shows "researching…" then the final markdown lands in `todo.detail`.
  4. **A Vercel Cron** sweeps for stuck/`queued` jobs (retry / mark failed) so nothing wedges.

  If a single research run reliably blows past the Fluid Compute ceiling, promote step 2 to a **dedicated always-on worker** (Render/Fly/Railway, or a queue like Upstash QStash / Inngest driving a Vercel function). **That worker is still TypeScript/Node** — long-running ≠ Python.
- **One language = faster v0** for a small team: shared types (the `proposed-contracts.md` TS interfaces are literally the contract), one CI, one set of skills, no serialization boundary between the API and the agent.

### Trade-offs
- **Vercel function limits are a real constraint** for the research loop — but they're an *execution-model* problem, handled by the background-job pattern above, not a *language* problem. Acknowledged and designed for, not ignored.
- **TS agent ergonomics vs. Python's ecosystem:** Python has more agent/eval tooling, but we've rejected frameworks and use Gemini directly, so that ecosystem is moot for v0.
- **If we later need heavy local ML or a Python-only dependency**, we add a *service*, not a rewrite — the executor/extractor seams in `proposed-contracts.md` are already interfaces, so a capability can move behind an HTTP boundary without touching the core.

### Signals that would later justify adding a Python service
- A research/enrichment step needs a **Python-only library** (e.g., specialized scraping/parsing, a scientific or document-processing lib with no TS equivalent).
- We adopt **local/self-hosted models or embeddings** (vector pipelines, fine-tuning, GPU inference) where Python tooling is decisively better.
- The agent grows into **complex multi-step orchestration** where a mature Python framework earns its keep — *and* we reverse the "no framework" stance.
- **CPU-bound heavy compute** (large-scale data processing) that's awkward in Node's event loop.
- Until one of these is concretely true, **stay monolingual TS.**

### What to confirm
- Whether **Fluid Compute** is enabled and which plan (sets the 800s ceiling) — and measure a real research run against it to decide if step 2 needs a dedicated worker.
- The job/queue mechanism for v0: simplest is a `research_job` table + `waitUntil`/`after` + Cron sweeper (no new vendor). Confirm before reaching for QStash/Inngest.
- That the Gemini tool-loop in a long-running context handles partial progress + cancellation (write progress incrementally; support a "stop research" path).

---

## Net v0 stack  *(updated 2026-06-26)*

- **Waitlist:** static landing → `POST /api/waitlist` → our **own `waitlist` table in Neon** (source of truth, unique on normalized email, idempotent insert). Rent an ESP (Resend) as the **send transport only at launch** — no managed audience.
- **Database / Auth / Storage:** **Neon** (serverless Postgres — app data + agent memory; pgvector) + **Auth.js (NextAuth)** Google OAuth (offline access → Google `refresh_token` persisted in the `accounts` table; **we refresh it ourselves** for Gmail/Calendar) + **Vercel Blob** for capture images (signed direct-from-browser uploads). **No realtime service** — the AI SDK streams; research progress is polled or pushed over SSE. Keep the schema in Prisma. Waitlist lives in the same Neon Postgres.
- **App architecture:** **Next.js / TypeScript, monolingual, one deploy.** Agent runtime = **Vercel AI SDK** (Gemini provider): **single schema-constrained LLM extraction** (`generateObject`/`Output.object` — one call, *not* an agent loop; still uses Gemini) → todo spine → **tool-use agent loop for "do it for me"** + generative-UI tiles + built-in human-in-the-loop approval on gated write-tools (the agent writes to Neon through those tools). **No workflow engine in v0** — deep research runs as a plain background async function (raised `maxDuration` under Fluid Compute, progress to a job row / SSE). The **Workflow Development Kit** (`DurableAgent`, `"use workflow"`/`"use step"`) is a *later* upgrade behind the same executor seam — adopt only if research outgrows the function ceiling or needs bulletproof idempotency. **No Claude / no Claude Agent SDK, no heavy Python framework, no Python in v0** — Agno stays available as a future backend brain behind the `AgentTool`/`Executors` seams.

---

## Q4 — Agent loop vs. workflow, and the one-capability/three-callers seam (added 2026-06-26)

**Workflow engine: NOT in v0.** The Workflow Development Kit (durability/retries/idempotency/suspend-resume) is overkill for v0 — only deep research even wants it, and research ships first as a plain background async function. Adopt the WDK (`DurableAgent`, `"use workflow"`/`"use step"`) *later*, behind the same `Executors` seam, only if a research run reliably exceeds the function ceiling, needs bulletproof side-effect idempotency, or grows long enough to need resume.

**Extraction is one LLM call, not an agent loop.** "Deterministic" earlier meant *fixed control flow* (one schema-constrained `generateObject` call), **not** "no LLM" — parsing email/screenshot/text into `ExtractedTodo[]` absolutely uses Gemini. The *agent loop* (model picks tools, reacts) is reserved for chat/voice/"do it for me."

**One capability = one fn, three callers (the key model).** Each capability (`extractTodos`, `createTodo`, `updateTodo`, `setReminder`, `sendMeetingInvite`, `deepResearch`) is a plain TS fn, exposed three ways — and only one involves the LLM:
- **Tap / form** → call the executor directly (NO LLM — the UI already knows tool + args).
- **Chat / voice** → the same fn wrapped as an AI SDK `tool({ inputSchema, execute })`; here the LLM picks tool + args (agent loop).
- **Webhook (inbound email)** → call the executor directly (no agent routing).

So a chat window "doing all things" is *easy* — it just gets the shared tool registry — and you bypass the LLM whenever intent is already known. `extractTodos` is itself a tool, so chat can "parse this + book the meeting." **One `extractTodos` handles all sources** via a unified `ExtractorInput` superset (populate image / text / email; one model call, one schema; optional `source` hint for prompt nuance). The typed quick-add field *also* has a non-LLM `parseQuickAdd` regex for instant token-highlighting, complementary to the LLM extract.

## Q5 — Invitation codes (added 2026-06-26)

**The code gates account *creation*, once — not every sign-in.** OAuth has no separate signup/login button; the Auth.js `signIn` callback branches: existing user → admit, no code; brand-new user → require a valid pending invite or reject. Returning logins are plain Google forever. The user rarely types the code — they click an invite link `/join?code=ABC` that stashes it in a cookie before the Google bounce (offer a manual "have a code?" box too).

- **Stored codes (shareable):** `invite_codes` table (`code`, `max_uses`, `used_count`, `expires_at`, `invited_email?`), generate with `nanoid`. Pre-check on the landing page for UX; **authoritative atomic redeem in the `signIn` callback**: `UPDATE invite_codes SET used_count = used_count+1 WHERE code=$1 AND used_count<max_uses AND (expires_at IS NULL OR expires_at>now()) RETURNING id` (no row ⇒ reject). `max_uses` = 1 (personal) / N (shared beta). Tie `invited_email` to a waitlist row for a waitlist → invite → signup funnel.
- **Signed invite links (targeted):** email an HMAC/JWT `{email, exp}`; verify signature + email match at signup, store nothing. Best when *you* invite specific people; stored codes for sharing.
- **No admin UI for v0** — mint/revoke codes with a script (or a route guarded by the `unlimited` plan). An admin panel is a later nicety.

## Q6 — Plan gating / AI-call quotas (added 2026-06-26)

**Three plans: `free`, `pro`, `unlimited` — `unlimited` is admin-only** (the only way to get it; it bypasses the meter). Two separable concerns: **plan quota** (billing-grade, monthly, source of truth = Neon) vs. optional **burst rate-limit** (abuse, ephemeral, Redis).

1. **Meter in credits, not raw calls** (research ≫ extract in cost): `COST = { extractTodos:1, chatTurn:1, deepResearch:10 }`. **Plans in code:** `PLANS = { free:{monthlyCredits:50}, pro:{monthlyCredits:2000}, unlimited:{monthlyCredits:Infinity} }`.
2. **Usage keyed by period ⇒ NO cron, NO reset.** Row PK `(user_id, period)` where `period='2026-06'`. Compute the current period key at call time; a new month → no row yet → starts at 0 automatically. Old rows are just history. "Reset" is implicit in the key.
3. **Atomic conditional consume** (one statement, race-safe): ensure the row (`INSERT … ON CONFLICT DO NOTHING`), then `UPDATE ai_usage SET used = used + $cost WHERE user_id=$1 AND period=$2 AND used + $cost <= $limit RETURNING used` — no row ⇒ over limit, reject. `limit` comes from `PLANS[user.plan]` so upgrades apply on the next call. Admins (`unlimited`) short-circuit before the check.
4. **One choke point:** a `withQuota(user, capability, run)` wrapper around every model call, so tap/chat/voice all inherit it. **Reserve + refund** for `deepResearch` (consume up front, refund on failure). Return **402** (quota) vs **429** (burst) so the UI shows upgrade vs slow-down.
5. **(Optional) Upstash Ratelimit** (`@upstash/ratelimit`+Redis) for short-window burst, limiter chosen by plan — *not* the system of record. **(Optional) Vercel AI Gateway** for cross-provider spend observability + org budgets.

Note: `admin`/`unlimited` is really a *role* (powers) folded into the `plan` field for v0; split `role` from `plan` later if access control gets richer.

### Scaling note (documented, NOT addressed in v0)
The per-call `UPDATE ai_usage` is **fine for v0 and well beyond** — it's one HOT (heap-only) single-row write keyed by `(user_id, period)` (the `used` column is not indexed), microseconds, and dwarfed by the multi-second LLM call it gates. More users spread writes across more rows (no shared contention); the only risk is a *single* hot row (one user, massive concurrency), which quota-gating doesn't produce. Cheap hygiene only: meter once per call (not per token), `fillfactor = 90`, let autovacuum run.
**Escape hatch if a dashboard ever shows the DB write is hot (do NOT pre-build):** move the in-period counter to **Redis/Upstash** (already in-stack) — `INCRBY usage:{user}:{period}` with `EXPIREAT` month-end (self-deleting, mirrors the period-key trick), check against the plan limit there; keep Postgres only for billing history + periodic reconciliation. Trade-off: a dropped Redis increment under-counts (favors the user) — fine for a meter. **v0 ships the plain Postgres `UPDATE`; revisit only on real metrics.**
