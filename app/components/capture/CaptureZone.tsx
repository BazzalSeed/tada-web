"use client";

import { useEffect, type ReactNode } from "react";
import { imageFilesFrom } from "@/app/lib/capture-files";
import { useImageCapture } from "@/app/lib/useImageCapture";
import { Dropzone } from "./Dropzone";
import styles from "./CaptureZone.module.css";

// Store-wired capture surface: drop, paste, or click-upload an image anywhere →
// POST /api/capture (capture-first on the server) → dispatch the returned Capture
// + Todos. The first returned todo is the capture-first plain todo; extras are
// extracted ones. Failures surface visibly (capture is the hero — never silent).
export function CaptureZone({ children }: { children: ReactNode }) {
  const { ingest, error, clearError } = useImageCapture();

  // Global paste — capture images from the clipboard anywhere in the app.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const cd = e.clipboardData;
      if (!cd) return;
      const files = imageFilesFrom(cd);
      if (files.length) {
        e.preventDefault();
        void ingest(files);
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [ingest]);

  return (
    <Dropzone onFiles={(files) => void ingest(files)}>
      {children}
      {error ? (
        <div className={styles.toast} role="alert">
          <span>{error}</span>
          <button
            type="button"
            className={styles.dismiss}
            aria-label="Dismiss"
            onClick={clearError}
          >
            ×
          </button>
        </div>
      ) : null}
    </Dropzone>
  );
}
