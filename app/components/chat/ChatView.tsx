"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useTada } from "@/app/lib/store";
import { messageToView } from "./messageView";
import { MessageBlock } from "./MessageBlock";
import { SuggestionCards } from "./SuggestionCards";
import { ChatComposer } from "./ChatComposer";
import styles from "./ChatView.module.css";

// T3.4 text chat. useChat ↔ /api/chat (Gemini tool-loop). Read tools auto-run and
// stream result tiles; gated writes pause as OfferCards and fire only on an
// explicit Approve (HITL via addToolResult) — the never-auto-execute invariant.
export interface ChatViewProps {
  onVoice?: () => void;
}

export function ChatView({ onVoice }: ChatViewProps) {
  const { state } = useTada();
  const { messages, sendMessage, status, addToolResult } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const views = messages.map(messageToView);
  const busy = status === "streaming" || status === "submitted";
  const now = new Date();

  function resolveOffer(
    view: (typeof views)[number],
    cardIndex: number,
    approved: boolean,
  ) {
    const offer = view.offers.find((o) => o.cardIndex === cardIndex);
    if (!offer) return;
    // HITL: hand the approval decision back to the tool loop; the server-side
    // executor runs (or skips) the gated action and streams the result tile.
    void addToolResult({
      tool: offer.toolName,
      toolCallId: offer.toolCallId,
      output: { approved },
    });
  }

  return (
    <div className={styles.chat}>
      <div className={styles.thread}>
        {views.length === 0 ? (
          <SuggestionCards onPick={(p) => void sendMessage({ text: p })} />
        ) : (
          views.map((v) => (
            <MessageBlock
              key={v.id}
              role={v.role}
              text={v.text}
              cards={v.cards}
              labels={state.labels}
              now={now}
              onApprove={(i) => resolveOffer(v, i, true)}
              onDeny={(i) => resolveOffer(v, i, false)}
            />
          ))
        )}
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
