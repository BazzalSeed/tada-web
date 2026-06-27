import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ProposedAction } from "../cards";
import { OfferCard } from "../tiles/OfferCard";

const meeting: ProposedAction = {
  kind: "meeting",
  title: "Project sync with Dakota",
  attendees: ["Dakota"],
  start: "2026-06-30T14:00:00",
  durationMin: 30,
};

describe("OfferCard (pending gated write)", () => {
  it("renders the concrete meeting effect + attendees", () => {
    render(<OfferCard action={meeting} onApprove={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByText(/project sync with dakota/i)).toBeInTheDocument();
    expect(screen.getByText("with Dakota")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve|send/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /deny/i })).toBeInTheDocument();
  });

  it("fires onApprove / onDeny only on explicit click (never auto-executes)", () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();
    render(<OfferCard action={meeting} onApprove={onApprove} onDeny={onDeny} />);
    expect(onApprove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /approve|send/i }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /deny/i }));
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it("renders a reminder offer's effect", () => {
    const reminder: ProposedAction = { kind: "reminder", text: "Call mom", remindAt: "2026-06-26T18:00:00" };
    render(<OfferCard action={reminder} onApprove={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByText(/call mom/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve & set/i })).toBeInTheDocument();
  });

  it("shows a non-ISO time phrase verbatim instead of an unparseable date", () => {
    // The agent sometimes emits a natural phrase ("6pm today") rather than ISO;
    // render it as-is, never "undefined NaN, NaN".
    const reminder: ProposedAction = { kind: "reminder", text: "Call mom", remindAt: "6pm today" };
    render(<OfferCard action={reminder} onApprove={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByText("6pm today")).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
  });

  it("renders a create-todo offer's effect", () => {
    const t: ProposedAction = { kind: "todo", title: "Buy oat milk", priority: "p2" };
    render(<OfferCard action={t} onApprove={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByText(/buy oat milk/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve & add/i })).toBeInTheDocument();
  });

  it("renders a research offer's effect", () => {
    const r: ProposedAction = { kind: "research", topic: "best CRMs for a small team" };
    render(<OfferCard action={r} onApprove={vi.fn()} onDeny={vi.fn()} />);
    expect(screen.getByText(/best crms/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /approve & run/i })).toBeInTheDocument();
  });

  it("shows Dismissed and hides actions when denied", () => {
    render(<OfferCard action={meeting} onApprove={vi.fn()} onDeny={vi.fn()} status="denied" />);
    expect(screen.getByText(/dismissed/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /approve/i })).not.toBeInTheDocument();
  });
});
