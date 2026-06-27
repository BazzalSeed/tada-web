import { PrismaClient } from "@prisma/client";

// ============================================================================
// Singleton PrismaClient + transient-connection retry.
//
// Neon scales-to-zero on idle; a long request (e.g. the ~10-20s Gemini call in
// the capture pipeline) can leave a pooled connection idle long enough that Neon
// terminates it (SqlState 57P01 — "terminating connection due to administrator
// command"), or the first query after a cold compute can't reach the server
// (P1001/P1017). A single dropped connection then surfaced as an unhandled 500.
//
// A `query` extension wraps EVERY model operation and retries a small number of
// times on these *connection-level* faults only. On such a fault the statement
// never committed (the connection was torn down / the implicit transaction
// rolled back), so a retry is safe even for writes — it re-establishes the
// connection and re-runs. Logic errors (unique violations, not-found, etc.) are
// never retried. This fixes the pattern app-wide (every endpoint via the store
// + quota), not just capture.
// ============================================================================

// Substrings / codes that indicate a *connection-level* fault worth retrying.
// 57P01: admin shutdown (Neon autosuspend). 08006/08003/08001: connection
// exception. P1001/P1002/P1017: Prisma can't-reach / closed-connection.
const RETRYABLE_PATTERNS = [
  "57P01",
  "08006",
  "08003",
  "08001",
  "terminating connection due to administrator command",
  "connection terminated",
  "server has closed the connection",
  "can't reach database server",
  "the database server",
  "kind: closed",
  "connection closed",
  "connection reset",
  "econnreset",
];
const RETRYABLE_CODES = new Set(["P1001", "P1002", "P1008", "P1017"]);

function isRetryableConnectionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" && RETRYABLE_CODES.has(code)) return true;
  const msg = (err as { message?: unknown }).message;
  if (typeof msg !== "string") return false;
  const lower = msg.toLowerCase();
  return RETRYABLE_PATTERNS.some((p) => lower.includes(p));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// Total attempts including the first try. 3 → up to 2 retries.
const MAX_ATTEMPTS = 3;

function basePrisma(): PrismaClient {
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function makePrisma(): PrismaClient {
  // The retry extension is `query`-only, so it preserves every base delegate;
  // casting back to PrismaClient keeps the store/quota/test call sites unchanged.
  return basePrisma().$extends({
    name: "retry-transient-connection",
    query: {
      $allModels: {
        async $allOperations({ args, query, model, operation }) {
          let lastErr: unknown;
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
              return await query(args);
            } catch (err) {
              lastErr = err;
              if (attempt >= MAX_ATTEMPTS || !isRetryableConnectionError(err)) {
                throw err;
              }
              // Exponential-ish backoff (50ms, 150ms) to let Neon resume.
              const backoff = 50 * Math.pow(3, attempt - 1);
              console.warn(
                `[db] transient connection fault on ${model}.${operation} (attempt ${attempt}/${MAX_ATTEMPTS}); retrying in ${backoff}ms`,
              );
              await sleep(backoff);
            }
          }
          throw lastErr;
        },
      },
    },
  }) as unknown as PrismaClient;
}

// Singleton — avoids exhausting connections during dev HMR.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma = globalForPrisma.prisma ?? makePrisma();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Exported for direct use / unit testing of the retry predicate.
export { isRetryableConnectionError };
