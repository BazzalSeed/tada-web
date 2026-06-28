"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./ChatComposer.module.css";

// Chat input: type + Enter/Send, plus an optional voice-mode entry (→ the full
// Realtime voice stage, T3.5). Shift+Enter inserts a newline.
export interface ChatComposerProps {
  onSend: (text: string) => void;
  onVoice?: () => void;
  busy?: boolean;
  placeholder?: string;
}

export function ChatComposer({
  onSend,
  onVoice,
  busy = false,
  placeholder = "Ask Tada to do something…",
}: ChatComposerProps) {
  const [text, setText] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  function send() {
    const value = text.trim();
    if (!value || busy) return;
    onSend(value);
    setText("");
  }

  return (
    <div className={styles.composer}>
      <textarea
        ref={taRef}
        className={styles.input}
        value={text}
        rows={1}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />
      {onVoice ? (
        <button
          type="button"
          className={styles.voice}
          aria-label="Start voice mode"
          onClick={onVoice}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.93V21h2v-3.07A7 7 0 0 0 19 11h-2Z"
            />
          </svg>
        </button>
      ) : null}
      <button
        type="button"
        className={styles.send}
        aria-label="Send message"
        disabled={busy || !text.trim()}
        onClick={send}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="currentColor" d="M3 11l18-8-8 18-2-7-8-3Z" />
        </svg>
      </button>
    </div>
  );
}
