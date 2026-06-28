"use client";

import { useEffect, useRef } from "react";
import styles from "./ConfirmDialog.module.css";

// Reusable confirmation dialog — matched to the app's modal style (cream raised
// card, rust accent, same scrim pattern as AppShellContainer's ViewEditor overlay).
export interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When true the action is destructive (delete). Confirm still uses the
   *  rust accent but is labelled as a delete action. Styling remains identical
   *  since the app's accent IS the danger colour in this palette. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Autofocus the confirm button when the dialog mounts.
  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  // Escape key closes the dialog.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCancel();
      }
    }
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [onCancel]);

  return (
    <div
      className={styles.scrim}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      // Clicking the scrim background (but not the card) closes the dialog.
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className={styles.card}
        // Card clicks must not propagate to the scrim handler.
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={styles.confirm}
            data-destructive={destructive || undefined}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
