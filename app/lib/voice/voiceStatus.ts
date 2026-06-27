import type { VoiceStatus } from "@/lib/contracts";

// The lifecycle flags the visible status derives from (ported from Clawdia's
// voice client). `phase` overrides at call boundaries; within "live" the three
// booleans decide listening / thinking / speaking. THINKING WINS: any pending
// work (awaiting her response OR a tool in flight) reads as thinking even while
// audio plays, so a tool overlapping a spoken preamble stays "still working".
export interface VoicePhaseFlags {
  phase: "connecting" | "live" | "ended" | "error";
  awaitingResponse: boolean;
  toolPending: boolean;
  audioPlaying: boolean;
}

export function deriveVoiceStatus(f: VoicePhaseFlags): VoiceStatus {
  if (f.phase === "connecting") return "connecting";
  if (f.phase === "error") return "error";
  if (f.phase === "ended") return "ended";
  if (f.awaitingResponse || f.toolPending) return "thinking";
  if (f.audioPlaying) return "speaking";
  return "listening";
}
