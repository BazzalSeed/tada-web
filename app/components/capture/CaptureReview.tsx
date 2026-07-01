"use client";

import { useEffect, useRef, useState } from "react";
import type { CaptureReview as CaptureReviewState } from "@/app/lib/useCaptureReview";
import { ViewLoading } from "@/app/components/app/ViewLoading";
import styles from "./CaptureReview.module.css";

// Review-and-approve modal for the capture propose/commit flow. Presentational
// — takes the review state machine as a prop (mirrors ConfirmDialog) so it's
// unit-testable with a fake `review` object and reusable by both the image
// ingest (Task 6) and paragraph-typing (Task 7) trigger sites, which share
// one useCaptureReview() instance via CaptureReviewContext.
export interface CaptureReviewProps {
  review: CaptureReviewState;
}

export function CaptureReview({ review }: CaptureReviewProps) {
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Escape key closes the review, same as ConfirmDialog.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        review.cancel();
      }
    }
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [review.cancel]);

  // Autofocus the note field while describing.
  useEffect(() => {
    if (review.status === "describing") noteRef.current?.focus();
  }, [review.status]);

  const title =
    review.status === "proposals"
      ? "Review todos"
      : review.status === "extracting"
        ? "Extracting…"
        : review.status === "failed"
          ? "Couldn't extract"
          : "Review capture";

  return (
    <div
      className={styles.scrim}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) review.cancel();
      }}
    >
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>{title}</h2>
        {review.status === "describing" && (
          <DescribingBody review={review} noteRef={noteRef} />
        )}
        {review.status === "extracting" && (
          <div className={styles.body}>
            <ViewLoading />
          </div>
        )}
        {review.status === "proposals" && <ProposalsBody review={review} />}
        {review.status === "failed" && <FailedBody review={review} />}
      </div>
    </div>
  );
}

function DescribingBody({
  review,
  noteRef,
}: {
  review: CaptureReviewState;
  noteRef: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const source = review.source;

  useEffect(() => {
    if (source?.kind !== "image") {
      setThumbUrl(null);
      return;
    }
    const url = URL.createObjectURL(source.file);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [source]);

  return (
    <>
      <div className={styles.body}>
        {source?.kind === "image" ? (
          thumbUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className={styles.thumb} src={thumbUrl} alt="Captured screenshot" />
          ) : null
        ) : source?.kind === "text" ? (
          <p className={styles.sourceText}>{source.text}</p>
        ) : null}
        <label className={styles.noteField}>
          <span className={styles.eyebrow}>Add context</span>
          <textarea
            ref={noteRef}
            className={styles.noteInput}
            value={review.note}
            placeholder="Describe what to do with this… (optional)"
            onChange={(e) => review.setNote(e.target.value)}
          />
        </label>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={review.cancel}>
          Cancel
        </button>
        <button type="button" className={styles.primary} onClick={review.extract}>
          Extract
        </button>
      </div>
    </>
  );
}

function ProposalsBody({ review }: { review: CaptureReviewState }) {
  const count = review.proposals.length;
  return (
    <>
      <div className={styles.proposals}>
        {review.proposals.map((p, i) => (
          <div className={styles.proposalRow} key={i}>
            <input
              className={styles.proposalInput}
              value={p.title}
              onChange={(e) => review.editProposal(i, { title: e.target.value })}
            />
            <button
              type="button"
              className={styles.removeButton}
              aria-label="Remove proposal"
              onClick={() => review.removeProposal(i)}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={review.cancel}>
          Cancel
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={count === 0}
          onClick={review.commit}
        >
          {`Add ${count} todo${count === 1 ? "" : "s"}`}
        </button>
      </div>
    </>
  );
}

function FailedBody({ review }: { review: CaptureReviewState }) {
  return (
    <>
      <div className={styles.body}>
        <p className={styles.statusLine}>Couldn't find any tasks in this.</p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={review.cancel}>
          Cancel
        </button>
        <button type="button" className={styles.primary} onClick={review.extract}>
          Try again
        </button>
      </div>
    </>
  );
}
