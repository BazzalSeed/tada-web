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

  it("asks for a missing meeting time up-front, then reveals the do-it button", async () => {
    const onPatchPayload = vi.fn(async () => {});
    const { rerender } = render(
      <OfferPanel
        todo={todo({
          actionType: "meeting",
          actionPayload: { kind: "meeting", title: "Sync with Sam", attendees: ["Sam"] },
        })}
        onFinish={vi.fn()}
        onPatchPayload={onPatchPayload}
      />,
    );
    // no start → the inline ask shows instead of the do-it button (never-auto)
    expect(screen.getByText(/when should the meeting be/i)).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue(""), { target: { value: "2026-06-30T14:00" } });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(onPatchPayload).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "meeting", start: "2026-06-30T14:00" }),
      ),
    );
    // store updates the todo with the new start (attendees present) → do-it appears
    rerender(
      <OfferPanel
        todo={todo({
          actionType: "meeting",
          actionPayload: {
            kind: "meeting",
            title: "Sync with Sam",
            attendees: ["Sam"],
            start: "2026-06-30T14:00",
          },
        })}
        onFinish={vi.fn()}
        onPatchPayload={onPatchPayload}
      />,
    );
    expect(screen.getByRole("button", { name: /send invite/i })).toBeInTheDocument();
  });

  it("gates on missing attendees (the drift the FE-only check missed)", () => {
    render(
      <OfferPanel
        todo={todo({
          actionType: "meeting",
          actionPayload: { kind: "meeting", title: "Sync", attendees: [], start: "2026-06-30T14:00" },
        })}
        onFinish={vi.fn()}
        onPatchPayload={vi.fn()}
      />,
    );
    // time present but NO attendees → describeOffer.needsField='attendees' → ask, not arm
    expect(screen.getByText(/who's the meeting with/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send invite/i })).toBeNull();
  });

  it("renders attendee candidate pickers when disambiguation is needed", async () => {
    const onPatchPayload = vi.fn(async () => {});
    render(
      <OfferPanel
        todo={todo({
          actionType: "meeting",
          actionState: "needs_disambiguation",
          actionPayload: {
            kind: "meeting",
            title: "Sync",
            attendees: ["Marcus"],
            start: "2026-06-30T14:00",
            resolvedAttendees: [
              {
                name: "Marcus",
                status: "unresolved",
                candidates: [
                  { name: "Marcus Lee", email: "marcus@acme.com" },
                  { name: "Marcus Roe", email: "mroe@beta.io" },
                ],
              },
            ],
          },
        })}
        onFinish={vi.fn()}
        onPatchPayload={onPatchPayload}
      />,
    );
    expect(screen.getByText(/who do you mean/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /marcus@acme\.com/i }));
    await waitFor(() =>
      expect(onPatchPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          resolvedAttendees: [
            expect.objectContaining({ email: "marcus@acme.com", status: "resolved" }),
          ],
        }),
      ),
    );
  });

  it("shows a calm confirmation when already executed", () => {
    render(
      <OfferPanel
        todo={todo({
          actionType: "meeting",
          actionState: "done",
          actionPayload: { kind: "meeting", title: "Sync", attendees: ["Sam"], start: "2026-06-30T14:00" },
        })}
        onFinish={vi.fn()}
        onPatchPayload={vi.fn()}
      />,
    );
    expect(screen.getByText(/invite sent/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send invite/i })).toBeNull();
  });
});
