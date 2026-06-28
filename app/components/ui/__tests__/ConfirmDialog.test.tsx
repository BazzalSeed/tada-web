import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConfirmDialog } from "../ConfirmDialog";

function renderDialog(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <ConfirmDialog
      title="Delete forever?"
      message="This cannot be undone."
      onConfirm={onConfirm}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
  it("renders the title and message", () => {
    renderDialog();
    expect(screen.getByRole("dialog", { name: "Delete forever?" })).toBeTruthy();
    expect(screen.getByText("This cannot be undone.")).toBeTruthy();
  });

  it("clicking the confirm button calls onConfirm", () => {
    const { onConfirm, onCancel } = renderDialog({ confirmLabel: "Yes, delete" });
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("clicking the cancel button calls onCancel", () => {
    const { onConfirm, onCancel } = renderDialog({ cancelLabel: "No thanks" });
    fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("pressing Escape calls onCancel", () => {
    const { onConfirm, onCancel } = renderDialog();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("clicking the scrim background calls onCancel", () => {
    const { onConfirm, onCancel } = renderDialog();
    const dialog = screen.getByRole("dialog");
    // Simulate a click whose target IS the dialog element itself (the scrim).
    fireEvent.click(dialog, { target: dialog });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("clicking inside the card does NOT call onCancel", () => {
    const { onCancel } = renderDialog();
    // Click the message text (inside the card, not the scrim background).
    fireEvent.click(screen.getByText("This cannot be undone."));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("uses default labels when none provided", () => {
    renderDialog();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("uses custom confirmLabel and cancelLabel", () => {
    renderDialog({ confirmLabel: "Clear", cancelLabel: "Never mind" });
    expect(screen.getByRole("button", { name: "Clear" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Never mind" })).toBeTruthy();
  });
});
