import { execSync } from "node:child_process";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import type { GlobalSetupContext } from "vitest/node";

// ============================================================================
// Integration-test DB harness (the "test owns the database" model).
//
// `npm test` leaves RUN_DB_TESTS unset → this no-ops, the DB tests skip, and
// the suite needs no Docker. `npm run test:db` sets RUN_DB_TESTS=1 → we spin up
// a throwaway Postgres in Docker, apply the committed migrations to it, and hand
// its URL to the test workers. The container is destroyed on teardown, so every
// run is fully isolated from your dev DB and from prod.
// ============================================================================

let container: StartedPostgreSqlContainer | undefined;

export default async function setup({ provide }: GlobalSetupContext) {
  if (!process.env.RUN_DB_TESTS) return;

  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const url = container.getConnectionUri();

  // `migrate deploy` applies existing migrations with no shadow DB needed.
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });

  // Env set here does NOT reach the test workers — pass the URL via provide();
  // vitest.setup.ts reads it with inject() and points Prisma at it.
  provide("testDbUrl", url);

  return async () => {
    await container?.stop();
  };
}

declare module "vitest" {
  interface ProvidedContext {
    testDbUrl: string;
  }
}
