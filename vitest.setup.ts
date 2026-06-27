import "@testing-library/jest-dom/vitest";
import { inject } from "vitest";

// When the integration suite runs (`npm run test:db` → RUN_DB_TESTS=1), the
// globalSetup booted an isolated Postgres container and provided its URL. Point
// every DB client at it before any test imports one. This runs once per worker,
// before its test modules load (env from globalSetup doesn't reach workers).
if (process.env.RUN_DB_TESTS) {
  const url = inject("testDbUrl");
  if (url) {
    process.env.DATABASE_URL = url;
    process.env.DIRECT_URL = url;
    process.env.TADA_TEST_DATABASE_URL = url;
  }
}
