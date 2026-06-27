import { inject } from "vitest";

// The globalSetup booted an isolated Postgres container and provided its URL.
// Point every Prisma client at it before any test imports one (this runs once
// per worker, before its test modules load — env from globalSetup doesn't reach
// workers, so we inject it here).
const url = inject("testDbUrl");
process.env.DATABASE_URL = url;
process.env.DIRECT_URL = url;
process.env.TADA_TEST_DATABASE_URL = url;
