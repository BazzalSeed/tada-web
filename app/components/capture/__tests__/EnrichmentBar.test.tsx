import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { EnrichmentChip } from "@/app/lib/enrich";
import { EnrichmentBar } from "../EnrichmentBar";

const chips: EnrichmentChip[] = [
  { key: "priority:p1", kind: "priority", label: "P1", priority: "p1" },
  { key: "due:x", kind: "due", label: "Tomorrow", dueAt: "2026-06-27T00:00:00" },
  { key: "action:meeting", kind: "action", label: "Meeting", actionType: "meeting" },
];

describe("EnrichmentBar", () => {
  it("renders nothing when there are no chips", () => {
    const { container } = render(
      <EnrichmentBar chips={[]} onAccept={vi.fn()} onDismiss={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows one tappable chip per suggestion, naming its concrete effect", () => {
    render(<EnrichmentBar chips={chips} onAccept={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByRole("button", { name: /add p1/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add tomorrow/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /add meeting/i })).toBeInTheDocument();
  });

  it("applies a suggestion only on an explicit tap (never auto-applies)", () => {
    const onAccept = vi.fn();
    render(<EnrichmentBar chips={chips} onAccept={onAccept} onDismiss={vi.fn()} />);
    // nothing fired on render
    expect(onAccept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /add tomorrow/i }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onAccept).toHaveBeenCalledWith(chips[1]);
  });

  it("dismisses all suggestions", () => {
    const onDismiss = vi.fn();
    render(<EnrichmentBar chips={chips} onAccept={vi.fn()} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss suggestions/i }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
