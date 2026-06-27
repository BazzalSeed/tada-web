import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Todo } from "@/lib/contracts";
import type { FinishResponse } from "@/app/lib/api";
import { OfferPanel } from "../OfferPanel";

const NOW = new Date("2026-06-27T09:00:00");

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

describe("OfferPanel (FIX2 — do it for me)", () => {
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
        now={NOW}
        onFinish={onFinish}
        onPatchPayload={vi.fn()}
      />,
    );
    // effect shown; nothing executed yet (never auto-execute)
    expect(screen.getByText("Email Priya")).toBeInTheDocument();
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
          actionPayload: { kind: "meeting", title: "Sync with Sam", attendees: [] },
        })}
        now={NOW}
        onFinish={vi.fn()}
        onPatchPayload={onPatchPayload}
      />,
    );
    // no start → the inline ask shows instead of the do-it button
    expect(screen.getByText(/when should the meeting be/i)).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue(""), {
      target: { value: "2026-06-30T14:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(onPatchPayload).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "meeting", start: "2026-06-30T14:00" }),
      ),
    );
    // simulate the store updating the todo with the new start → do-it appears
    rerender(
      <OfferPanel
        todo={todo({
          actionType: "meeting",
          actionPayload: {
            kind: "meeting",
            title: "Sync with Sam",
            attendees: [],
            start: "2026-06-30T14:00",
          },
        })}
        now={NOW}
        onFinish={vi.fn()}
        onPatchPayload={onPatchPayload}
      />,
    );
    expect(screen.getByRole("button", { name: /send invite/i })).toBeInTheDocument();
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
        now={NOW}
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
          actionPayload: { kind: "meeting", title: "Sync", attendees: [], start: "2026-06-30T14:00" },
        })}
        now={NOW}
        onFinish={vi.fn()}
        onPatchPayload={vi.fn()}
      />,
    );
    expect(screen.getByText(/invite sent/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /send invite/i })).toBeNull();
  });
});
