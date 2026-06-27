# Tada Web

Web version of the native macOS **Tada** app: Todoist's to-do *flow* + capture-first AI + a real "do it for me" layer. Two differentiators vs Todoist: **(1) capture is the hero** — email / screenshot / quick add (typed or spoken) → AI extracts structured todos; **(2) it does the task for you** — books the meeting, sets the reminder, runs deep research — gated by one explicit tap.

Tagline: **Not to-do. Ta-da.** Lives at [gettada.app](https://gettada.app) (apex = marketing landing; `app.gettada.app` = the product).

## Tech stack

- **Next.js 16** (App Router, React Server Components, TypeScript only — no Python).
- **React 19** for the client UI.
- **Neon serverless Postgres** via **Prisma 6** (ORM + migrations).
- **Auth.js (NextAuth v5)** — Google OAuth (offline, so we hold a refresh token for Calendar) + a dev-only credentials login.
- **Vercel AI SDK** (`ai` + `@ai-sdk/google`) running **Gemini** — `gemini-2.5-flash` for extraction/enrichment/chat, `gemini-2.5-pro` for deep research. **No Claude/Anthropic in the product runtime** (cost decision).
- **OpenAI Realtime** (WebRTC) for voice only.
- **Vercel Blob** for capture images; **Vercel** hosting.
- **Vitest** + Testing Library for tests.

## Repository layout

```
app/                  Next.js App Router — routes, route handlers, UI
  layout.tsx          Root layout (fonts + global styles)
  page.tsx            Apex marketing landing (gettada.app)
  app/page.tsx        The product app shell (/app, auth-gated)
  dev-login/          Dev-only test sign-in page
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
  auth.ts             currentUser() boundary + invite/admin gating
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
auth.ts               Auth.js v5 config (root) — Google + dev-login providers
auth.config.ts        Edge-safe (Prisma-free) auth config for the proxy gate
proxy.ts              Next 16 "proxy" (middleware) — redirects unauthed /app → /
types/                Type augmentation (next-auth session shape)
scripts/              mint-invite.ts (CLI to create invite codes)
design/landing-preview/  Self-contained HTML/CSS landing seed (iterated on)
docker/, Dockerfile, docker-compose.yml   Local e2e stack (see docs/DOCKER.md)
docs/                 Spec, prep pack, setup, QA, Docker (see "Docs" below)
```

Two `lib` directories on purpose: **`lib/`** is server-only core (DB, AI, executors, frozen contracts); **`app/lib/`** is client-side React/UI logic. The `@/*` import alias maps to the repo root (`tsconfig.json`), so `@/lib/...` is the server core and `@/app/lib/...` is the client.

### The API surface (`app/api/`)

| Route | Purpose |
|---|---|
| `POST /api/capture` | image/text capture → capture-first → Gemini extract |
| `GET /api/captures` | hydrate source captures (row thumbnails) |
| `POST /api/blob/upload` | signed direct-to-Blob upload for large capture images |
| `POST /api/enrich` | async quick-add enrichment (labels/dates/offer) |
| `POST /api/todos`, `PATCH /api/todos/:id`, `POST /api/todos/:id/reorder` | todo CRUD + drag (deterministic, no LLM) |
| `POST /api/todos/:id/finish` | "do it for me" tap path — dispatch on `actionType` |
| `POST /api/labels` | inline label upsert |
| `POST /api/research`, `GET /api/research/:id` | deep-research job + progress |
| `POST /api/chat` | text agent (AI SDK `useChat`, gated write tools) |
| `POST /api/voice/{session,tool,usage}` | OpenAI Realtime relay (shared tool registry) |
| `POST /api/contacts/{resolve,search}` | Google contact name → email |
| `POST /api/inbound/email` | inbound-email capture webhook (built, dormant) |
| `POST /api/waitlist` | landing waitlist capture |
| `/api/auth/*` | Auth.js (Google OAuth + dev-login) |

## Running it locally

Requires Node and a reachable Postgres (Neon, or the bundled Docker Postgres). Secrets live in gitignored `.env` files; copy `.env.example` to `.env` and fill in the values (Neon `DATABASE_URL`/`DIRECT_URL`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, Auth.js + Google OAuth, `BLOB_READ_WRITE_TOKEN`). **Never commit a real secret.**

```bash
npm install                 # postinstall runs `prisma generate`
npm run prisma:migrate      # apply migrations to your dev database (prisma migrate dev)
npm run dev                 # next dev — http://localhost:3000
```

Useful scripts (`package.json`):

| Script | What it does |
|---|---|
| `npm run dev` | Next dev server |
| `npm run build` | production build (`next build`) |
| `npm run vercel-build` | `prisma generate` → migrate-deploy (prod only) → build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` / `npm run test:watch` | Vitest |
| `npm run prisma:migrate` | `prisma migrate dev` |
| `npm run prisma:deploy` | `prisma migrate deploy` |

Notes:
- **Local Google OAuth needs port 3000** — the registered redirect URI is `http://localhost:3000/api/auth/callback/google`. To sign in without Google, set `ENABLE_DEV_LOGIN=1` (non-prod only) and use `/dev-login`.
- The marketing landing can be previewed standalone: `python3 design/landing-preview/.nocache_server.py` (serves `:8731` with no caching).
- For a full containerized e2e stack (app + Postgres), see `docs/DOCKER.md`.

## Architecture in one paragraph

A **deterministic to-do spine** (the model is never in the list's hot path) with a thin AI layer bolted on through interfaces (seams). Capture is **capture-first**: every source (screenshot / typed-or-spoken quick-add / forwarded email) persists a `Capture` + a plain `Todo` *before* the extractor runs, so a failed extraction still leaves a usable todo. "Do it for me" dispatches on a todo's `actionType` — **meetings and reminders are deterministic executors; research is the only agent loop**. There is **one executor function per capability**, called directly from the tap path *and* wrapped as a gated AI-SDK tool for chat/voice. **Nothing executes a side effect automatically** — every write shows its concrete effect and fires only on an explicit tap or an approved tool-call.

## Docs

- **Canonical spec (read first):** `docs/superpowers/specs/2026-06-24-tada-web-v0-design.md`
- **Prep pack:** `docs/superpowers/prep/` — `stack-decisions.md`, `proposed-contracts.md`, `build-decisions.md`, `native-flow-contract-reference.md`, `clawdia-port-manifest.md`, `neon-setup.md`
- **Agent guide:** `CLAUDE.md` (locked decisions, design system, conventions)
- **New to TypeScript/Next.js?** `docs/onboarding-for-django-devs.md` maps everything to Django and walks each golden flow end-to-end through real files.
- **Setup (what only the owner can provision):** `docs/setup/user-setup.md`
- **Local Docker e2e:** `docs/DOCKER.md`
- **Latest QA status:** `docs/qa/`
