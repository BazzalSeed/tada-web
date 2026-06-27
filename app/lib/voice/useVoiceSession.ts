"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VoiceStatus } from "@/lib/contracts";
import {
  RealtimeVoiceSession,
  type VoiceApproval,
  type VoiceTranscript,
} from "./realtimeVoice";

// React glue for the voice session. The framework-free client owns the WebRTC +
// tool loop; this surfaces its low-frequency state (status / transcript /
// pending approval / error) as React state, and exposes getLevel() as a stable
// getter so the orb can read per-frame amplitude in its OWN rAF without
// re-rendering React 60×/s.
export interface VoiceSessionState {
  active: boolean;
  status: VoiceStatus;
  transcript: VoiceTranscript;
  // The pending gated write awaiting Approve/Deny (never-auto-execute), or null.
  approval: VoiceApproval | null;
  error: string | null;
}

const INITIAL: VoiceSessionState = {
  active: false,
  status: "ended",
  transcript: { user: "", assistant: "" },
  approval: null,
  error: null,
};

export interface UseVoiceSession {
  state: VoiceSessionState;
  start: () => void;
  stop: () => void;
  setMicEnabled: (enabled: boolean) => void;
  getLevel: () => number;
}

export function useVoiceSession(): UseVoiceSession {
  const [state, setState] = useState<VoiceSessionState>(INITIAL);
  const sessionRef = useRef<RealtimeVoiceSession | null>(null);

  const stop = useCallback(() => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setState((s) => ({ ...INITIAL, error: s.error }));
  }, []);

  const start = useCallback(() => {
    if (sessionRef.current) return;
    const session = new RealtimeVoiceSession({
      onStatus: (status) => setState((s) => ({ ...s, status })),
      onTranscript: (transcript) => setState((s) => ({ ...s, transcript })),
      onApproval: (approval) => setState((s) => ({ ...s, approval })),
      onError: (error) => setState((s) => ({ ...s, error })),
    });
    sessionRef.current = session;
    setState({
      active: true,
      status: "connecting",
      transcript: { user: "", assistant: "" },
      approval: null,
      error: null,
    });
    void session.start();
  }, []);

  const setMicEnabled = useCallback((enabled: boolean) => {
    sessionRef.current?.setMicEnabled(enabled);
  }, []);

  const getLevel = useCallback(() => sessionRef.current?.level() ?? 0, []);

  // Release the mic/peer connection if the component unmounts mid-session.
  useEffect(() => () => sessionRef.current?.stop(), []);

  return { state, start, stop, setMicEnabled, getLevel };
}
