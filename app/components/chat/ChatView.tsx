"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { useTada } from "@/app/lib/store";
import { clearChat } from "@/app/lib/api";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { messageToView } from "./messageView";
import { MessageBlock } from "./MessageBlock";
import { TypingIndicator } from "./TypingIndicator";
import { SuggestionCards } from "./SuggestionCards";
import { ChatComposer } from "./ChatComposer";
import { ViewLoading } from "@/app/components/app/ViewLoading";
import styles from "./ChatView.module.css";

// T3.4 text chat. useChat ↔ /api/chat (Gemini tool-loop). Read tools auto-run and
// stream result tiles; gated writes pause as OfferCards (approval-requested) and
// run SERVER-SIDE only on an explicit Approve — native AI SDK HITL, the
// never-auto-execute invariant. `sendAutomaticallyWhen` resubmits once every
// pending approval has a response so the executed result streams back.
//
// Persistence: the conversation lives in Postgres. On mount we load the thread
// (GET /api/chat); every turn carries its `conversationId` so the server can
// rehydrate, persist, and compact. One continuous auto-managed thread — no
// "new chat" reset; the summarized prefix collapses behind "show earlier"
// (see docs/chat-persistence.md).
export interface ChatViewProps {
  onVoice?: () => void;
}

interface Session {
  conversationId: string;
  initialMessages: UIMessage[];
  summaryThroughId: string | null;
}

export function ChatView({ onVoice }: ChatViewProps) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (cancelled) return;
        setSession({
          conversationId: d.conversationId,
          initialMessages: (d.messages as UIMessage[]) ?? [],
          summaryThroughId: d.summaryThroughId ?? null,
        });
      })
      .catch(() => {
        // Offline / error: still let the user chat into a fresh local thread.
        if (!cancelled) {
          setSession({
            conversationId: crypto.randomUUID(),
            initialMessages: [],
            summaryThroughId: null,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function resetSession() {
    setSession({
      conversationId: crypto.randomUUID(),
      initialMessages: [],
      summaryThroughId: null,
    });
  }

  if (!session) {
    return (
      <div className={styles.chat}>
        <ViewLoading />
      </div>
    );
  }

  return (
    <ChatThread
      key={session.conversationId}
      session={session}
      onVoice={onVoice}
      onClearChat={async () => {
        await clearChat(session.conversationId);
        resetSession();
      }}
    />
  );
}

function ChatThread({
  session,
  onVoice,
  onClearChat,
}: {
  session: Session;
  onVoice?: () => void;
  onClearChat: () => Promise<void>;
}) {
  const { state } = useTada();
  const [showEarlier, setShowEarlier] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const { messages, sendMessage, status, addToolApprovalResponse } = useChat({
    id: session.conversationId,
    messages: session.initialMessages,
    transport: new DefaultChatTransport({
      api: "/api/chat",
      body: { conversationId: session.conversationId },
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
  });
  const views = messages.map(messageToView);
  const busy = status === "streaming" || status === "submitted";
  const now = new Date();
  const last = views[views.length - 1];

  // Split at the summary watermark: messages through it are "condensed" (the
  // model only has the summary of them), so they collapse behind a toggle to
  // cut scroll. Everything after is the verbatim live window. Watermark comes
  // from the load; mid-session compaction shows up on the next reload.
  const wmIdx = session.summaryThroughId
    ? views.findIndex((v) => v.id === session.summaryThroughId)
    : -1;
  const condensed = wmIdx >= 0 ? views.slice(0, wmIdx + 1) : [];
  const live = wmIdx >= 0 ? views.slice(wmIdx + 1) : views;

  // Show the typing indicator while the model is "thinking": after send but
  // before the first token, OR mid-stream while the latest assistant turn is
  // still empty (e.g. a tool is running and hasn't produced text/a tile yet).
  const awaitingReply =
    status === "submitted" ||
    (status === "streaming" &&
      last?.role === "assistant" &&
      !last.text &&
      last.cards.length === 0);

  // Keep the newest content in view as it streams in (human chat feel).
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, awaitingReply, showEarlier]);

  async function handleConfirmClear() {
    setClearing(true);
    try {
      await onClearChat();
    } finally {
      setClearing(false);
      setConfirmClear(false);
    }
  }

  function resolveOffer(
    view: (typeof views)[number],
    cardIndex: number,
    approved: boolean,
  ) {
    const offer = view.offers.find((o) => o.cardIndex === cardIndex);
    if (!offer) return;
    // HITL: respond to the tool's approval request. The SDK runs (or skips) the
    // gated executor server-side and streams the result tile.
    addToolApprovalResponse({ id: offer.approvalId, approved });
  }

  function renderBlock(v: (typeof views)[number]) {
    return (
      <MessageBlock
        key={v.id}
        role={v.role}
        text={v.text}
        cards={v.cards}
        labels={state.labels}
        now={now}
        streaming={
          status === "streaming" &&
          v.id === last?.id &&
          v.role === "assistant" &&
          Boolean(v.text)
        }
        onApprove={(i) => resolveOffer(v, i, true)}
        onDeny={(i) => resolveOffer(v, i, false)}
      />
    );
  }

  return (
    <div className={styles.chat}>
      {/* Thread header: right-aligned thread-level actions (clear chat). */}
      {messages.length > 0 ? (
        <div className={styles.threadHeader}>
          <button
            type="button"
            className={styles.clearButton}
            onClick={() => setConfirmClear(true)}
            disabled={busy || clearing}
            title="Clear chat"
          >
            Clear chat
          </button>
        </div>
      ) : null}
      {confirmClear ? (
        <ConfirmDialog
          title="Clear this chat?"
          message="This permanently removes all messages in this conversation. You can't undo this."
          confirmLabel={clearing ? "Clearing…" : "Clear"}
          cancelLabel="Cancel"
          destructive
          onConfirm={() => void handleConfirmClear()}
          onCancel={() => setConfirmClear(false)}
        />
      ) : null}
      <div className={styles.thread}>
        {views.length === 0 ? (
          <SuggestionCards onPick={(p) => void sendMessage({ text: p })} />
        ) : (
          <>
            {condensed.length > 0 ? (
              <button
                type="button"
                className={styles.earlierToggle}
                onClick={() => setShowEarlier((s) => !s)}
                aria-expanded={showEarlier}
              >
                {showEarlier
                  ? "Hide earlier messages"
                  : `Show ${condensed.length} earlier message${condensed.length === 1 ? "" : "s"} (condensed for the assistant)`}
              </button>
            ) : null}
            {showEarlier ? (
              <div className={styles.condensed}>{condensed.map(renderBlock)}</div>
            ) : null}
            {condensed.length > 0 && showEarlier ? (
              <div className={styles.compactDivider}>
                Above is condensed for the assistant · below is verbatim
              </div>
            ) : null}
            {live.map(renderBlock)}
          </>
        )}
        {awaitingReply ? <TypingIndicator /> : null}
        <div ref={endRef} />
      </div>
      <div className={styles.composerWrap}>
        <ChatComposer
          onSend={(t) => void sendMessage({ text: t })}
          onVoice={onVoice}
          busy={busy}
        />
      </div>
    </div>
  );
}
