"use client";

import { useRef, useState } from "react";
import styles from "./MicButton.module.css";

// Light voice dictate (distinct from the Chat voice agent): one-shot speech →
// text via the Web Speech API, fed into the quick-add path. Browser-only; the
// button is disabled where SpeechRecognition is unavailable. The recognition
// constructor is injectable for testing.
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
}
type RecognitionCtor = new () => RecognitionLike;

function defaultGetRecognition(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export interface MicButtonProps {
  onTranscript: (text: string) => void;
  getRecognition?: () => RecognitionCtor | null;
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V21h2v-3.07A7 7 0 0 0 19 11h-2Z"
      />
    </svg>
  );
}

export function MicButton({
  onTranscript,
  getRecognition = defaultGetRecognition,
}: MicButtonProps) {
  const Ctor = getRecognition();
  const [listening, setListening] = useState(false);
  const recRef = useRef<RecognitionLike | null>(null);

  if (!Ctor) {
    return (
      <button
        type="button"
        className={styles.mic}
        aria-label="Dictation unavailable"
        disabled
      >
        <MicIcon />
      </button>
    );
  }

  function start() {
    const rec = new Ctor!();
    rec.lang =
      (typeof navigator !== "undefined" && navigator.language) || "en-US";
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = (e) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r && r.isFinal !== false && r[0]) text += r[0].transcript;
      }
      if (text.trim()) onTranscript(text.trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    rec.start();
    setListening(true);
  }

  function stop() {
    recRef.current?.stop();
    setListening(false);
  }

  return (
    <button
      type="button"
      className={styles.mic}
      data-listening={listening}
      aria-label={listening ? "Stop dictation" : "Dictate"}
      aria-pressed={listening}
      onClick={() => (listening ? stop() : start())}
    >
      <MicIcon />
    </button>
  );
}
