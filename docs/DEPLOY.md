# Deploy — production on Vercel + Neon

How Tada Web ships to production and how to verify a deploy. Production is **git-driven**:
pushing `main` triggers a Vercel build that runs database migrations and publishes the app.
There is **no hosted CI** — the gate (`npm run ci`) runs locally before every push.

Live at **[gettada.app](https://gettada.app)** (apex = marketing landing) + **app.gettada.app** (the product).

## TL;DR

```bash
npm run ci            # typecheck + unit + integration (Docker up). MUST be green.
git push origin main  # Vercel auto-builds → migrate deploy → publishes production
```

That's the whole deploy. Migrations are applied by the build (see below) — you do **not** run
them by hand. Verify with the [checklist](#verify-a-deploy) once Vercel reports `READY`.

## The pieces

| Piece | Value |
|---|---|
| Vercel project | `tada-web` (`prj_ajFhLqNhVpufQpUJZdZUH57yc29M`), team `team_bCfT4OBL1ACH4RMqjEzZk6m6` |
| Neon project | `rough-wave-14707909`, prod branch `production` (`br-green-shape-aj1jtzbm`, pooled) |
| Domains | `gettada.app` (apex, landing) · `app.gettada.app` (app) |
| Prod branch | **`main`** — push auto-deploys production. `v0` and feature branches → Preview. |
| Host | Vercel (Fluid Compute, Node). Runtime DB = Neon Postgres via Prisma. |

## How a deploy runs

Vercel is git-connected to the GitHub repo (`BazzalSeed/tada-web`):

1. Push to `main` → Vercel starts a **Production** build (`VERCEL_ENV=production`).
2. The build runs the **`vercel-build`** script (`package.json`):
   ```
   prisma generate
     && if [ "$VERCEL_ENV" = "production" ]; then prisma migrate deploy; fi
     && next build
   ```
   So on production builds it generates the client, **applies any pending migrations to
   Neon**, then builds Next. Preview builds skip `migrate deploy` (and have no
   `DATABASE_URL` — prod DB env is Production-scoped only), so they are build-checks, not
   data deploys.
3. On success the deployment goes `READY` and the `gettada.app` / `app.gettada.app` aliases
   point at it. `vercel deploy --prod` is an equivalent manual trigger.

## Migrations — single source, never run by hand

**The `vercel-build` step is the only thing that migrates production.** `prisma migrate
deploy` is idempotent (it applies only un-applied migrations and records them in
`_prisma_migrations`), so re-deploys are safe no-ops when nothing is pending.

- Prisma datasource (`prisma/schema.prisma`): `url = DATABASE_URL` (pooled, app runtime),
  `directUrl = DIRECT_URL` (non-pooled — **migrations use this**). Both are Vercel
  Production env vars.
- **Do NOT run `prisma migrate deploy` against the prod branch manually.** Let the build do
  it. Manual runs risk racing the build and split-brain migration state.

**Adding a migration:**

```bash
npm run prisma:migrate   # = dotenv -e .env.local -- prisma migrate dev (creates the file vs local DB)
git add prisma/migrations && git commit && git push origin main   # prod build applies it
```

**Verify migration state on Neon** (read-only — safe). Via the Neon MCP, or any SQL client
on the prod branch:

```sql
SELECT migration_name, finished_at, applied_steps_count, rolled_back_at
FROM _prisma_migrations ORDER BY started_at;
```

All rows should have `rolled_back_at = NULL` and a non-null `finished_at`. The migration
files in `prisma/migrations/` are the source of truth; every one should appear here.

## Environment variables

Production reads from the **Vercel env store** (Production scope), never from a file in the
repo. `.env*` files are gitignored — **never commit a secret**. Inspect names with
`vercel env ls production`; pull a local reference copy with
`vercel env pull .env.prod --environment=production`.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Neon prod Postgres — pooled (runtime) / direct (migrations) |
| `AUTH_SECRET` | Auth.js (NextAuth v5) session/JWT signing |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth client (sign-in + Calendar/People scopes) |
| `AUTH_URL` / `AUTH_TRUST_HOST` | Auth.js base URL / trust the Vercel proxy host |
| `GEMINI_API_KEY` | Gemini — extract / enrich / chat / research |
| `OPENAI_API_KEY` | OpenAI Realtime — voice |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob — capture image storage |
| `ADMIN_EMAILS` | Comma-list granted the admin/unlimited plan |
| `AGENT_MEMORY_DATABASE_URL` | Separate store for agent memory |
| `POSTMARK_INBOUND_WEBHOOK_SECRET` | Inbound email capture webhook (forward-an-email; dormant in v0) |

## Auth in production

- `/api/auth/providers` must be **Google-only** in prod. The dev-login shortcut is
  non-production only and must never be enabled on prod.
- The Google OAuth client must have the prod redirect URI registered
  (`https://app.gettada.app/api/auth/callback/google`). Full Google sign-in cannot be
  driven headlessly (Google blocks automation), so the authenticated app and real-token
  flows (Calendar invite, People contact resolution) are **human-verified** by signing in
  with a real account.

## Verify a deploy

After Vercel reports `READY`, run these (all read-only / public):

```bash
# 1. Public surfaces respond
curl -s -o /dev/null -w "landing %{http_code}\n"  -L https://gettada.app/
curl -s -o /dev/null -w "app %{http_code}\n"      -L https://app.gettada.app/

# 2. Auth is Google-only (dev-login NOT exposed)
curl -s https://app.gettada.app/api/auth/providers   # → {"google":{...}} only

# 3. Favicon is the branded mark (not the generic default)
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" https://gettada.app/icon.svg
```

Then, for the real-browser pass (per `CLAUDE.md`, thorough flows use Playwright):

- **Landing** (`gettada.app`) renders the hero + how-it-works, **0 console errors**.
- **Auth gate**: visiting `app.gettada.app/app` unauthenticated redirects back to the
  landing (the app is not leaked).
- **Vercel** shows the latest `main` commit as a `READY` Production deployment
  (`vercel ls`, the dashboard, or the Vercel MCP `list_deployments`).
- **Neon**: the migration query above shows every migration applied, none rolled back.

Full authenticated app behaviour (capture → enrich → meeting/research execution) needs a
real Google session and is verified manually.

## Rollback

Every prod deployment is a rollback candidate. From the Vercel dashboard (Deployments →
the previous `READY` production build → **Promote to Production** / **Rollback**), or
`vercel rollback <deployment-url>`. A bad migration is **not** auto-reverted by a rollback —
write a forward migration to fix schema, then deploy.

## Guardrails

- **`npm run ci` green before every push.** No hosted CI; the local run is the gate. (See `AGENTS.md`.)
- **Never commit secrets.** `.env*` is gitignored; prod secrets live only in the Vercel env store.
- **Never migrate prod by hand** — the `vercel-build` step owns it (idempotent).
- **Rotate dev credentials before any real public launch** (Google OAuth + Postmark were
  exposed in build transcripts during development).
- **Never auto-execute a side effect** — every write action (meeting invite, reminder,
  research) fires only on an explicit tap / confirmed tool-call. This is a product invariant
  the deploy must never weaken.
