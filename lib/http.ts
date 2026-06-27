// ============================================================================
// Shared HTTP helpers for app/api/** route handlers — consistent JSON envelopes
// and error→status mapping. QuotaError (402) carries its own status; auth/not-
// found are mapped by message until the typed errors land (T3.6).
// ============================================================================

import { QuotaError } from "./contracts";

export const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (msg: string) => new HttpError(400, msg);

// Maps a thrown error to a JSON error Response.
export function handleApiError(err: unknown): Response {
  if (err instanceof HttpError) return json({ error: err.message }, err.status);
  if (err instanceof QuotaError) return json({ error: err.message }, err.status);
  const msg = err instanceof Error ? err.message : "Internal error";
  if (/unauthor/i.test(msg)) return json({ error: msg }, 401);
  if (/not found/i.test(msg)) return json({ error: msg }, 404);
  return json({ error: "Internal error" }, 500);
}

// Parses a JSON request body; throws a 400 on malformed input.
export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw badRequest("Invalid JSON body");
  }
}
