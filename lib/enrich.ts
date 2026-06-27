// ============================================================================
// T2.5 — quick-add enrichment. The add-card creates a plain todo INSTANTLY via
// the deterministic parse (POST /api/todos); this runs an async Gemini pass over
// the same text and returns SUGGESTIONS (offers / labels / dates / priority) for
// the UI to fold into pills. Non-creating + non-mutating — frontend applies what
// the user accepts via PATCH. Metered as `extractTodos`.
// ============================================================================

import { store as defaultStore } from "./store";
import { enrichExtractor as defaultExtractor } from "./extractor";
import { withQuota } from "./quota";
import type {
  ExtractedTodo,
  ExtractorClient,
  TadaStore,
  UserCtx,
} from "./contracts";

export interface EnrichResult {
  suggestions: ExtractedTodo[];
}

export interface EnrichDeps {
  store?: TadaStore;
  extractor?: ExtractorClient;
}

export async function runEnrich(
  user: UserCtx,
  text: string,
  deps: EnrichDeps = {},
): Promise<EnrichResult> {
  const store = deps.store ?? defaultStore;
  const extractor = deps.extractor ?? defaultExtractor;

  const [allTodos, labelRows] = await Promise.all([
    store.listTodos(user.userId),
    store.labels(user.userId),
  ]);
  const existingOpenTitles = allTodos
    .filter((t) => t.status === "open")
    .map((t) => t.title);

  const out = await withQuota(user, "extractTodos", () =>
    extractor.extract({
      text,
      existingOpenTitles,
      existingLists: [],
      existingLabels: labelRows.map((l) => l.name),
    }),
  );
  return { suggestions: out.todos };
}
