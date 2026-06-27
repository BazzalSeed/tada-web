"use client";

import { useEffect } from "react";
import { listCaptures, listLabels, listTodos } from "@/app/lib/api";
import { useTada } from "@/app/lib/store";

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
  const { dispatch } = useTada();
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
