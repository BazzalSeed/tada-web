"use client";

import type { Todo, TodoLabel } from "@/lib/contracts";
import { patchTodo } from "@/app/lib/api";
import { useTada } from "@/app/lib/store";
import { SubtaskSection } from "@/app/components/todo/SubtaskSection";
import { DetailPane } from "./DetailPane";

const ACCENT = "#c8632e";

// Store-wired detail pane: edits flow through one optimistic patch channel
// (PATCH /api/todos/:id), inline labels are created locally, and the subtask
// section is mounted as the pane's children.
export function DetailPaneView({ todo }: { todo: Todo }) {
  const { state, dispatch } = useTada();

  async function patch(p: Partial<Todo>) {
    dispatch({ type: "UPSERT_TODO", todo: { ...todo, ...p } });
    try {
      const saved = await patchTodo(todo.id, p);
      if (saved) dispatch({ type: "UPSERT_TODO", todo: saved });
    } catch {
      // interim: keep the optimistic edit until persistence is authed.
    }
  }

  function createLabel(name: string): TodoLabel {
    const existing = state.labels.find((l) => l.name === name);
    if (existing) return existing;
    const label: TodoLabel = { id: crypto.randomUUID(), name, colorHex: ACCENT };
    dispatch({ type: "UPSERT_LABEL", label });
    return label;
  }

  return (
    <DetailPane
      todo={todo}
      allLabels={state.labels}
      onClose={() => dispatch({ type: "SELECT_TODO", id: null })}
      onPatch={patch}
      onCreateLabel={createLabel}
    >
      <SubtaskSection parentId={todo.id} />
    </DetailPane>
  );
}
