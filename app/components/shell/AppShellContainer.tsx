"use client";

import { type ReactNode } from "react";
import { paletteItemsFor, useTada } from "@/app/lib/store";
import { createViewFromSelection } from "@/app/lib/selectors";
import { TodoListView } from "@/app/components/todo/TodoListView";
import { AppShell } from "./AppShell";
import { DetailPaneView } from "./DetailPaneView";
import styles from "./ContentPlaceholder.module.css";

// Chat is a destination, not a filter-View; its surface lands in T3.4. Until then
// the Chat selection shows a calm placeholder.
function ChatPlaceholder() {
  return (
    <div className={styles.placeholder}>
      <p className={styles.eyebrow}>Chat</p>
      <p className={styles.note}>The text + voice agent lands in T3.4–T3.5.</p>
    </div>
  );
}

// Maps store state → AppShell props and routes palette selections.
export function AppShellContainer({ children }: { children?: ReactNode }) {
  const { state, dispatch } = useTada();
  const selectedTodo =
    state.todos.find((t) => t.id === state.selectedTodoId) ?? null;
  const isChat = state.selection.kind === "chat";

  return (
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
      onAddView={(name) => {
        // Save the current filter as a named View, then navigate to it.
        const view = createViewFromSelection(
          name,
          state,
          crypto.randomUUID(),
          state.views.length,
        );
        dispatch({ type: "UPSERT_VIEW", view });
        dispatch({ type: "SELECT_NAV", selection: { kind: "project", id: view.id } });
      }}
      detail={
        selectedTodo ? (
          <DetailPaneView key={selectedTodo.id} todo={selectedTodo} />
        ) : null
      }
    >
      {children ?? (isChat ? <ChatPlaceholder /> : <TodoListView />)}
    </AppShell>
  );
}
