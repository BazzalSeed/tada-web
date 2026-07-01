# Current design

How Tada Web is built today — architecture, repository layout, and the HTTP surface. For getting it running see the [README](../README.md); for a Django-developer's flow-by-flow walkthrough see [onboarding-for-django-devs.md](./onboarding-for-django-devs.md); for the non-negotiable decisions see [CLAUDE.md](../CLAUDE.md).

## Architecture in one paragraph

A **deterministic to-do spine** (the model is never in the list's hot path) with a thin AI layer bolted on through interfaces (seams). Capture has two paths: a single short typed line stays **instant** — a plain `Todo` is created directly, no model in the loop. Everything else worth extracting (a screenshot, or a typed/spoken paragraph) goes through **propose → review → commit**: `POST /api/capture/propose` runs the Gemini extractor over the source *without persisting anything*, the user reviews/edits the proposed todos in a modal (`CaptureReview`, add-or-drop-a-note-and-retry on a failed parse), and only an explicit "Add N todos" tap calls `POST /api/capture/commit` to persist the `Capture` + `Todo` rows. Nothing is created until the user approves. "Do it for me" dispatches on a todo's `actionType` — **meetings and reminders are deterministic executors; research is the only agent loop**. There is **one executor function per capability**, called directly from the tap path *and* wrapped as a gated AI-SDK tool for chat/voice. **Nothing executes a side effect automatically** — every write shows its concrete effect and fires only on an explicit tap or an approved tool-call.

## Repository layout

```
app/                  Next.js App Router — routes, route handlers, UI
  layout.tsx          Root layout (fonts + global styles)
  page.tsx            Apex marketing landing (gettada.app)
  app/page.tsx        The product app shell (/app, auth-gated)
  tokens/             Design-token smoke page
  api/                Route handlers (the backend HTTP surface) — see below
  components/         React components by domain: capture, chat, voice,
                      todo, shell, views, landing, app
  lib/                CLIENT-side logic: store (React reducer/context),
                      api seam, capture, enrich, offer, selectors, format,
                      reorder, markdown, voice/
  styles/             Design tokens (CSS custom properties) + fonts

lib/                  SERVER-side core (the deterministic spine + AI seams)
  contracts/          Frozen TypeScript interfaces/types — the seams every
                      other module builds against (store, extractor,
                      executors, agent-tools, voice, quota, auth, filter)
  core/               Pure, deterministic functions (flow filtering, offers)
  db.ts               Prisma client singleton
  store.ts            TadaStore — Prisma-backed CRUD/reorder/labels/views
  auth.ts             currentUser() boundary + sign-in admission (beta: any Google test-user)
  capture.ts          Capture-first pipeline (shared by all capture sources)
  extractor.ts        Gemini extractor + enricher (generateObject + Zod)
  executors.ts        "do it for me": setReminder / sendMeetingInvite / deepResearch
  finish.ts           finishTodo dispatch on actionType (the tap path)
  research.ts         Deep-research runner (the only agent loop)
  agent-tools.ts      Shared AgentTool registry (chat + voice), gated writes
  quota.ts            withQuota plan/credit metering
  contacts.ts         Google People contact resolution
  google.ts           Google OAuth token refresh
  inbound.ts          Inbound-email capture helpers (built, dormant — see below)
  http.ts             Route-handler helpers (json/error/readJson)

prisma/               schema.prisma + migrations (Neon)
auth.ts               Auth.js v5 config (root) — Google OAuth provider
auth.config.ts        Edge-safe (Prisma-free) auth config for the proxy gate
proxy.ts              Next 16 "proxy" (middleware) — redirects unauthed /app → /
types/                Type augmentation (next-auth session shape)
design/landing-preview/  Self-contained HTML/CSS landing seed (iterated on)
docker/, Dockerfile, docker-compose.yml   Local e2e stack (see docs/DOCKER.md)
docs/                 architecture.md, onboarding-for-django-devs.md, DOCKER.md, DEPLOY.md
```

Two `lib` directories on purpose: **`lib/`** is server-only core (DB, AI, executors, frozen contracts); **`app/lib/`** is client-side React/UI logic. The `@/*` import alias maps to the repo root (`tsconfig.json`), so `@/lib/...` is the server core and `@/app/lib/...` is the client.

## The API surface (`app/api/`)

| Route | Purpose |
|---|---|
| `POST /api/capture` | legacy image/text capture-first entry point |
| `POST /api/capture/propose` | Gemini extract over a source WITHOUT persisting — feeds the review modal |
| `POST /api/capture/commit` | persist the `Capture` + reviewed/edited `Todo` rows once the user approves |
| `GET /api/captures` | hydrate source captures (row thumbnails) |
| `POST /api/blob/upload` | signed direct-to-Blob upload for large capture images |
| `POST /api/enrich` | async quick-add enrichment (labels/dates/offer) |
| `POST /api/todos`, `PATCH /api/todos/:id`, `POST /api/todos/:id/reorder` | todo CRUD + drag (deterministic, no LLM) |
| `POST /api/todos/:id/finish` | "do it for me" tap path — dispatch on `actionType` |
| `POST /api/labels` | inline label upsert |
| `POST /api/research`, `GET /api/research/:id` | deep-research job + progress |
| `GET/POST /api/chat` | text agent (AI SDK `useChat`, gated write tools); persisted + memory-managed — see [chat-persistence.md](chat-persistence.md) |
| `POST /api/voice/{session,tool,usage}` | OpenAI Realtime relay (shared tool registry) |
| `POST /api/contacts/{resolve,search}` | Google contact name → email |
| `POST /api/inbound/email` | inbound-email capture webhook (built, dormant) |
| `/api/auth/*` | Auth.js (Google OAuth) |
