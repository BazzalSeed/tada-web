"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ParseToken } from "@/lib/contracts";
import styles from "./HighlightedInput.module.css";

// Live token highlight (native parity): a backdrop renders the same text with
// colored spans at the parser's token offsets, behind a transparent input that
// owns the caret. Tokens come from parseQuickAdd (@/lib/core).
export interface HighlightedInputProps {
  value: string;
  tokens: ParseToken[];
  onChange: (text: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}

interface Segment {
  text: string;
  kind?: ParseToken["kind"];
}

function segmentize(value: string, tokens: ParseToken[]): Segment[] {
  const sorted = [...tokens].sort((a, b) => a.start - b.start);
  const segs: Segment[] = [];
  let cursor = 0;
  for (const t of sorted) {
    if (t.start < cursor) continue; // skip overlaps defensively
    if (t.start > cursor) segs.push({ text: value.slice(cursor, t.start) });
    segs.push({
      text: value.slice(t.start, t.start + t.length),
      kind: t.kind,
    });
    cursor = t.start + t.length;
  }
  if (cursor < value.length) segs.push({ text: value.slice(cursor) });
  return segs;
}

export function HighlightedInput({
  value,
  tokens,
  onChange,
  onSubmit,
  placeholder,
  autoFocus,
}: HighlightedInputProps) {
  const segments = useMemo(() => segmentize(value, tokens), [value, tokens]);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <div className={styles.wrap}>
      <div ref={backdropRef} className={styles.backdrop} aria-hidden="true">
        {segments.map((s, i) =>
          s.kind ? (
            <span key={i} className={styles.token} data-kind={s.kind}>
              {s.text}
            </span>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
      </div>
      <textarea
        ref={taRef}
        className={styles.input}
        rows={1}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={(e) => {
          const b = backdropRef.current;
          if (b) {
            b.scrollTop = e.currentTarget.scrollTop;
            b.scrollLeft = e.currentTarget.scrollLeft;
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
    </div>
  );
}
