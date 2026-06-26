# Handoff — Tada Web marketing site

> Self-contained context to spin up a **dedicated session iterating on the marketing site**. Written 2026-06-26. (For the raw conversation, run `/export` in the original session; this doc is the curated version.)

## What Tada is (30-second context)
Web version of the native macOS **Tada** app: Todoist's to-do *flow* + capture-first AI + a real "do it for me" layer. Tagline: **Not to-do. Ta-da.**

**Three differentiators vs. Todoist:**
1. **Capture is the hero** — three co-equal AI sources: screenshot/image · AI-enhanced quick-add (typed *or* spoken) · forward-an-email. All feed one extractor.
2. **It does the task for you** — books the meeting, sets the reminder, runs deep research; gated by one tap.
3. **A magical chat (text + voice)** — a ChatGPT-like agent that can do anything across your todos.

**Stack:** Next.js (App Router, TS-only) · Neon Postgres (+pgvector) · Auth.js Google OAuth · Vercel Blob · Vercel AI SDK (`ai` + `@ai-sdk/google`, Gemini) · OpenAI Realtime (voice) · Vercel hosting.

**Full product spec:** `docs/superpowers/specs/2026-06-24-tada-web-v0-design.md`. **Project guide:** `CLAUDE.md`.

## The marketing site — scope & current state

### What it is
The **landing page at `gettada.app`** (apex domain, already owned in Vercel; the app lives at `app.gettada.app`). One strong landing, **not** a sprawling multi-page site.

### Current artifact (the seed to iterate on)
- **`design/landing-preview/index.html`** — the working landing preview. Self-contained HTML/CSS/JS.
- **`design/landing-preview/NOTES.md`** — design notes.
- **`design/landing-preview/screenshots/`** — `desktop.png`, `mobile.png` (current look), `old_ref.png`.
- **Local preview:** `python3 design/landing-preview/.nocache_server.py` → serves `:8731` with `Cache-Control: no-store` (browser auto-refreshes on edit).
- **Hero (current):** a "switchboard" that lights up each capture source and plays an end-to-end story per source — email→book meeting, screenshot→deep research, quick-add→set reminder. (Source shape → Tada makes a task → Tada does it for you.)

### Design system (must match the product)
- **Palette = Clawdia's, copied verbatim:** warm cream `#f0ece3` (light) / graphite `#1b1a18` (dark), **rust accent `#c8632e`** (NOT indigo). Auto dark mode via `prefers-color-scheme`.
- **Type:** EB Garamond (display) · Geist (body) · Geist Mono · **Caveat** (script wordmark).
- **Highlight philosophy:** active/selected = accent or a soft raised surface, **never a heavy black fill**.
- All tokens as CSS custom properties. The product reuses these exact tokens, so the site and app should feel identical.
- **Tone:** calm, capture-first, plain verbs, sentence case. The "Ta-da" delight is reserved for when an action actually completes.

### The one functional requirement to wire (done by the app's frontend at the end, but you may iterate)
Convert the **waitlist CTAs into OAuth sign-in/up**:
- The **top-right "join waitlist"** button **and** the **final section** CTA both become **"Sign in / Sign up with Google"** (Auth.js Google OAuth).
- **Invite-gated:** brand-new users need a valid invite code (link `/join?code=ABC` stashes it in a cookie before the Google bounce; manual "have a code?" box as fallback). No invite → fall back to **waitlist capture** (`POST /api/waitlist` → `waitlist` table in Neon).
- **Admins** (emails in `ADMIN_EMAILS`, e.g. `seedzpy@gmail.com`) bypass the invite gate and get the `unlimited` plan.

## Testing
- **Use the cmux browser for verification, not Playwright MCP** (faster; a cmux webview is usually open).
- Preview via the no-cache server above.

## Open / your call when you iterate
- Whether the hero stays the switchboard or evolves.
- Copy pass across the whole page (the writing is design material — be intentional).
- Exact placement/styling of the OAuth CTA vs. the current waitlist CTA.
- Any additional sections (social proof, the three differentiators as a feature triad, the "do it for me" demo).

## Pointers
- Product spec: `docs/superpowers/specs/2026-06-24-tada-web-v0-design.md`
- Prep pack: `docs/superpowers/prep/` (stack-decisions, build-decisions, proposed-contracts, clawdia-port-manifest, native-flow-contract-reference, neon-setup)
- Project guide: `CLAUDE.md`
- Landing artifact: `design/landing-preview/`
