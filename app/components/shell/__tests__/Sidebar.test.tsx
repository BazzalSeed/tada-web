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

describe("Sidebar", () => {
  it("renders the core nav: All, Chat, Today", () => {
    render(
      <Sidebar
        selection={{ kind: "all" }}
        views={[]}
        labels={[]}
        onSelect={vi.fn()}
        onAddView={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /^all$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^chat$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^today$/i })).toBeInTheDocument();
  });

  it("renders user SavedViews and labels", () => {
    render(
      <Sidebar
        selection={{ kind: "all" }}
        views={[view]}
        labels={[label]}
        onSelect={vi.fn()}
        onAddView={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /work/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /errand/i })).toBeInTheDocument();
  });

  it("marks the active selection with aria-current (no heavy fill — accent/raised)", () => {
    render(
      <Sidebar
        selection={{ kind: "today" }}
        views={[]}
        labels={[]}
        onSelect={vi.fn()}
        onAddView={vi.fn()}
      />,
    );
    const today = screen.getByRole("button", { name: /^today$/i });
    expect(today).toHaveAttribute("aria-current", "true");
    // All is not active
    expect(screen.getByRole("button", { name: /^all$/i })).not.toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("calls onSelect with the chosen view selection", () => {
    const onSelect = vi.fn();
    render(
      <Sidebar
        selection={{ kind: "all" }}
        views={[view]}
        labels={[]}
        onSelect={onSelect}
        onAddView={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /work/i }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "project", id: "v1" });
  });

  it("calls onSelect with the chat destination", () => {
    const onSelect = vi.fn();
    render(
      <Sidebar
        selection={{ kind: "all" }}
        views={[]}
        labels={[]}
        onSelect={onSelect}
        onAddView={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^chat$/i }));
    expect(onSelect).toHaveBeenCalledWith({ kind: "chat" });
  });

  it("creates a view: the [+] reveals a name input that submits on Enter", () => {
    const onAddView = vi.fn();
    render(
      <Sidebar
        selection={{ kind: "all" }}
        views={[]}
        labels={[]}
        onSelect={vi.fn()}
        onAddView={onAddView}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add view/i }));
    const input = screen.getByPlaceholderText(/view name/i);
    fireEvent.change(input, { target: { value: "My errands" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAddView).toHaveBeenCalledWith("My errands");
  });

  it("does not create a view from a blank name", () => {
    const onAddView = vi.fn();
    render(
      <Sidebar
        selection={{ kind: "all" }}
        views={[]}
        labels={[]}
        onSelect={vi.fn()}
        onAddView={onAddView}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add view/i }));
    const input = screen.getByPlaceholderText(/view name/i);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onAddView).not.toHaveBeenCalled();
  });
});
