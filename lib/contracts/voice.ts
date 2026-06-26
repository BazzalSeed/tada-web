// ============================================================================
// FROZEN v0 CONTRACT — voice seam (OpenAI Realtime over WebRTC).
// Vendored from Clawdia, reimplemented against our backend + shared AgentTool
// registry. Routes: POST /api/voice/session (mint ephemeral OpenAI secret +
// embed our tool defs), POST /api/voice/tool (-> registry, gated writes),
// POST /api/voice/usage (token accounting).
// ============================================================================

export type VoiceStatus =
  | "connecting"
  | "listening"
  | "thinking"
  | "speaking"
  | "error"
  | "ended";

export interface VoiceSessionCallbacks {
  onStatus(s: VoiceStatus): void;
  onTranscript(t: { user: string; assistant: string }): void;
  onTool(t: { tool: string; label: string; detail?: string } | null): void;
  onError(m: string): void;
  onClosed?(turns: unknown[]): void;
}

export interface VoiceSession {
  start(seed?: () => unknown[]): Promise<void>;
  stop(): void;
  setMicEnabled(b: boolean): void;
  level(): number;
}
