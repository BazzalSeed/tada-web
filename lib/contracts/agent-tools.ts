// ============================================================================
// FROZEN v0 CONTRACT — agent tool registry (shared by chat + voice).
// Runtime = Vercel AI SDK (Gemini provider): each AgentTool maps to an AI SDK
// `tool({ inputSchema, execute })`; `card` is returned as generative UI (a tile).
// Read tools auto-run; write tools are gated (human-in-the-loop Approve/Deny)
// before run() — no auto-execute of side effects.
// ============================================================================

import type { UserCtx } from "./auth";

export interface AgentTool {
  name: string;
  gated: boolean; // true => write tool, requires approval before run()
  inputSchema: unknown; // zod schema
  run(
    args: unknown,
    user: UserCtx,
  ): Promise<{ output: string; card?: unknown }>;
}

export type AgentToolRegistry = Record<string, AgentTool>;
