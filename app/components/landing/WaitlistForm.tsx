"use client";

import { useState } from "react";
import { joinWaitlist } from "@/app/lib/api";
import styles from "./WaitlistForm.module.css";

// T4.1 — the landing's one interactive island. Validates client-side, POSTs the
// normalized email to /api/waitlist, and swaps to a confirmation on success.
// Idempotent on the server, so a repeat join still lands on the success state.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

type Status = "idle" | "submitting" | "done" | "error";

export function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [note, setNote] = useState("No spam — one email when Tada opens up.");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      setStatus("error");
      setNote("Please enter a valid email address.");
      return;
    }
    setStatus("submitting");
    try {
      await joinWaitlist(value);
      setStatus("done");
    } catch {
      setStatus("error");
      setNote("Hmm — that didn't go through. Try again.");
    }
  }

  if (status === "done") {
    return (
      <div className={styles.done} role="status">
        <span className={styles.check} aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5L19 7" />
          </svg>
        </span>
        <span>
          You&apos;re on the list <span className={styles.spark}>✦</span> We&apos;ll be in touch.
        </span>
      </div>
    );
  }

  return (
    <>
      <form className={styles.form} onSubmit={submit} noValidate>
        <input
          type="email"
          className={styles.input}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          placeholder="you@email.com"
          aria-label="Your email address"
          autoComplete="email"
        />
        <button
          type="submit"
          className={styles.submit}
          disabled={status === "submitting"}
        >
          {status === "submitting" ? "Joining…" : "Join the waitlist"}
        </button>
      </form>
      <p
        className={styles.note}
        data-error={status === "error"}
        role={status === "error" ? "alert" : undefined}
      >
        {note}
      </p>
    </>
  );
}
