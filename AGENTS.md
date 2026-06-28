# AGENTS.md — Tada Web

Working agreement for any agent (or human) committing to this repo. For
orientation see `README.md`, `docs/architecture.md`, and `CLAUDE.md` (the full
agent guide with the locked decisions).

## Local CI — run before every push

This repo has **no hosted CI** — CI runs **locally**. Before every `git push`,
run the full check, and push **only if it is green**:

```bash
npm run ci
```

`npm run ci` = `npm run typecheck && npm test && npm run test:integration`, i.e.:

- **`npm run typecheck`** — `tsc --noEmit`.
- **`npm test`** — the unit suite (`*.test.ts`). Pure, no database.
- **`npm run test:integration`** — the DB integration suite (`*.integration.test.ts`)
  against a throwaway Postgres container. **Docker must be running** (the daemon;
  testcontainers starts and tears down its own Postgres — you do not need the dev
  DB up for this).

Rules:
- Never push with a failing **or unrun** suite. "It's just docs" still gets a push only after `npm run ci` is green (or at minimum `npm test` + `npm run typecheck` when the change cannot affect server/DB code — but the default is full `npm run ci`).
- If Docker isn't available, you can't complete integration CI — start Docker first, or don't push.
- Adding a DB-touching code path? Add or update a `*.integration.test.ts` for it, and confirm it runs under `npm run test:integration`.

## Pointers
- Setup & how to run locally → `README.md`
- Architecture, repo layout, the `app/api` surface → `docs/architecture.md`
- Locked decisions, design system, conventions → `CLAUDE.md`
- New to TypeScript/Next.js (coming from Django) → `docs/onboarding-for-django-devs.md`
- Env layout: `.env.local` = local dev (local Docker Postgres), `.env.prod` = prod reference. Production reads env from **Vercel**, not from any local file.
