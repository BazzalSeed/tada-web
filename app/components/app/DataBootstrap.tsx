"use client";

import { useEffect } from "react";
import { listCaptures, listLabels, listTodos } from "@/app/lib/api";
import { useTada } from "@/app/lib/store";

// T3.6b — real load hydration. Replaces the seed preload: on mount, fetch the
// owner's todos + labels + source captures from the live API and seed the store.
// Captures (keyed by id) back the row thumbnails so they survive reload. If the
// load fails (e.g. unauthenticated → 401, before middleware redirects), the app
// boots empty rather than showing stale demo data. Renders nothing.
export function DataBootstrap() {
  const { dispatch } = useTada();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [todos, labels, captures] = await Promise.all([
          listTodos(),
          listLabels(),
          listCaptures(),
        ]);
        if (!cancelled) {
          // Views have no persistence route yet; keep them client-side.
          dispatch({ type: "SET_DATA", todos, views: [], labels, captures });
        }
      } catch (err) {
        console.error("[bootstrap] failed to load todos/labels/captures", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);
  return null;
}
