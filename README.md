# Tada Web

Web version of the native macOS **Tada** app: Todoist's to-do *flow* + capture-first AI + a real "do it for me" layer. Two differentiators vs Todoist: **(1) capture is the hero** — email / screenshot / quick add (typed or spoken) → AI extracts structured todos; **(2) it does the task for you** — books the meeting, sets the reminder, runs deep research — gated by one explicit tap.

Tagline: **Not to-do. Ta-da.** Lives at [gettada.app](https://gettada.app) (apex = marketing landing; `app.gettada.app` = the product).

## Stack at a glance

Next.js 16 (App Router, RSC) · React 19 · TypeScript only · Neon Postgres via Prisma 6 · Auth.js (NextAuth v5, Google OAuth) · Vercel AI SDK running **Gemini** (`gemini-2.5-flash` extract/enrich/chat, `gemini-2.5-pro` research) · OpenAI Realtime (voice) · Vercel Blob (capture images) · Vitest. **No Claude/Anthropic in the product runtime** (cost decision). Hosted on Vercel.

## Setup

Requires Node and a Postgres database (local Docker Postgres for dev — see [docs/DOCKER.md](docs/DOCKER.md) — or Neon).

Secrets live in gitignored env files. Copy the template and fill it in:

```bash
cp .env.example .env.local  # next dev reads it; prisma:migrate feeds it via dotenv-cli
```

`.env.example` documents every variable you need (database URL, `GEMINI_API_KEY`, `OPENAI_API_KEY`, Auth.js + Google OAuth, `BLOB_READ_WRITE_TOKEN`) and defaults the database to the local Docker Postgres. **Never commit a real secret.**

Env layout: **`.env.local`** = local dev (local DB) — read by `next dev`, and fed to Prisma by the `prisma:migrate` script. **`.env.prod`** = a parallel reference of the production values (`vercel env pull .env.prod --environment=production`) — loaded by no tool automatically. Production itself reads from the **Vercel** env store, not from any local file.

Most tests are pure and run on every `npm test`. The four DB integration tests (`db`, `invite`, `quota`, `store`) are gated behind the `RUN_DB_TESTS` flag and **skipped by default**; to run them, set `RUN_DB_TESTS=1` and point at an isolated test database (e.g. a `.env.test` with a dedicated DB — Vitest auto-loads it).

## Run it locally

```bash
docker compose up -d db     # start the local Postgres (see docs/DOCKER.md)
npm install                 # postinstall runs `prisma generate`
npm run prisma:migrate      # apply migrations to the local database
npm run dev                 # http://localhost:3000
```

- **Google OAuth needs port 3000** — the registered redirect URI is `http://localhost:3000/api/auth/callback/google`. To sign in without Google, set `ENABLE_DEV_LOGIN=1` (non-prod only) and use `/dev-login`.
- Other scripts: `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`. The marketing landing previews standalone via `python3 design/landing-preview/.nocache_server.py`.

## Docs

- **How it's built:** [docs/current-design.md](docs/current-design.md) — architecture, repo layout, the `app/api` surface.
- **New to TypeScript/Next.js?** [docs/onboarding-for-django-devs.md](docs/onboarding-for-django-devs.md) — maps everything to Django and walks each golden flow end-to-end.
- **Locked decisions / conventions:** [CLAUDE.md](CLAUDE.md).
- **Local Docker e2e stack:** [docs/DOCKER.md](docs/DOCKER.md).
