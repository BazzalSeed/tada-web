"use client";

import { useState } from "react";
import { between } from "@/lib/core";
import { patchTodo, reorderTodo } from "@/app/lib/api";
import {
  childrenByParentFrom,
  labelsByIdFrom,
  subtaskCountsFor,
  visibleTodos,
} from "@/app/lib/selectors";
import { useTada } from "@/app/lib/store";
import { AddCardView } from "@/app/components/capture/AddCardView";
import { TodoList } from "./TodoList";
import styles from "./TodoListView.module.css";

// Store-wired content region: derives the visible list and routes interactions.
// Mutations are optimistic. Persistence runs through the API seam; during the
// pre-auth interim (currentUser() unimplemented) writes 500, so we keep the
// optimistic local state rather than revert — the local-first spine stays usable
// and a reload reflects server truth once auth (T3.6) + live load land.
export function TodoListView() {
  const { state, dispatch } = useTada();
  // Stable per-mount clock for due-chip labels.
  const [now] = useState(() => new Date());

  const { open, done } = visibleTodos(state, now);
  const labelsById = labelsByIdFrom(state.labels);
  const subtaskCounts = subtaskCountsFor(state.todos);
  const childrenByParent = childrenByParentFrom(state.todos);

  async function toggleComplete(id: string) {
    const current = state.todos.find((t) => t.id === id);
    if (!current) return;
    const nextStatus = current.status === "done" ? "open" : "done";
    dispatch({ type: "UPSERT_TODO", todo: { ...current, status: nextStatus } });
    try {
      const saved = await patchTodo(id, { status: nextStatus });
      dispatch({ type: "UPSERT_TODO", todo: saved });
    } catch {
      // interim: no auth yet — keep the optimistic toggle.
    }
  }

  async function reorder(
    id: string,
    beforeId: string | null,
    afterId: string | null,
  ) {
    const current = state.todos.find((t) => t.id === id);
    if (!current) return;
    // Move the row INSTANTLY (optimistic): compute the same fractional sortIndex
    // the server will, from the drop neighbors' current indices, so the list
    // visibly reorders on drop — not only after the round-trip. Then persist and
    // reconcile with server truth.
    const sortOf = (nid: string | null): number | null =>
      nid ? (state.todos.find((t) => t.id === nid)?.sortIndex ?? null) : null;
    const newSort = between(sortOf(beforeId), sortOf(afterId));
    dispatch({ type: "UPSERT_TODO", todo: { ...current, sortIndex: newSort } });
    try {
      const saved = await reorderTodo(id, beforeId, afterId);
      dispatch({ type: "UPSERT_TODO", todo: saved });
    } catch {
      // interim: keep the optimistic order until persistence is authed.
    }
  }

  // The add card renders ONLY in All — the single add surface (native invariant).
  const isAll = state.selection.kind === "all";

  return (
    <div className={styles.content}>
      {isAll ? <AddCardView /> : null}
      <TodoList
        open={open}
        done={done}
        now={now}
        labelsById={labelsById}
        subtaskCounts={subtaskCounts}
        childrenByParent={childrenByParent}
        capturesById={state.captures}
        selectedId={state.selectedTodoId}
        onSelect={(id) => dispatch({ type: "SELECT_TODO", id })}
        onToggleComplete={toggleComplete}
        onReorder={reorder}
      />
    </div>
  );
}
