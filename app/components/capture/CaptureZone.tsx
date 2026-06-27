"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { captureImageFile } from "@/app/lib/capture";
import { imageFilesFrom } from "@/app/lib/capture-files";
import { useTada } from "@/app/lib/store";
import { Dropzone } from "./Dropzone";
import styles from "./CaptureZone.module.css";

// Store-wired capture surface: drop, paste, or click-upload an image anywhere →
// POST /api/capture (capture-first on the server) → dispatch the returned Capture
// + Todos. The first returned todo is the capture-first plain todo; extras are
// extracted ones. Failures surface visibly (capture is the hero — never silent).
export function CaptureZone({ children }: { children: ReactNode }) {
  const { dispatch } = useTada();
  const [error, setError] = useState<string | null>(null);

  const ingest = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        try {
          const { capture, todos } = await captureImageFile(file);
          dispatch({ type: "UPSERT_CAPTURE", capture });
          for (const todo of todos) dispatch({ type: "UPSERT_TODO", todo });
          setError(null);
        } catch (err) {
          // Surface, don't swallow — capture is the hero flow.
          console.error("[capture] failed to ingest", file.name, err);
          setError("Couldn't capture that image. Please sign in and try again.");
        }
      }
    },
    [dispatch],
  );

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
            onClick={() => setError(null)}
          >
            ×
          </button>
        </div>
      ) : null}
    </Dropzone>
  );
}
