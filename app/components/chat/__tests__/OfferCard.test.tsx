import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ActionPayload, Attendee } from "@/lib/contracts";
import { OfferCard } from "../tiles/OfferCard";

const meeting: ActionPayload = {
  kind: "meeting",
  title: "Project sync with Dakota",
  start: "2026-06-30T14:00:00",
  durationMin: 30,
};

describe("OfferCard", () => {
  it("renders the concrete meeting effect", () => {
    render(<OfferCard payload={meeting} onApprove={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByText(/project sync with dakota/i)).toBeInTheDocument();
    // shows it's an offer, not yet done
    expect(screen.getByRole("button", { name: /approve|send/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deny|cancel/i })).toBeInTheDocument();
  });

  it("fires onApprove / onDeny only on explicit click (never auto-executes)", () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    render(<OfferCard payload={meeting} onApprove={onApprove} onDeny={onDeny} />);
    expect(onApprove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /approve|send/i }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /deny|cancel/i }));
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it("gates Approve for a meeting until every attendee is resolved", () => {
    const attendees: Attendee[] = [
      { name: "Dakota", status: "resolved", email: "dakota@acme.com" },
      {
        name: "Sam",
        status: "unresolved",
        candidates: [
          { name: "Sam Lee", email: "sam@acme.com", org: "Acme" },
          { name: "Sam Park", email: "sam.park@acme.com" },
        ],
      },
    ];
    render(
      <OfferCard payload={meeting} attendees={attendees} onApprove={vi.fn()} onDeny={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /approve|send/i })).toBeDisabled();
    // the unresolved attendee's candidate picker is shown
    expect(screen.getByText("sam@acme.com")).toBeInTheDocument();
    expect(screen.getByText("sam.park@acme.com")).toBeInTheDocument();
  });

  it("enables Approve once all attendees are resolved", () => {
    const attendees: Attendee[] = [
      { name: "Dakota", status: "resolved", email: "dakota@acme.com" },
    ];
    render(
      <OfferCard payload={meeting} attendees={attendees} onApprove={vi.fn()} onDeny={vi.fn()} />,
    );
    expect(screen.getByRole("button", { name: /approve|send/i })).toBeEnabled();
  });

  it("picks a candidate to resolve an attendee", () => {
    const onResolveAttendee = vi.fn();
    const attendees: Attendee[] = [
      {
        name: "Sam",
        status: "unresolved",
        candidates: [{ name: "Sam Lee", email: "sam@acme.com", org: "Acme" }],
      },
    ];
    render(
      <OfferCard
        payload={meeting}
        attendees={attendees}
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onResolveAttendee={onResolveAttendee}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /sam@acme\.com/i }));
    expect(onResolveAttendee).toHaveBeenCalledWith("Sam", "sam@acme.com");
  });

  it("renders a reminder offer's effect", () => {
    const reminder: ActionPayload = { kind: "reminder", text: "Call mom", remindAt: "2026-06-26T18:00:00" };
    render(<OfferCard payload={reminder} onApprove={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByText(/call mom/i)).toBeInTheDocument();
  });
});
