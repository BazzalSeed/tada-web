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

  // ── Icon rail ──────────────────────────────────────────────────────────

  it("renders an SVG icon inside each primary nav item (All, Chat, Today)", () => {
    renderSidebar();
    const all = screen.getByRole("button", { name: /^all$/i });
    const chat = screen.getByRole("button", { name: /^chat$/i });
    const today = screen.getByRole("button", { name: /^today$/i });
    expect(all.querySelector("svg")).toBeTruthy();
    expect(chat.querySelector("svg")).toBeTruthy();
    expect(today.querySelector("svg")).toBeTruthy();
  });

  it("renders an SVG icon inside view and label nav items (icon column consistent)", () => {
    renderSidebar({ views: [view], labels: [label] });
    const workBtn = screen.getByRole("button", { name: /^work$/i });
    const errandBtn = screen.getByRole("button", { name: /errand/i });
    // Both must have an SVG icon so the leading column aligns with All/Chat/Today
    expect(workBtn.querySelector("svg")).toBeTruthy();
    expect(errandBtn.querySelector("svg")).toBeTruthy();
    // Icons inherit the standard color treatment (no per-item inline color)
    const workIcon = workBtn.querySelector("[class*='itemIcon']") as HTMLElement | null;
    expect(workIcon?.style.color).toBeFalsy();
    const errandIcon = errandBtn.querySelector("[class*='itemIcon']") as HTMLElement | null;
    expect(errandIcon?.style.color).toBeFalsy();
  });

  it("keeps label text in the DOM for each primary item (tooltip + aria)", () => {
    const { container } = renderSidebar();
    // aria-label on the button covers screen readers; itemLabel span holds
    // the visible/tooltip text — both must be present.
    expect(screen.getByRole("button", { name: /^all$/i })).toBeInTheDocument();
    // The label text node exists somewhere inside the button
    const allBtn = screen.getByRole("button", { name: /^all$/i });
    expect(allBtn.textContent).toContain("All");
    // Suppress unused-variable warning for container
    void container;
  });

  it("sets data-collapsed on the nav when collapsed=true", () => {
    renderSidebar({ collapsed: true });
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(nav).toHaveAttribute("data-collapsed", "true");
  });

  it("does NOT set data-collapsed on the nav when collapsed=false (expanded)", () => {
    renderSidebar({ collapsed: false });
    const nav = screen.getByRole("navigation", { name: /primary/i });
    expect(nav).not.toHaveAttribute("data-collapsed");
  });

  // ── Toggle button ──────────────────────────────────────────────────────

  it("renders the toggle with aria-label 'Collapse sidebar' when expanded", () => {
    renderSidebar({ collapsed: false, onToggle: vi.fn() });
    const btn = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-expanded", "true");
  });

  it("renders the toggle with aria-label 'Expand sidebar' when collapsed", () => {
    renderSidebar({ collapsed: true, onToggle: vi.fn() });
    const btn = screen.getByRole("button", { name: "Expand sidebar" });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("calls onToggle when the toggle button is clicked", () => {
    const onToggle = vi.fn();
    renderSidebar({ collapsed: false, onToggle });
    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("does not render the toggle button when onToggle is not provided", () => {
    renderSidebar({ collapsed: false });
    expect(screen.queryByRole("button", { name: /collapse sidebar/i })).not.toBeInTheDocument();
  });

  it("keeps all items accessible by aria-label when collapsed", () => {
    renderSidebar({ collapsed: true, views: [view], labels: [label] });
    // Items must still exist in the DOM for tooltip text and screen-reader access
    expect(screen.getByRole("button", { name: /^all$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^chat$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^today$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^work$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /errand/i })).toBeInTheDocument();
  });

  // ── Delete label affordance ────────────────────────────────────────────

  it("renders a delete button per label when onDeleteLabel is provided", () => {
    renderSidebar({ labels: [label], onDeleteLabel: vi.fn() });
    expect(
      screen.getByRole("button", { name: /delete #errand/i }),
    ).toBeInTheDocument();
  });

  it("calls onDeleteLabel (not onSelect) when the delete button is clicked", () => {
    const onDeleteLabel = vi.fn();
    const onSelect = vi.fn();
    renderSidebar({ labels: [label], onDeleteLabel, onSelect });
    fireEvent.click(screen.getByRole("button", { name: /delete #errand/i }));
    expect(onDeleteLabel).toHaveBeenCalledWith(label);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("does not render delete buttons when onDeleteLabel is omitted", () => {
    renderSidebar({ labels: [label] });
    expect(
      screen.queryByRole("button", { name: /delete #errand/i }),
    ).not.toBeInTheDocument();
  });
});
