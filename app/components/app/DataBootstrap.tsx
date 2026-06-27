"use client";

import { useEffect } from "react";
import { listLabels, listTodos } from "@/app/lib/api";
import { useTada } from "@/app/lib/store";

// T3.6b — real load hydration. Replaces the seed preload: on mount, fetch the
// owner's todos + labels from the live API and seed the store. If the load fails
// (e.g. unauthenticated → 401, before middleware redirects), the app boots empty
// rather than showing stale demo data. Renders nothing.
export function DataBootstrap() {
  const { dispatch } = useTada();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [todos, labels] = await Promise.all([listTodos(), listLabels()]);
        if (!cancelled) {
          // Views have no persistence route yet; keep them client-side.
          dispatch({ type: "SET_DATA", todos, views: [], labels });
        }
      } catch (err) {
        console.error("[bootstrap] failed to load todos/labels", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispatch]);
  return null;
}
