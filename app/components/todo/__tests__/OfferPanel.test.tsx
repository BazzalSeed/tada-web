import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Todo } from "@/lib/contracts";
import type { FinishResponse } from "@/app/lib/api";
import { OfferPanel } from "../OfferPanel";

function todo(over: Partial<Todo>): Todo {
  return {
    id: "t1",
    createdAt: "2026-06-27T08:00:00",
    sourceCaptureId: "c1",
    title: "Email Priya the deck",
    status: "open",
    actionType: "none",
    actionState: "proposed",
    sortIndex: 0,
    priority: "none",
    labelIds: [],
    ...over,
  };
}

describe("OfferPanel (FIX2 — do it for me; FIX11 unified on describeOffer)", () => {
  it("shows the concrete effect and only finishes on the explicit tap (never auto)", async () => {
    const onFinish = vi.fn(
      async (): Promise<FinishResponse> => ({ ok: true, actionExternalId: "rmd_1" }),
    );
    render(
      <OfferPanel
        todo={todo({
          actionType: "reminder",
          actionPayload: { kind: "reminder", text: "Email Priya", remindAt: "2026-06-28T09:00:00" },
        })}
        onFinish={onFinish}
        onPatchPayload={vi.fn()}
      />,
    );
    // concrete effect (from describeOffer) shown; nothing executed yet
    expect(screen.getByText(/Email Priya/)).toBeInTheDocument();
    expect(onFinish).not.toHaveBeenCalled();
    // the tap IS the confirmation
    fireEvent.click(screen.getByRole("button", { name: /set reminder/i }));
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
  });

});
