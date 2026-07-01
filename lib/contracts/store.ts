// ============================================================================
// FROZEN v0 CONTRACT — persistence seam (Prisma-backed; one owner per entity).
// Every method is scoped by userId (the ownership boundary). Reorder uses the
// fractional index (see filter.between). Subtasks are one level (children where
// parentId == id).
// ============================================================================

import type { Capture, SavedView, Todo, TodoLabel } from "./types";

export interface TadaStore {
  listTodos(userId: string): Promise<Todo[]>;
  createTodo(userId: string, t: Partial<Todo>): Promise<Todo>;
  updateTodo(userId: string, id: string, patch: Partial<Todo>): Promise<Todo>;
  reorderTodo(
    userId: string,
    id: string,
    beforeId?: string | null,
    afterId?: string | null,
  ): Promise<Todo>; // fractional index
  subtasks(userId: string, parentId: string): Promise<Todo[]>; // children where parentId == id
  createCapture(userId: string, c: Partial<Capture>): Promise<Capture>;
  listCaptures(userId: string): Promise<Capture[]>; // captures for a user, newest first
  getCapture(userId: string, id: string): Promise<Capture | null>; // ownership-scoped lookup
  labels(userId: string): Promise<TodoLabel[]>;
  upsertLabelByName(userId: string, name: string): Promise<TodoLabel>;
  deleteLabel(userId: string, labelId: string): Promise<void>;
  views(userId: string): Promise<SavedView[]>;
  saveView(userId: string, v: Partial<SavedView>): Promise<SavedView>;
}
