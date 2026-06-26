# Tada Web — agent guide

Web version of the native macOS **Tada** app (`~/projects/tada`): Todoist's to-do *flow* + capture-first AI + a real "do it for me" layer. Two differentiators vs Todoist: **(1) capture is the hero** — email / screenshot / quick add (typed or spoken) → AI extracts structured todos; **(2) it does the task for you** — books the meeting, sets the reminder, runs deep research — gated by one tap.

Tagline: **Not to-do. Ta-da.**

## Read first
- Spec: `docs/superpowers/specs/2026-06-24-tada-web-v0-design.md`
- Prep pack: `docs/superpowers/prep/` — `stack-decisions.md`, `proposed-contracts.md`, `build-decisions.md`, `native-flow-contract-reference.md`, `clawdia-port-manifest.md`
- Marketing landing preview: `design/landing-preview/index.html`

## Locked decisions (do not relitigate without the user)
- **Flow = native Tada exactly.** One flat tagged pool; `All` is the only add surface; every other view is a read-only filter-View (`FilterCriteria`). Filtering is pure/deterministic given `now`.
- **Stack:** Next.js (App Router), **TypeScript only — no Python.** Supabase (Postgres + Google OAuth + Storage + Realtime). Vercel hosting.
- **AI providers — NO Claude/Anthropic in the product runtime (cost).** Gemini for all image+text (`gemini-2.5-flash` extract/enrich, `gemini-2.5-pro` research); OpenAI Realtime for voice. "No agent SDK" meant the *Claude* Agent SDK only.
- **Agent runtime = Vercel AI SDK** (provider-agnostic, runs Gemini): tool-use loop + `useChat` + generative-UI tiles + built-in human-in-the-loop approval for gated write-tools. Agno stays a future backend-brain option behind the `AgentTool`/`Executors` seams.
- **Execution = hybrid:** deterministic to-do spine; "finish the todo" dispatches on `actionType` — meetings/reminders deterministic, **research is the only agent.** One executor fn per capability, called directly from the tap path and wrapped as a gated tool for voice/chat.
- **Never auto-execute a side effect.** Every write action shows its concrete effect and fires only on explicit user action (tap or confirmed tool-call).

## Design system
- **Palette = Clawdia's, copied verbatim** (light + dark): warm cream `#f0ece3`, **rust accent `#c8632e`**. NOT indigo. Auto dark mode via `prefers-color-scheme`. No dark slab bands; no green.
- **Highlight philosophy** (from `~/projects/bazzalseed.github.io`): selected/active = accent color or a soft raised surface, **never a heavy black fill.**
- CSS custom properties (call them "CSS variables") hold all tokens. Display: EB Garamond; body: Geist; mono: Geist Mono; script wordmark: Caveat.
- UI source to port/rebrand: Clawdia's `@clawdia/ui` (tokens + SpiroOrb/VoiceStage), at `~/projects/clawdia-marketing-agent`.

## Conventions
- Match the surrounding code's idiom, naming, and comment density.
- Keep providers/voice/executors behind interfaces (seams) so they can be swapped without touching the core.
- Wire keys snake_case; TS fields camelCase.

## Local testing
- Preview the landing page with the no-cache server: `python3 design/landing-preview/.nocache_server.py` (serves `:8731` with `Cache-Control: no-store` so the browser auto-refreshes).
- **Use the cmux browser for verification, not Playwright MCP** (faster; the user often has a cmux webview open).
- Secrets live in gitignored `.env` files — never commit them.
