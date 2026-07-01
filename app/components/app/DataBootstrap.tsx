"use client";

import { useEffect, useRef } from "react";
import { listCaptures, listLabels, listTodos, setTimezone } from "@/app/lib/api";
import { useTada } from "@/app/lib/store";

// Background sync cadence. Only polls while the tab is VISIBLE (a hidden tab does
// nothing), so idle/background users cost zero — see the scaling note in the
// commit. Supabase Realtime can later replace this behind the same dispatch.
const POLL_MS = 5000;

// T3.6b — real load hydration. On mount, fetch the owner's todos + labels +
// source captures and seed the store. Captures (keyed by id) back the row
// thumbnails so they survive reload. Renders nothing.
//
// Resilience (FIX): each resource loads INDEPENDENTLY (allSettled) so one
// transient failure — e.g. a cold-start Neon 500 on the first query after an
// idle-suspend — never blanks the whole app. We dispatch whatever succeeded and
// retry the failures a few times with backoff, so the list fills in rather than
// showing a false "Nothing here yet."
const MAX_ATTEMPTS = 4;
const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function DataBootstrap() {
  const { state, dispatch } = useTada();

  // Capture the browser's IANA timezone once so meeting bookings anchor to the
  // user's real zone (fire-and-forget; booking falls back if this hasn't landed).
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) void setTimezone(tz).catch(() => {});
  }, []);

  // Background pool sync: reflect changes made elsewhere (chat, another tab/device,
  // a finished research run) without a manual reload. Visibility-gated so hidden
  // tabs never poll, and refetches immediately when the tab regains focus.
  const todosRef = useRef(state.todos);
  useEffect(() => {
    todosRef.current = state.todos;
  }, [state.todos]);
  useEffect(() => {
    const poll = async () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const todos = await listTodos().catch(() => null);
      if (!todos) return;
      // Keep in-flight optimistic rows (temp UUID ids, not yet persisted) so a
      // poll landing mid-create doesn't flicker them out.
      const keepIds = todosRef.current.filter((t) => t.id.includes("-")).map((t) => t.id);
      dispatch({ type: "SYNC_TODOS", todos, keepIds });
    };
    const timer = setInterval(poll, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [dispatch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let attempt = 0; attempt < MAX_ATTEMPTS && !cancelled; attempt++) {
        const [t, l, c] = await Promise.allSettled([
          listTodos(),
          listLabels(),
          listCaptures(),
        ]);
        if (cancelled) return;
        const todos = t.status === "fulfilled" ? t.value : null;
        const labels = l.status === "fulfilled" ? l.value : null;
        const captures = c.status === "fulfilled" ? c.value : null;

        // Dispatch whatever loaded this round. Views have no persistence route
        // yet; keep them client-side. Captures merge by id, so re-dispatching a
        // partial round never drops previously-loaded ones.
        if (todos || labels || captures) {
          dispatch({
            type: "SET_DATA",
            todos: todos ?? [],
            views: [],
            labels: labels ?? [],
            captures: captures ?? undefined,
            // Leave the loading state only once todos themselves have loaded — a
            // round where only labels/captures succeeded keeps the loader up.
            hydrated: todos !== null,
          });
        }

        if (todos && labels && captures) return; // fully hydrated
        // Some resource failed transiently — back off and retry the lot.
        const failed = [t, l, c].filter((r) => r.status === "rejected");
        console.warn(
          `[bootstrap] ${failed.length} resource(s) failed (attempt ${attempt + 1}/${MAX_ATTEMPTS}); retrying`,
        );
        await delay(300 * (attempt + 1));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);
  return null;
}
