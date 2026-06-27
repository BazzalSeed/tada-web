"use client";

import { useEffect, useState } from "react";
import type { VoiceStatus } from "@/lib/contracts";
import { useVoiceSession } from "@/app/lib/voice/useVoiceSession";
import { proposedActionFromCall } from "@/app/lib/voice/voiceTools";
import { OfferCard } from "@/app/components/chat/tiles/OfferCard";
import { SpiroOrb, type VoiceState } from "./SpiroOrb";
import styles from "./VoiceStage.module.css";

// The live-voice "call" overlay (T3.5). Replaces nothing — it floats over the app
// as an immersive stage: the SpiroOrb hero, a status/transcript line, and the
// iOS-style mute/end controls. A GATED write surfaces an inline Approve/Deny card
// here and NEVER auto-executes — voice can't book/run a side effect on its own.
export interface VoiceStageProps {
  onClose: () => void;
}

const CUE: Record<VoiceStatus, string> = {
  connecting: "Connecting…",
  listening: "Listening",
  thinking: "Thinking…",
  speaking: "Tada is speaking",
  ended: "Call ended",
  error: "Voice unavailable",
};

function orbStateFor(status: VoiceStatus): VoiceState {
  if (status === "listening" || status === "thinking" || status === "speaking") {
    return status;
  }
  return "idle";
}

export function VoiceStage({ onClose }: VoiceStageProps) {
  const { state, start, stop, setMicEnabled, getLevel } = useVoiceSession();
  const [muted, setMuted] = useState(false);

  // Open the session on mount; tear it down on unmount.
  useEffect(() => {
    start();
    return () => stop();
    // start/stop are stable (useCallback); run once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setMicEnabled(!next);
  }

  function hangUp() {
    stop();
    onClose();
  }

  const cue = CUE[state.status];
  const heard = state.transcript.user.trim();
  const action = state.approval ? proposedActionFromCall(state.approval.name, state.approval.args) : null;

  return (
    <div className={styles.scrim} role="dialog" aria-modal="true" aria-label="Voice call with Tada">
      <button type="button" className={styles.minimize} aria-label="Minimize call" onClick={onClose}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      <div className={styles.hero}>
        <SpiroOrb state={orbStateFor(state.status)} getLevel={getLevel} size={360} />
      </div>

      <p className={styles.cue} aria-live="polite">
        {cue}
        {state.status === "error" && state.error ? (
          <span className={styles.error}>{state.error}</span>
        ) : null}
      </p>

      {heard ? <p className={styles.heard}>“{heard}”</p> : null}

      {/* Gated write → the never-auto-execute confirm. Approve runs server-side. */}
      <div className={styles.confirmBand}>
        {state.approval && action ? (
          <OfferCard
            action={action}
            onApprove={state.approval.approve}
            onDeny={state.approval.deny}
          />
        ) : null}
      </div>

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.ctrl}
          aria-label={muted ? "Unmute" : "Mute"}
          aria-pressed={muted}
          onClick={toggleMute}
        >
          {muted ? <MicOffIcon /> : <MicIcon />}
        </button>
        <button
          type="button"
          className={`${styles.ctrl} ${styles.end}`}
          aria-label="End call"
          onClick={hangUp}
        >
          <HangUpIcon />
        </button>
      </div>
    </div>
  );
}

function MicIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
      <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3 3 4.27l6 6V11c0 1.66 1.33 3 3 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9l4.19 4.19L21 19.73 4.27 3z" />
    </svg>
  );
}

function HangUpIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 9c-1.6 0-3.15.25-4.6.72v3.1c0 .39-.23.74-.56.9-.98.49-1.87 1.12-2.66 1.85-.18.18-.43.28-.7.28-.28 0-.53-.11-.71-.29L.29 13.08A.96.96 0 0 1 0 12.38c0-.28.11-.53.29-.71C3.34 8.78 7.46 7 12 7s8.66 1.78 11.71 4.67c.18.18.29.43.29.71 0 .28-.11.53-.29.71l-2.48 2.48c-.18.18-.43.29-.71.29-.27 0-.52-.11-.7-.28-.79-.74-1.69-1.36-2.67-1.85-.33-.16-.56-.5-.56-.9v-3.1C15.15 9.25 13.6 9 12 9z" />
    </svg>
  );
}
