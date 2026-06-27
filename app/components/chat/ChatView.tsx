"use client";

import { useEffect, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { useTada } from "@/app/lib/store";
import { messageToView } from "./messageView";
import { MessageBlock } from "./MessageBlock";
import { TypingIndicator } from "./TypingIndicator";
import { SuggestionCards } from "./SuggestionCards";
import { ChatComposer } from "./ChatComposer";
import styles from "./ChatView.module.css";

// T3.4 text chat. useChat ↔ /api/chat (Gemini tool-loop). Read tools auto-run and
// stream result tiles; gated writes pause as OfferCards (approval-requested) and
// run SERVER-SIDE only on an explicit Approve — native AI SDK HITL, the
// never-auto-execute invariant. `sendAutomaticallyWhen` resubmits once every
// pending approval has a response so the executed result streams back.
//
// Persistence: the conversation lives in Postgres. On mount we load the latest
// thread (GET /api/chat); every turn carries its `conversationId` so the server
// can rehydrate, persist, and compact. "New chat" mints a fresh id (Option 1:
// one visible thread, reset on demand — see docs/chat-persistence.md).
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

  function newChat() {
    setSession({
      conversationId: crypto.randomUUID(),
      initialMessages: [],
      summaryThroughId: null,
    });
  }

  if (!session) {
    return (
      <div className={styles.chat}>
        <div className={styles.loading}>Loading your chat…</div>
      </div>
    );
  }

  return (
    <ChatThread
      key={session.conversationId}
      session={session}
      onVoice={onVoice}
      onNewChat={newChat}
    />
  );
}

function ChatThread({
  session,
  onVoice,
  onNewChat,
}: {
  session: Session;
  onVoice?: () => void;
  onNewChat: () => void;
}) {
  const { state } = useTada();
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
  }, [messages, awaitingReply]);

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

  return (
    <div className={styles.chat}>
      {messages.length > 0 ? (
        <div className={styles.header}>
          <button type="button" className={styles.newChat} onClick={onNewChat}>
            New chat
          </button>
        </div>
      ) : null}
      <div className={styles.thread}>
        {views.length === 0 ? (
          <SuggestionCards onPick={(p) => void sendMessage({ text: p })} />
        ) : (
          views.map((v) => (
            <div key={v.id}>
              <MessageBlock
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
              {/* Watermark = last message folded into the summary, so the line
                  sits AFTER it: everything above is condensed (for the model),
                  everything below is the verbatim live window. */}
              {v.id === session.summaryThroughId ? (
                <div className={styles.compactDivider}>
                  Earlier messages condensed for the assistant
                </div>
              ) : null}
            </div>
          ))
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
