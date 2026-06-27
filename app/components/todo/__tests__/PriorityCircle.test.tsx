import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PriorityCircle } from "../PriorityCircle";

describe("PriorityCircle", () => {
  it("renders a checkbox reflecting done state, labelled by title", () => {
    render(
      <PriorityCircle
        priority="p1"
        done={false}
        title="Email Dakota"
        onToggle={vi.fn()}
      />,
    );
    const box = screen.getByRole("checkbox", { name: /complete email dakota/i });
    expect(box).toHaveAttribute("aria-checked", "false");
  });

  it("reflects completed state", () => {
    render(
      <PriorityCircle
        priority="none"
        done
        title="Buy milk"
        onToggle={vi.fn()}
      />,
    );
    expect(screen.getByRole("checkbox")).toHaveAttribute("aria-checked", "true");
  });

  it("exposes the priority via data-priority (drives the accent color)", () => {
    render(
      <PriorityCircle priority="p2" done={false} title="x" onToggle={vi.fn()} />,
    );
    expect(screen.getByRole("checkbox")).toHaveAttribute("data-priority", "p2");
  });

  it("calls onToggle when clicked", () => {
    const onToggle = vi.fn();
    render(
      <PriorityCircle priority="p3" done={false} title="x" onToggle={onToggle} />,
    );
    fireEvent.click(screen.getByRole("checkbox"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
