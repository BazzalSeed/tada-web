"use client";

import { useState, type ReactNode } from "react";
import type { FilterCriteria, SavedView, ViewSelection } from "@/lib/contracts";
import { criteriaFor } from "@/lib/core";
import { paletteItemsFor, useTada } from "@/app/lib/store";
import { TodoListView } from "@/app/components/todo/TodoListView";
import { ChatView } from "@/app/components/chat/ChatView";
import { VoiceStage } from "@/app/components/voice/VoiceStage";
import { ViewEditor } from "@/app/components/views/ViewEditor";
import { AppShell } from "./AppShell";
import { DetailPaneView } from "./DetailPaneView";
import styles from "./ContentPlaceholder.module.css";

const VIEW_ACCENT = "#c8632e";

type EditorState =
  | { mode: "create"; seed: FilterCriteria }
  | { mode: "edit"; view: SavedView };

// Maps store state → AppShell props and routes palette selections.
export function AppShellContainer({ children }: { children?: ReactNode }) {
  const { state, dispatch } = useTada();
  const selectedTodo =
    state.todos.find((t) => t.id === state.selectedTodoId) ?? null;
  const isChat = state.selection.kind === "chat";
  const [editor, setEditor] = useState<EditorState | null>(null);
  // The live-voice overlay (entered from the chat composer's mic).
  const [voiceOpen, setVoiceOpen] = useState(false);

  // New views seed from the current selection's criteria (snapshot default),
  // then the builder lets the user compose the full FilterCriteria.
  function openCreate() {
    const sel: ViewSelection =
      state.selection.kind === "chat" ? { kind: "all" } : state.selection;
    setEditor({ mode: "create", seed: criteriaFor(sel, state.views) });
  }

  function saveView(name: string, criteria: FilterCriteria) {
    const view: SavedView =
      editor?.mode === "edit"
        ? { ...editor.view, name, criteria }
        : {
            id: crypto.randomUUID(),
            name,
            colorHex: VIEW_ACCENT,
            icon: "filter",
            sortIndex: state.views.length,
            criteria,
          };
    dispatch({ type: "UPSERT_VIEW", view });
    dispatch({ type: "SELECT_NAV", selection: { kind: "project", id: view.id } });
    setEditor(null);
  }

  function deleteView() {
    if (editor?.mode !== "edit") return;
    dispatch({ type: "DELETE_VIEW", id: editor.view.id });
    dispatch({ type: "SELECT_NAV", selection: { kind: "all" } });
    setEditor(null);
  }

  return (
    <>
    <AppShell
      selection={state.selection}
      views={state.views}
      labels={state.labels}
      paletteItems={paletteItemsFor(state)}
      onSelectNav={(selection) => dispatch({ type: "SELECT_NAV", selection })}
      onPaletteSelect={(item) => {
        if (item.kind === "todo") {
          dispatch({ type: "SELECT_TODO", id: item.id });
        } else {
          dispatch({ type: "SELECT_NAV", selection: item.selection });
        }
      }}
      onCreateView={openCreate}
      onEditView={(view) => setEditor({ mode: "edit", view })}
      overlay={
        editor ? (
          <div
            className={styles.modalScrim}
            role="dialog"
            aria-modal="true"
            aria-label={editor.mode === "create" ? "New view" : "Edit view"}
            onClick={(e) => {
              if (e.target === e.currentTarget) setEditor(null);
            }}
          >
            <ViewEditor
              mode={editor.mode}
              initialName={editor.mode === "edit" ? editor.view.name : ""}
              initialCriteria={
                editor.mode === "edit" ? editor.view.criteria : editor.seed
              }
              labels={state.labels}
              onSave={saveView}
              onCancel={() => setEditor(null)}
              onDelete={editor.mode === "edit" ? deleteView : undefined}
            />
          </div>
        ) : null
      }
      detail={
        selectedTodo ? (
          <DetailPaneView key={selectedTodo.id} todo={selectedTodo} />
        ) : null
      }
    >
      {children ??
        (isChat ? (
          <ChatView onVoice={() => setVoiceOpen(true)} />
        ) : (
          <TodoListView />
        ))}
    </AppShell>
    {voiceOpen ? <VoiceStage onClose={() => setVoiceOpen(false)} /> : null}
    </>
  );
}
