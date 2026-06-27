#!/usr/bin/env bash
# Tada Web container entrypoint: migrate the local DB, optional seed, then dev server.
set -euo pipefail

# Regenerate the client first so a live schema edit (bind-mounted source) is
# reflected even though node_modules is a persisted anonymous volume.
echo "▶ Generating Prisma client (prisma generate)…"
npx prisma generate

echo "▶ Waiting for Postgres + applying migrations (prisma migrate deploy)…"
npx prisma migrate deploy

# Optional seed hook — runs only if a seed file is present (backend may add one).
if [ -f prisma/seed.mjs ]; then
  echo "▶ Seeding (prisma/seed.mjs)…"
  node prisma/seed.mjs
fi

echo "▶ Starting Next.js dev server on 0.0.0.0:3000…"
exec npm run dev -- -H 0.0.0.0 -p 3000
