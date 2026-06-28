import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Todo } from "@/lib/contracts";
import { MeetingOffer } from "../MeetingOffer";

vi.mock("@/app/lib/api", () => ({
  resolveContacts: vi.fn(async () => [
    { name: "Hansen", email: "hansen@acme.com", status: "resolved" },
  ]),
}));
import { resolveContacts } from "@/app/lib/api";

function mtg(payloadOver: Record<string, unknown> = {}, todoOver: Partial<Todo> = {}): Todo {
  return {
    id: "t1", createdAt: "2026-06-27T08:00:00", sourceCaptureId: "c1",
    title: "Follow up on Claudia", status: "open",
    actionType: "meeting", actionState: "proposed", sortIndex: 0,
    priority: "none", labelIds: [],
    actionPayload: { kind: "meeting", title: "", attendees: ["Hansen"], start: null, durationMin: 30, ...payloadOver },
    ...todoOver,
  } as Todo;
}

describe("MeetingOffer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves the contact on mount and shows the email (even a unique match)", async () => {
    const onPatchPayload = vi.fn(async () => {});
    render(<MeetingOffer todo={mtg()} onFinish={vi.fn()} onPatchPayload={onPatchPayload} />);
    await waitFor(() => expect(resolveContacts).toHaveBeenCalledWith(["Hansen"]));
    await waitFor(() =>
      expect(onPatchPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          resolvedAttendees: [expect.objectContaining({ email: "hansen@acme.com", status: "resolved" })],
        }),
      ),
    );
  });

  it("disables Send until title + date/time + a resolved attendee are all present", () => {
    render(<MeetingOffer todo={mtg()} onFinish={vi.fn()} onPatchPayload={vi.fn()} />);
    expect(screen.getByRole("button", { name: /send invite/i })).toBeDisabled();
  });

  it("syncs the todo due date when the meeting date is set", () => {
    const onPatch = vi.fn();
    const onPatchPayload = vi.fn(async () => {});
    render(
      <MeetingOffer
        todo={mtg({ resolvedAttendees: [{ name: "Hansen", email: "hansen@acme.com", status: "resolved" }] })}
        onFinish={vi.fn()} onPatchPayload={onPatchPayload} onPatch={onPatch}
      />,
    );
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-06-30" } });
    expect(onPatchPayload).toHaveBeenCalledWith(expect.objectContaining({ start: "2026-06-30T00:00:00" }));
    expect(onPatch).toHaveBeenCalledWith({ dueAt: "2026-06-30T00:00:00" });
  });

  it("enables Send and fires onFinish once everything is valid", async () => {
    const onFinish = vi.fn(async () => ({ ok: true, actionExternalId: "evt_1", actionLink: "https://cal/evt_1" }));
    render(
      <MeetingOffer
        todo={mtg({
          title: "Follow up on Claudia", start: "2026-06-30T09:00:00",
          resolvedAttendees: [{ name: "Hansen", email: "hansen@acme.com", status: "resolved" }],
        })}
        onFinish={onFinish} onPatchPayload={vi.fn()}
      />,
    );
    const send = screen.getByRole("button", { name: /send invite/i });
    expect(send).not.toBeDisabled();
    fireEvent.click(send);
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
  });

  it("shows booked details + a calendar link when done", () => {
    render(
      <MeetingOffer
        todo={mtg(
          {
            title: "Follow up on Claudia", start: "2026-06-30T09:00:00",
            resolvedAttendees: [{ name: "Hansen", email: "hansen@acme.com", status: "resolved" }],
            htmlLink: "https://cal/evt_1",
          },
          { actionState: "done" },
        )}
        onFinish={vi.fn()} onPatchPayload={vi.fn()}
      />,
    );
    expect(screen.getByText(/invite sent/i)).toBeInTheDocument();
    expect(screen.getByText(/hansen@acme\.com/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /google calendar/i })).toHaveAttribute("href", "https://cal/evt_1");
  });

  describe("Mark done nudge (done state)", () => {
    it("renders 'Mark done' and calls onComplete when meeting is done and todo is open", () => {
      const onComplete = vi.fn();
      render(
        <MeetingOffer
          todo={mtg(
            { title: "Follow up on Claudia", start: "2026-06-30T09:00:00",
              resolvedAttendees: [{ name: "Hansen", email: "hansen@acme.com", status: "resolved" }] },
            { actionState: "done", status: "open" },
          )}
          onFinish={vi.fn()} onPatchPayload={vi.fn()} onComplete={onComplete}
        />,
      );
      const btn = screen.getByRole("button", { name: /mark done/i });
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it("does NOT render 'Mark done' when the todo is already done", () => {
      render(
        <MeetingOffer
          todo={mtg(
            { title: "Follow up on Claudia", start: "2026-06-30T09:00:00",
              resolvedAttendees: [{ name: "Hansen", email: "hansen@acme.com", status: "resolved" }] },
            { actionState: "done", status: "done" },
          )}
          onFinish={vi.fn()} onPatchPayload={vi.fn()} onComplete={vi.fn()}
        />,
      );
      expect(screen.queryByRole("button", { name: /mark done/i })).not.toBeInTheDocument();
    });
  });
});
