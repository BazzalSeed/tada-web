import { execSync } from "node:child_process";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import type { GlobalSetupContext } from "vitest/node";

// ============================================================================
// Integration-test DB harness — used ONLY by vitest.integration.config.ts
// (`npm run test:integration`). The unit suite (`npm test`) never loads this.
//
// Spins up a throwaway Postgres in Docker, applies the committed migrations to
// it, and hands its URL to the test workers (read in vitest.integration.setup
// via inject). The container is destroyed on teardown, so every run is fully
// isolated from the dev DB and from prod. The "test owns the database" model.
// ============================================================================

let container: StartedPostgreSqlContainer | undefined;

export default async function setup({ provide }: GlobalSetupContext) {
  container = await new PostgreSqlContainer("postgres:16-alpine").start();
  const url = container.getConnectionUri();

  // `migrate deploy` applies existing migrations with no shadow DB needed.
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url, DIRECT_URL: url },
  });

  // Env set here does NOT reach the test workers — pass the URL via provide();
  // vitest.integration.setup.ts reads it with inject() and points Prisma at it.
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
