"use client";

import type { ActionPayload, Todo } from "@/lib/contracts";
import { finishTodo as finishTodoApi, patchTodo } from "@/app/lib/api";
import { hasOffer, reflectFinish } from "@/app/lib/offer";
import { useEnsureLabel, useTada } from "@/app/lib/store";
import { OfferPanel } from "@/app/components/todo/OfferPanel";
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

  // FIX2 — the do-it-for-me tap path. POST finish, then mirror the server-persisted
  // outcome onto the local todo (the route returns the ExecResult, not the todo).
  // Never auto-executes — only fires from the OfferPanel's explicit tap.
  async function finishOffer() {
    const res = await finishTodoApi(todo.id);
    const reflected = reflectFinish(todo, res);
    if (reflected) dispatch({ type: "UPSERT_TODO", todo: { ...todo, ...reflected } });
    return res;
  }

  const offer = hasOffer(todo) ? (
    <OfferPanel
      todo={todo}
      onFinish={finishOffer}
      onPatchPayload={(payload: ActionPayload) => patch({ actionPayload: payload })}
    />
  ) : (
    // actionType !== none but already done → still show the executed confirmation.
    todo.actionType !== "none" && todo.actionState === "done" ? (
      <OfferPanel
        todo={todo}
        onFinish={finishOffer}
        onPatchPayload={(payload: ActionPayload) => patch({ actionPayload: payload })}
      />
    ) : undefined
  );

  return (
    <DetailPane
      todo={todo}
      allLabels={state.labels}
      onClose={() => dispatch({ type: "SELECT_TODO", id: null })}
      onPatch={patch}
      onCreateLabel={ensureLabel}
      offer={offer}
    >
      <SubtaskSection parentId={todo.id} />
    </DetailPane>
  );
}
