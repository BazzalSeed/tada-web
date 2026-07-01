import { useCallback } from "react";
import { useCaptureReviewContext } from "@/app/lib/useCaptureReview";

// Shared image-capture ingest: opens the review card against the dropped/
// pasted/uploaded image — nothing is created until the user approves in the
// modal (the modal's commit path does the actual capture + todo creation).
// v1 reviews only the first file; multi-file batch review is a future
// follow-up. Failures now surface inside the review modal's failed state
// (see CaptureReview's FailedBody), so there's no separate error state here.
export function useImageCapture() {
  const review = useCaptureReviewContext();
  const ingest = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      review.start({ kind: "image", file: files[0] });
    },
    [review.start],
  );
  return { ingest };
}
