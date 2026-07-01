"use client";

import { useEffect, type ReactNode } from "react";
import { imageFilesFrom } from "@/app/lib/capture-files";
import { useImageCapture } from "@/app/lib/useImageCapture";
import { Dropzone } from "./Dropzone";

// Store-wired capture surface: drop, paste, or click-upload an image anywhere →
// opens the shared review card (useCaptureReview) against it — nothing is
// created until the user approves. A failed extraction surfaces inside the
// review modal's failed state, not here (capture is the hero — never silent).
export function CaptureZone({ children }: { children: ReactNode }) {
  const { ingest } = useImageCapture();

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
