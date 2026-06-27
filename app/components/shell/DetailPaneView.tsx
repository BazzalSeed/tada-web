"use client";

import type { Todo } from "@/lib/contracts";
import { patchTodo } from "@/app/lib/api";
import { useEnsureLabel, useTada } from "@/app/lib/store";
import { SubtaskSection } from "@/app/components/todo/SubtaskSection";
import { DetailPane } from "./DetailPane";

// Store-wired detail pane: edits flow through one optimistic patch channel
// (PATCH /api/todos/:id), inline labels resolve to persisted ids via /api/labels,
// and the subtask section is mounted as the pane's children.
export function DetailPaneView({ todo }: { todo: Todo }) {
  const { state, dispatch } = useTada();
  const ensureLabel = useEnsureLabel();

  async function patch(p: Partial<Todo>) {
    dispatch({ type: "UPSERT_TODO", todo: { ...todo, ...p } });
    try {
      const saved = await patchTodo(todo.id, p);
      if (saved) dispatch({ type: "UPSERT_TODO", todo: saved });
    } catch {
      // interim: keep the optimistic edit until persistence is authed.
    }
  }

  return (
    <DetailPane
      todo={todo}
      allLabels={state.labels}
      onClose={() => dispatch({ type: "SELECT_TODO", id: null })}
      onPatch={patch}
      onCreateLabel={ensureLabel}
    >
      <SubtaskSection parentId={todo.id} />
    </DetailPane>
  );
}
