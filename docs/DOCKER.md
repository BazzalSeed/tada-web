# Local e2e stack — `docker compose up`

A self-contained Tada Web for end-to-end testing and audits. No cloud Neon — a local
Postgres container holds the data. The only cloud dependencies are the AI APIs
(Gemini for extraction, OpenAI for voice) and optionally Vercel Blob for image capture.

## TL;DR

```bash
# from repo root (needs Docker Desktop running). Canonical port is 3000.
docker compose up --build
# → open http://localhost:3000
# → sign in either way (see "Two auth paths" below)
# → capture a todo (type / paste) → it extracts into structured todos
```

`docker compose down` stops it; `docker compose down -v` also wipes the local DB volume.

### Port — use 3000

The app maps host **port 3000** by default, because that's the localhost redirect URI
registered on the Google OAuth client — **real Google sign-in only works on 3000**. Free
:3000 first if another project is using it.

Smoke-testing while 3000 is busy? Bring it up on another host port — **dev-login works on
any port** (real Google won't, redirect mismatch):

```bash
APP_PORT=3939 docker compose up --build   # → http://localhost:3939, dev-login only
```

## Two auth paths (both supported locally)

1. **Real Google OAuth** (primary audit path) — visit `http://localhost:3000`, click sign in,
   use your real Google account (`seedzpy@gmail.com` is a test user + admin). Gets a real
   refresh_token, so **meeting / contacts "do-it-for-me" features work locally**. Requires
   `AUTH_GOOGLE_ID`/`AUTH_GOOGLE_SECRET`/`AUTH_SECRET` in `.env` (they're passed through) and
   host port 3000.
2. **Dev-login** (automated testing) — `http://localhost:3000/dev-login`, no password, no
   Google. For the reviewer's Playwright runs. Enabled via `ENABLE_DEV_LOGIN=1` (dev mode only).

## What's in the stack

| Service | Image | Purpose |
|---|---|---|
| `db` | `pgvector/pgvector:pg16` | Local Postgres (pgvector available for future embeddings). Healthchecked. |
| `app` | built from `./Dockerfile` | Next.js dev server on `:3000`. Runs `prisma migrate deploy` on start. |

## Key design notes

- **No DB-driver toggle.** The app uses plain Prisma (`new PrismaClient()`) over a
  standard `postgresql://` URL — Neon is only the *host* in prod. So pointing
  `DATABASE_URL`/`DIRECT_URL` at the local `db` container "just works"; no adapter swap.
- **Dev mode is intentional.** The container runs `next dev` with `NODE_ENV=development`
  because the dev-login gate is `NODE_ENV !== 'production' && ENABLE_DEV_LOGIN === '1'`.
  A production build would (correctly) disable dev-login. This image is **local-only** and
  must never be the production deploy.
- **Both auth paths work** (see above): real Google OAuth on :3000 (primary) and dev-login
  (`ENABLE_DEV_LOGIN=1`, `seedzpy@gmail.com` is admin → `plan='unlimited'`).
- **`.env` precedence (and why secrets aren't in `environment:`).** `app` loads `./.env` via
  `env_file`, which supplies all secrets/cloud keys: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`,
  `AUTH_SECRET`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `BLOB_READ_WRITE_TOKEN`. The compose
  `environment:` block lists **only** the overrides (`DATABASE_URL`/`DIRECT_URL` → local DB,
  `NODE_ENV`, dev-login, `AUTH_URL`/`AUTH_TRUST_HOST`). Secrets are deliberately *not* in
  `environment:` — because `environment` wins over `env_file`, listing `${GEMINI_API_KEY:-}`
  there would blank the real key whenever it isn't also exported in the shell. Keeping them
  in `env_file` only means the real `.env` values always flow through.
- **Secrets never enter the image.** `.env`/`.env.local` are in `.dockerignore`; creds are
  read at runtime via `env_file`, not baked into image layers, and never committed.

## What works fully offline vs. needs a key

| Flow | Requirement |
|---|---|
| Sign in (`/dev-login`), todo CRUD, views, subtasks, filters | local only ✓ |
| Capture → AI extraction → structured todos | `GEMINI_API_KEY` (set in `.env`) |
| Image/screenshot capture upload | `BLOB_READ_WRITE_TOKEN` (set in `.env`); text capture works without it |
| Voice chat | `OPENAI_API_KEY` (set in `.env`) |

If `.env` already has these (it does in this repo's gitignored `.env`), `docker compose up`
needs **zero** extra setup.

## Optional seed

`docker/entrypoint.sh` runs `prisma/seed.mjs` if it exists (none committed yet — dev-login
creates the user on first login). Add one there if you want sample data on `up`.
