"use client";

import { useCallback, useEffect, type ReactNode } from "react";
import { captureImageFile } from "@/app/lib/capture";
import { imageFilesFrom } from "@/app/lib/capture-files";
import { useTada } from "@/app/lib/store";
import { Dropzone } from "./Dropzone";

// Store-wired capture surface: drop or paste an image anywhere → POST /api/capture
// (capture-first on the server) → dispatch the returned Capture + Todos. The
// first returned todo is the capture-first plain todo; extras are extracted ones.
export function CaptureZone({ children }: { children: ReactNode }) {
  const { dispatch } = useTada();

  const ingest = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        try {
          const { capture, todos } = await captureImageFile(file);
          dispatch({ type: "UPSERT_CAPTURE", capture });
          for (const todo of todos) dispatch({ type: "UPSERT_TODO", todo });
        } catch {
          // interim: capture persistence needs an authed user (T3.6); swallow.
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

  return <Dropzone onFiles={(files) => void ingest(files)}>{children}</Dropzone>;
}
