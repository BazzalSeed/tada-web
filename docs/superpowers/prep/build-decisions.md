# Build-start decisions — recommendations

> Overnight prep (2026-06-25). Pre-answers to the spec's §9 open decisions so tomorrow is yes/no, not research. Each: **recommendation + why + what to confirm**.

## 1. AI runtime & models — Vercel AI SDK (Gemini provider); voice = OpenAI Realtime (§2)

- **SDK = Vercel AI SDK** (`ai` + the Google provider `@ai-sdk/google`) — provider-agnostic TS toolkit; **this is what we write code against.** Gemini is the model, reached *through* the AI SDK (`google('gemini-2.5-flash')`), **not** via the raw `@google/genai` client. Voice is a separate path — **OpenAI Realtime** (see §2).
- **Models:** `gemini-2.5-flash` for **extraction + enrichment** (cheap, multimodal); `gemini-2.5-pro` for the **research agent's** hard reasoning. (Confirm exact current IDs at build — `2.5-flash`/`2.5-pro` are live; `2.0-flash` also exists as a cheaper fallback.)
  > **UPDATE 2026-06-26 — runtime is the Vercel AI SDK, not a raw `@google/genai` loop.** Agent runtime = **Vercel AI SDK** with the Google provider (`@ai-sdk/google`, runs the same Gemini models above). The raw-SDK mechanics in the two bullets below are superseded — see `stack-decisions.md` Q3/Q4. Net: extraction = one schema-constrained `generateObject` call; the agent = `ToolLoopAgent` (`stopWhen`) with **gated write-tools via the AI SDK's built-in human-in-the-loop approval** (propose → confirm → execute). "No agent framework" only ever meant the **Claude** Agent SDK — the AI SDK is a thin TS toolkit. **No workflow engine in v0** (deep research = plain background async fn; WDK is a later upgrade).
- **Image → structured todos (now via AI SDK):** a multimodal `generateObject({ model: google('gemini-2.5-flash'), schema, messages:[imagePart, text] })` — Zod/JSON schema for `ExtractedTodo[]`. (Equivalent raw `@google/genai`: `inlineData` + `responseMimeType:'application/json'` + `responseSchema`.)
- **Agent (do-it-for-me / research), now via AI SDK:** tools = `tool({ inputSchema, execute })`; the SDK runs call→execute→loop. Write-tools are **gated** (approval) so side-effects never auto-fire — that *is* our manual-gating requirement, now built-in rather than hand-rolled.
- **Confirm:** exact model IDs + whether to use `responseSchema` vs `responseJsonSchema` in the installed SDK version.

## 2. OpenAI Realtime (voice) — RESOLVED by the Clawdia port

Clawdia already runs voice on **OpenAI Realtime over WebRTC** with a server-minted ephemeral secret. **Recommendation: vendor Clawdia's `RealtimeVoiceSession` + `useVoiceSession` + the 3 `/api/voice/*` routes** (see `clawdia-port-manifest.md`), swap the routes to call our backend + `AgentTool` registry, update the model name + tool names. No new browser-voice design needed.

