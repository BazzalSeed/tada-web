# Build prep pack — overnight 2026-06-25

De-risking + prep done while you slept so tomorrow's architect phase is fast. Nothing here is product code; it's research, audits, and **proposed** contracts for the architect to ratify.

## What's here
| File | What it is | Use it for |
|---|---|---|
| [`build-decisions.md`](build-decisions.md) | Recommendations for all 7 of the spec's §9 open decisions (Gemini SDK/models, OpenAI Realtime, Google OAuth local, DB/auth, skill scope, Google flow, inbound-email provider) | Turn §9 into yes/no in the morning |
| [`proposed-contracts.md`](proposed-contracts.md) | TS contract proposals — data model, FilterCriteria, QuickAdd, ExtractorClient, the dispatch-on-actionType "finish", AgentTool, VoiceSession + invariants | The architect's ratification target |
| [`native-flow-contract-reference.md`](native-flow-contract-reference.md) | Exhaustive field-level reference of the native Tada Swift app (data models, FilterEngine, QuickAddParser, RecurrenceEngine, extractor contract, EventKit executor, UI behaviors) | Ground truth for freezing contracts |
| [`clawdia-port-manifest.md`](clawdia-port-manifest.md) | Exact files/props/deps + rename surface to vendor Clawdia's design system + voice (SpiroOrb/VoiceStage + the OpenAI Realtime session) into tada-web | The architect's "port + rebrand" deliverable |

Plus the **marketing landing** (separate lane): [`../../../design/landing-preview/`](../../../design/landing-preview/) — open `index.html` directly in a browser. See its `NOTES.md` and `screenshots/`.

## Headline findings
- **Voice is a near-direct port:** Clawdia already runs OpenAI Realtime over WebRTC with a server-minted ephemeral secret. Vendor `RealtimeVoiceSession` + `useVoiceSession` + the 3 `/api/voice/*` routes; swap routes → our backend + tool registry. (Resolves §9 #5.)
- **Gemini shape confirmed (Context7):** `@google/genai`, `gemini-2.5-flash` (extraction/enrichment, multimodal + `responseSchema` JSON) / `gemini-2.5-pro` (research agent); manual function-calling loop with `automaticFunctionCalling` OFF so write-tools stay gated.
- **"Finish" = dispatch on `actionType`:** meetings/reminders deterministic; research is the only agent. One executor fn per capability, called directly from the tap path and wrapped as a gated tool for voice/chat.
- **Three hero capture flows, one extractor:** screenshot → auto task (flagship) + manual AI-enhanced add ship in P1; forward-an-email is the P2.5 fast-follow (needs per-user alias + inbound-email infra). All three feed the same `ExtractorClient`. (See spec §2.)
- **Recommended night-one sequence:** research skill first (zero auth) → Gmail-invite fast-follow once the single-user Google OAuth seam lands.

## Morning checklist
1. Skim `design/landing-preview/` (open `index.html`) — react / redirect the landing.
2. Review `build-decisions.md` — confirm/override the 6 decisions.
3. Skim `proposed-contracts.md` — the architect ratifies these into frozen law, then we spin up the team.
