# Clawdia → Tada-web — Design System & Voice Port Manifest

> Overnight prep (2026-06-25). Exact files, props, deps, and rename surface for the architect's "port + rebrand the design system" deliverable. Source repo: `/Users/seedz/projects/clawdia-marketing-agent`.

## TL;DR — biggest finding
**Clawdia's voice already runs on OpenAI Realtime over WebRTC**, with the long-lived key kept server-side via an ephemeral-secret mint. So Tada's voice mode is a **near-direct port**, and it confirms the OpenAI Realtime decision (resolves open-decision §9 #5). The pieces:
- `RealtimeVoiceSession` (browser WebRTC client) → mints an ephemeral secret from `POST /api/voice/session`, does the SDP handshake against `https://api.openai.com/v1/realtime/calls`, dispatches model tool-calls to `POST /api/voice/tool`, reports tokens to `POST /api/voice/usage`.
- `useVoiceSession` (React hook) → wraps it, surfaces `{status, transcript, activeTool, showcase, error}` + a stable `getLevel()` the orb reads in its own rAF.
- `VoiceStage` + `SpiroOrb` → the UI, already vendored-ready and token-driven.

To make it Tada's: keep the callback/hook interfaces; swap the 3 API routes to call **our** backend + tool registry; update the model name + tool names; rebrand the `clawdia-` class prefixes and aria/copy strings.

## 1. Token system
- **Generated outputs to vendor as-is** (ignore the Python `tokens.py` / `tokens_build.py` pipeline):
  - `packages/ui/src/tokens.ts` — literal TS values + `cssVar.*` handles.
  - `packages/ui/src/tokens.generated.css` — `:root` light + `@media (prefers-color-scheme: dark)` + `[data-theme]` overrides.
  - `packages/ui/src/tokens/*.css` — `effects.css` (hairlines/elevations/shadows/glow/motion), `motion.css` (load-in, shimmer, reduced-motion gates), `spacing.css`, `typography.css`, `fonts.css`.
  - `packages/ui/src/styles.css` — global reset/baseline.
- **Accent swap sienna `#c8632e` → indigo `#5B5BD6`** touches:
  - `tokens.generated.css`: `--color-accent`, `--color-accent-bright` (light); the dark-mode `--color-accent-bright` (use a *lightened* indigo for ≥4.5:1 on dark); `[data-theme="light"|"dark"]` overrides; optionally `--dataviz-1`.
  - `tokens.ts`: `color.accentSignature`, `color.accentBright`, `color.accentDeep` (compute darker pressed indigo), `color.accentText` (≥4.5:1), `dataviz[0]`.
  - `tokens/effects.css`: `--glow-color`, `--glow-hover`, `--glow-spill`, `--cta-glow` (recompute for indigo; drop the warm/orange bias).
- No Python re-run needed; `color-mix()` calls in component CSS read `var(--color-accent)` dynamically, so they follow the swap.

## 2. Components to vendor (self-contained unless noted)
**Voice (the must-haves):**
- `packages/ui/src/components/voice/SpiroOrb.tsx` — pure 2D-canvas hypotrochoid; **zero external libs**. Props: `state('idle'|'listening'|'thinking'|'speaking')`, `profile`, `getLevel()`, `size`, `count`, `dotRadius`, `speed`, `reducedMotion`, `className`, `style`. Consumes `--color-accent`, `--color-accent-bright`, `--color-ink-muted`, `--dataviz-1..6`.
- `packages/ui/src/components/voice/VoiceStage.tsx` — imports only `SpiroOrb`. Props: `status('connecting'|'listening'|'thinking'|'speaking'|'ended'|'error')`, `muted`, `onToggleMute`, `onHangUp`, `onMinimize?`, `getLevel?`, `showcase?`, `showcaseKey?`, `statusLine?`, `error?`, `profile?`, `orbSize?`, `reducedMotion?`. ResizeObserver-driven orb sizing; iOS-style controls; ShowcasePresence enter/exit/switch.

**Generic primitives (optional, all token-driven, no inter-deps):** `core/Button.tsx` (`variant: primary|secondary|ghost|nav`), `surfaces/Card.tsx` (`variant: plain|rule|hero`), `Avatar`, `Badge`, `Chip`, `StatusDot`, `glass/Glass*`, `effects/DotWave` (canvas, self-contained). Charts (`DonutChart`/`SeriesChart`/`Sparkline`) — defer; not needed for v0.

**External deps:** voice needs only `react`/`react-dom` ≥18. `@zumer/snapdom@^2.12.9` only if vendoring `ShareCard`. No canvas/animation/chart libs for the orb.

## 3. Voice seam (files to vendor + adapt)
- `apps/app/components/ask/useVoiceSession.ts` — hook; keep as-is. `UseVoiceSession = { state, start(seedProvider?), stop(), setTalking(bool), getLevel() }`.
- `apps/app/lib/voice/realtimeVoice.ts` — `RealtimeVoiceSession` class. Keep `RealtimeVoiceCallbacks` interface (`onStatus/onTranscript/onTool/onShowcase?/onError/onClosed?`); swap internals: route URLs, model name, tool-name → label map.
- `apps/app/lib/voiceBoundary.ts` — pure types (`MintResult`, `VoiceToolBody`, `VoiceToolResult`, `VoiceToolStatus`, `VoiceToolCard`, `VoiceUsageBody`) + `voiceToolStatus()` mapping util. Keep; update the status-label dict to Tada's tools.
- API routes to recreate in tada-web pointing at **our** backend + tool registry:
  - `POST /api/voice/session` → mint ephemeral OpenAI Realtime secret server-side, embed **our** tool definitions, return `{value, expires_at, model, max_session_seconds, voice_session_id}`.
  - `POST /api/voice/tool` → run the model's tool call under the caller's scope; return `{call_id, output, card?}`. **This is where the shared `AgentTool` registry plugs in** (read-tools auto, write-tools gated).
  - `POST /api/voice/usage` → log token usage `{prompt/completion/audio_in/audio_out/cached..., duration_ms}` for budget tracking.

## 4. Rebrand surface (rename before shipping)
- CSS class prefixes `.clawdia-*` → `.tada-*` across vendored files: `clawdia-vstage`, `clawdia-vstage__ctrl[--end]`, `clawdia-vstage__min`, `clawdia-vstage__showcase[--in/--out]`; `@keyframes clawdia-vstage-card[-out]`; plus primitive prefixes (`clawdia-btn/card/chip/avatar/badge/glass/...`) and `motion.css` `.clawdia-enter/fade/rise` + their `@keyframes`.
- Strings: `SpiroOrb` aria `"Clawdia voice — ${state}"` → `"Tada voice — …"`; `VoiceStage` `STATUS_CUE.speaking "Clawdia is speaking"` → `"Tada is speaking"`, `aria-label="Voice call with Clawdia"` → `…with Tada`; docstrings/diagrams mentioning Clawdia.
- Find-all: `grep -rn "\.clawdia-\|@keyframes clawdia-\|Clawdia" packages/ui/src apps/app/lib/voice apps/app/components/ask --include=*.tsx --include=*.ts --include=*.css`.

## Implementation checklist (for the architect)
1. Copy `tokens.ts` + `tokens.generated.css` + `tokens/` + `styles.css`; apply the indigo swap (§1).
2. Vendor `SpiroOrb.tsx` + `VoiceStage.tsx` (+ Button/Card/Chip if showcased cards need them).
3. Vendor `useVoiceSession.ts`, `realtimeVoice.ts`, `voiceBoundary.ts`; keep interfaces, swap routes/model/tool-names.
4. Recreate `/api/voice/{session,tool,usage}` against our backend; wire `/tool` into the `AgentTool` registry.
5. Rebrand `.clawdia-*` → `.tada-*` + aria/copy/docstrings.
6. E2E check: start → mic level drives orb → speaking state → tool call runs (gated for writes) → hang up → `onClosed(turns)`.
