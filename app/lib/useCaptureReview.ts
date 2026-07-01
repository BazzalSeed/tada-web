"use client";

import { useCallback, useRef, useState } from "react";
import type { Capture, ExtractedTodo, Todo } from "@/lib/contracts";
import type { CaptureRequest } from "@/lib/capture";
import { commitCapture, proposeCapture } from "@/app/lib/api";
import { fileToCaptureRequest } from "@/app/lib/capture";
import { useTada } from "./store";

export type ReviewSource =
  | { kind: "image"; file: File }
  | { kind: "text"; text: string };

export type ReviewStatus = "describing" | "extracting" | "proposals" | "failed";

export interface CaptureReview {
  open: boolean;
  source: ReviewSource | null;
  note: string;
  status: ReviewStatus;
  captureId: string | null;
  proposals: ExtractedTodo[];
  start(source: ReviewSource): void;
  setNote(v: string): void;
  extract(): Promise<void>;
  editProposal(i: number, patch: Partial<ExtractedTodo>): void;
  removeProposal(i: number): void;
  commit(): Promise<Todo[]>;
  cancel(): void;
}

interface ReviewInternalState {
  open: boolean;
  source: ReviewSource | null;
  note: string;
  status: ReviewStatus;
  captureId: string | null;
  proposals: ExtractedTodo[];
}

const initial: ReviewInternalState = {
  open: false,
  source: null,
  note: "",
  status: "describing",
  captureId: null,
  proposals: [],
};

// Client review state machine for the capture propose/commit flow. Drives the
// review modal (Task 5): start() opens it against a source (image | typed
// text), extract() proposes structured todos without persisting them,
// editProposal/removeProposal let the user adjust before approving, and
// commit() persists the approved set and reconciles the store.
export function useCaptureReview(): CaptureReview {
  const { dispatch } = useTada();
  const [state, setState] = useState<ReviewInternalState>(initial);
  // The propose response's Capture is kept out of state (it isn't rendered)
  // so commit() can dispatch it without re-deriving it from captureId.
  const captureRef = useRef<Capture | null>(null);

  const start = useCallback((source: ReviewSource) => {
    captureRef.current = null;
    setState({ ...initial, open: true, source, status: "describing" });
  }, []);

  const setNote = useCallback((v: string) => {
    setState((s) => ({ ...s, note: v }));
  }, []);

  const extract = useCallback(async () => {
    setState((s) => ({ ...s, status: "extracting" }));
    const source = state.source;
    const note = state.note;
    try {
      if (!source) throw new Error("extract() called before start()");
      const body: CaptureRequest =
        source.kind === "text"
          ? { kind: "text", text: source.text, note: note || null }
          : { ...(await fileToCaptureRequest(source.file)), note: note || null };
      const res = await proposeCapture(body);
      captureRef.current = res.capture;
      setState((s) => ({
        ...s,
        captureId: res.capture.id,
        proposals: res.proposals,
        status: res.failed ? "failed" : "proposals",
      }));
    } catch {
      setState((s) => ({ ...s, status: "failed" }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.source, state.note]);

  const editProposal = useCallback((i: number, patch: Partial<ExtractedTodo>) => {
    setState((s) => ({
      ...s,
      proposals: s.proposals.map((p, idx) => (idx === i ? { ...p, ...patch } : p)),
    }));
  }, []);

  const removeProposal = useCallback((i: number) => {
    setState((s) => ({
      ...s,
      proposals: s.proposals.filter((_, idx) => idx !== i),
    }));
  }, []);

  const cancel = useCallback(() => {
    captureRef.current = null;
    setState(initial);
  }, []);

  const commit = useCallback(async (): Promise<Todo[]> => {
    const { captureId, proposals } = state;
    if (!captureId) throw new Error("commit() called before a successful extract()");
    const todos = await commitCapture(captureId, proposals);
    const capture = captureRef.current;
    if (capture) dispatch({ type: "UPSERT_CAPTURE", capture });
    for (const todo of todos) dispatch({ type: "UPSERT_TODO", todo });
    captureRef.current = null;
    setState(initial);
    return todos;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.captureId, state.proposals, dispatch]);

  return {
    ...state,
    start,
    setNote,
    extract,
    editProposal,
    removeProposal,
    commit,
    cancel,
  };
}
