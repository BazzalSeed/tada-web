"use client";

import type { Todo } from "@/lib/contracts";
import { createTodo, patchTodo, reorderTodo } from "@/app/lib/api";
import { useTada } from "@/app/lib/store";
import { SubtaskList } from "./SubtaskList";

// Store-wired subtask manager for the detail pane. Children are one level deep
// (parentId === the open todo). Completing children NEVER auto-completes the
// parent — there is simply no code path that touches the parent here.
export function SubtaskSection({ parentId }: { parentId: string }) {
  const { state, dispatch } = useTada();
  const subtasks = state.todos
    .filter((t) => t.parentId === parentId)
    .sort((a, b) => a.sortIndex - b.sortIndex);

  async function add(title: string) {
    const sortIndex =
      subtasks.length > 0 ? subtasks[subtasks.length - 1].sortIndex + 1 : 0;
    const optimistic: Todo = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      sourceCaptureId: "",
      title,
      status: "open",
      actionType: "none",
      actionState: "none",
      sortIndex,
      priority: "none",
      labelIds: [],
      parentId,
    };
    dispatch({ type: "UPSERT_TODO", todo: optimistic });
    try {
      // Persisted child carries the server id; a reload reconciles the temp row.
      await createTodo({ title, parentId, sortIndex });
    } catch {
      // interim: keep the optimistic child until persistence is authed.
    }
  }

  async function toggle(id: string) {
    const current = subtasks.find((t) => t.id === id);
    if (!current) return;
    const nextStatus = current.status === "done" ? "open" : "done";
    dispatch({ type: "UPSERT_TODO", todo: { ...current, status: nextStatus } });
    try {
      const saved = await patchTodo(id, { status: nextStatus });
      dispatch({ type: "UPSERT_TODO", todo: saved });
    } catch {
      // interim: keep optimistic.
    }
  }

  async function reorder(
    id: string,
    beforeId: string | null,
    afterId: string | null,
  ) {
    try {
      const saved = await reorderTodo(id, beforeId, afterId);
      dispatch({ type: "UPSERT_TODO", todo: saved });
    } catch {
      // interim
    }
  }

  return (
    <SubtaskList
      subtasks={subtasks}
      onAdd={add}
      onToggle={toggle}
      onReorder={reorder}
    />
  );
}
