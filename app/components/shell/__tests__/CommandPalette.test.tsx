import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CommandPalette, type PaletteItem } from "../CommandPalette";

const items: PaletteItem[] = [
  { kind: "view", id: "v1", label: "Work", selection: { kind: "project", id: "v1" } },
  { kind: "label", id: "l1", label: "errand", selection: { kind: "label", id: "l1" } },
  { kind: "todo", id: "t1", label: "Email Dakota" },
  { kind: "todo", id: "t2", label: "Buy milk" },
];

describe("CommandPalette", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <CommandPalette open={false} items={items} onClose={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("focuses the search box when opened", () => {
    render(
      <CommandPalette open items={items} onClose={vi.fn()} onSelect={vi.fn()} />,
    );
    expect(screen.getByRole("combobox")).toHaveFocus();
  });

  it("filters items by query substring (case-insensitive)", () => {
    render(
      <CommandPalette open items={items} onClose={vi.fn()} onSelect={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "mil" } });
    expect(screen.getByText("Buy milk")).toBeInTheDocument();
    expect(screen.queryByText("Email Dakota")).not.toBeInTheDocument();
  });

  it("selects the highlighted item on Enter (arrow-navigable)", () => {
    const onSelect = vi.fn();
    render(
      <CommandPalette open items={items} onClose={vi.fn()} onSelect={onSelect} />,
    );
    const box = screen.getByRole("combobox");
    // first item highlighted by default; ArrowDown moves to second
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith(items[1]);
  });

  it("closes on Escape", () => {
    const onClose = vi.fn();
    render(
      <CommandPalette open items={items} onClose={onClose} onSelect={vi.fn()} />,
    );
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