- **Confirm:** the current OpenAI Realtime model id + the `/v1/realtime/calls` handshake still matches (Clawdia's code is the reference).

## 3. Google OAuth (Gmail/Calendar) locally — WORKS, no CASA blocker

- OAuth client (Web app) with redirect `http://localhost:3000/api/auth/google/callback`; scopes `https://www.googleapis.com/auth/calendar.events` + `https://www.googleapis.com/auth/gmail.send` (+ `calendar.readonly` if checking availability).
- **Testing** publishing status + add yourself as a **test user** → restricted scopes work immediately. CASA verification is a production/scale concern, deferred.
- Store the **refresh token** in the DB (single-user local); refresh against `https://oauth2.googleapis.com/token`. Use `googleapis` npm for `events.insert` (`sendUpdates: 'all'`) + Gmail send.
- **Confirm:** exact scope strings + whether to use `googleapis` vs raw REST.

## 4. DB & auth — UPDATED 2026-06-26: Neon + Auth.js + Vercel Blob (Supabase dropped)

- **DB = Neon** (serverless Postgres; app data + agent memory; pgvector available). **Auth = Auth.js (NextAuth)** Google OAuth. **Blob = Vercel Blob** for capture images (signed direct-from-browser uploads). **No realtime service** (AI SDK streams; poll/SSE for research progress). See `stack-decisions.md` (revision banner + Q2 superseded).
- **(Lean) P0 = Prisma + plain docker-compose Postgres**, `currentUser()` stub (implicit user). Zero external dependency; the to-do core needs no auth. Point Prisma at **Neon** when the first OAuth integration lands — keep the schema provider-neutral so the switch is a connection-string change.
- **Why lean:** the spine (P0/P1) has no auth surface; don't pay the auth/Neon setup cost before P2's OAuth. The `currentUser()` seam keeps the switch cheap.

## 5. Night-one skill scope — RECOMMENDED: research-first

Ship **deep research** as the v0 agent skill first — **zero auth dependency**, pure Gemini function-calling loop (web search/fetch → synthesize → write into the todo's markdown detail). Add the **Gmail/Calendar meeting-invite** executor as the immediate fast-follow once the single-user Google OAuth seam (decision #3) is wired. Reminders are deterministic and trivial — include in P2. This sequences the agent's only hard dependency (OAuth) *after* a complete, demoable "do it for me" already exists.

## 6. One Google flow vs two — RECOMMENDED: separate "Connect Google" first

Start with a standalone **"Connect Google"** integration on the implicit user (decouples *identity* from *data scope*; simplest; no app-login wall). Fold into a unified **"Sign in with Google" that also grants Gmail/Calendar scopes** only when **Auth.js** lands — request `access_type=offline`+`prompt=consent` so the Google `refresh_token` persists in the Auth.js `accounts` table; **we still refresh it ourselves** for the executors (rotate in the `jwt`/`session` callback). Until then, identity isn't needed; the Google token is just an integration credential.

## 7. Inbound email provider (hero flow #3, fast-follow) — RECOMMENDED: simplest webhook inbound-parser, deferred

Hero capture flow #3 (forward an email → tasks) needs a per-user alias `u_<id>@in.<domain>` + an inbound webhook that parses mail and hands it to the shared extractor. Candidates:

- **Postmark inbound** — dedicated inbound-parse webhook, clean JSON payload (incl. parsed attachments as base64), signed; simplest to stand up.
- **SendGrid Inbound Parse** — POSTs `multipart/form-data` to your route; mature, but the payload is fiddlier than Postmark's JSON.
- **Cloudflare Email Workers** — route `*@in.<domain>` to a Worker; cheapest and very flexible, but you parse the raw MIME yourself.
- **Gmail watch/push** — only fits if mail lands in a Gmail account first; heavier (Pub/Sub + history sync), reuses the Google OAuth seam but is overkill for a generic alias.
- **Recommendation:** pick the **simplest webhook-based inbound parser for v0** (Postmark inbound is the lean default — JSON payload, attachments decoded, signed). **Defer the whole flow until per-user identity exists** — the alias needs a stable user id, so this lands as the P2.5 fast-follow after auth, not on night one. The extractor seam is provider-agnostic, so the choice is reversible.
- **Confirm:** the inbound domain + DNS (MX) ownership, the provider's signature-verification scheme, and attachment-size limits.

---

### Net night-one stack

Next.js (App Router) · vendored+rebranded Clawdia UI (**rust `#c8632e`**, auto dark mode — NOT indigo) · **Neon** Postgres (Prisma) + **Auth.js** Google OAuth + **Vercel Blob** captures (no realtime) · Gemini `2.5-flash`/`pro` via the **Vercel AI SDK** (extraction = `generateObject`; agent = `ToolLoopAgent` + gated tools; no workflow engine in v0) · OpenAI Realtime (ported voice) · deep-research skill first, Gmail-invite fast-follow · no Claude, no login wall.