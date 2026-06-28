import { useCallback, useState } from "react";
import { captureImageFile } from "@/app/lib/capture";
import { useTada } from "@/app/lib/store";

// Shared image-capture ingest: POST each image (capture-first) and fold the
// returned Capture + Todos into the store. Errors surface (capture is the hero).
export function useImageCapture() {
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
          console.error("[capture] failed to ingest", file.name, err);
          setError("Couldn't capture that image. Please sign in and try again.");
        }
      }
    },
    [dispatch],
  );
  return { ingest, error, clearError: () => setError(null) };
}
