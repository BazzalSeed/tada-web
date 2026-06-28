import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AppShell } from "../AppShell";

function setup(overrides: Partial<React.ComponentProps<typeof AppShell>> = {}) {
  const props = {
    selection: { kind: "all" as const },
    detail: null as React.ReactNode,
    views: [],
    labels: [],
    paletteItems: [{ kind: "todo" as const, id: "t1", label: "Email Dakota" }],
    onSelectNav: vi.fn(),
    onPaletteSelect: vi.fn(),
    onCreateView: vi.fn(),
    onEditView: vi.fn(),
    children: <div data-testid="content">content region</div>,
    ...overrides,
  };
  render(<AppShell {...props} />);
  return props;
}

describe("AppShell", () => {
  it("renders the three-pane shell: sidebar nav + content region", () => {
    setup();
    expect(screen.getByRole("button", { name: /^all$/i })).toBeInTheDocument();
    expect(screen.getByTestId("content")).toBeInTheDocument();
  });

  it("hides the detail pane until a detail node is provided", () => {
    setup({ detail: null });
    expect(screen.queryByTestId("detail")).not.toBeInTheDocument();
    expect(
      screen.getByTestId("shell-root") ?? document.body,
    ).toHaveAttribute("data-detail-open", "false");
  });

  it("shows the detail pane when a detail node is provided", () => {
    setup({ detail: <div data-testid="detail">detail body</div> });
    expect(screen.getByTestId("detail")).toBeInTheDocument();
    expect(screen.getByTestId("shell-root")).toHaveAttribute(
      "data-detail-open",
      "true",
    );
  });

  it("opens the command palette on ⌘K and closes on Escape", () => {
    setup();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    fireEvent.keyDown(document.body, { key: "k", metaKey: true });
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("routes nav selection from the sidebar", () => {
    const props = setup();
    fireEvent.click(screen.getByRole("button", { name: /^today$/i }));
    expect(props.onSelectNav).toHaveBeenCalledWith({ kind: "today" });
  });

  it("renders the drag resizer when a detail node is provided", () => {
    setup({ detail: <div data-testid="detail">detail body</div> });
    const resizer = screen.getByRole("separator", { name: /resize detail panel/i });
    expect(resizer).toBeInTheDocument();
    expect(resizer).toHaveAttribute("aria-orientation", "vertical");
  });

  it("does not render the drag resizer when detail is null", () => {
    setup({ detail: null });
    expect(
      screen.queryByRole("separator", { name: /resize detail panel/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the sidebar toggle with aria-label 'Collapse sidebar' by default", () => {
    setup();
    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("clicking the toggle flips data-sidebar-collapsed and aria-label", () => {
    setup();
    const toggle = screen.getByRole("button", { name: "Collapse sidebar" });
    fireEvent.click(toggle);
    expect(screen.getByTestId("shell-root")).toHaveAttribute("data-sidebar-collapsed", "true");
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeInTheDocument();
  });
});
