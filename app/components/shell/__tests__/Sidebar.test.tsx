import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { SavedView, TodoLabel } from "@/lib/contracts";
import { Sidebar } from "../Sidebar";

const view: SavedView = {
  id: "v1",
  name: "Work",
  colorHex: "#c8632e",
  icon: "briefcase",
  sortIndex: 0,
  criteria: { labelIds: [], dateWindow: "any", includeCompleted: false },
};

const label: TodoLabel = { id: "l1", name: "errand", colorHex: "#5d574d" };

function renderSidebar(
  props: Partial<React.ComponentProps<typeof Sidebar>> = {},
) {
  return render(
    <Sidebar
      selection={{ kind: "all" }}
      views={[]}
      labels={[]}
      onSelect={vi.fn()}
      onCreateView={vi.fn()}
      onEditView={vi.fn()}
      {...props}
    />,
  );
}

describe("Sidebar", () => {
  it("renders the core nav: All, Chat, Today", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: /^all$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^chat$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^today$/i })).toBeInTheDocument();
  });

  it("renders user SavedViews and labels", () => {
    renderSidebar({ views: [view], labels: [label] });
    expect(screen.getByRole("button", { name: /^work$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /errand/i })).toBeInTheDocument();
  });

  it("marks the active selection with aria-current (no heavy fill — accent/raised)", () => {
    renderSidebar({ selection: { kind: "today" } });
    const today = screen.getByRole("button", { name: /^today$/i });
    expect(today).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /^all$/i })).not.toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("calls onSelect with the chosen view selection", () => {
    const onSelect = vi.fn();
    renderSidebar({ views: [view], onSelect });
    fireEvent.click(screen.getByRole("button", { name: /^work$/i }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "project", id: "v1" });
  });

  it("calls onSelect with the chat destination", () => {
    const onSelect = vi.fn();
    renderSidebar({ onSelect });
    fireEvent.click(screen.getByRole("button", { name: /^chat$/i }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "chat" });
  });

  it("opens the view builder from [+] (compose criteria, not just a name)", () => {
    const onCreateView = vi.fn();
    renderSidebar({ onCreateView });
    fireEvent.click(screen.getByRole("button", { name: /add view/i }));
    expect(onCreateView).toHaveBeenCalledTimes(1);
  });

  it("opens the editor for an existing view via its ··· menu", () => {
    const onEditView = vi.fn();
    renderSidebar({ views: [view], onEditView });
    fireEvent.click(screen.getByRole("button", { name: /edit work/i }));
    expect(onEditView).toHaveBeenCalledWith(view);
  });
});
