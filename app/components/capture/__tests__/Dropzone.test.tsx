import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Dropzone } from "../Dropzone";

function imageFile() {
  return new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
}

describe("Dropzone", () => {
  it("renders its children", () => {
    render(
      <Dropzone onFiles={vi.fn()}>
        <div data-testid="kids">content</div>
      </Dropzone>,
    );
    expect(screen.getByTestId("kids")).toBeInTheDocument();
  });

  it("emits dropped image files", () => {
    const onFiles = vi.fn();
    render(
      <Dropzone onFiles={onFiles}>
        <div>content</div>
      </Dropzone>,
    );
    const file = imageFile();
    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [file], items: [] },
    });
    expect(onFiles).toHaveBeenCalledWith([file]);
  });

  it("shows a drag overlay while dragging over and clears on leave", () => {
    render(
      <Dropzone onFiles={vi.fn()}>
        <div>content</div>
      </Dropzone>,
    );
    const zone = screen.getByTestId("dropzone");
    expect(zone).toHaveAttribute("data-dragging", "false");
    fireEvent.dragOver(zone, { dataTransfer: { types: ["Files"] } });
    expect(zone).toHaveAttribute("data-dragging", "true");
    fireEvent.dragLeave(zone);
    expect(zone).toHaveAttribute("data-dragging", "false");
  });

  it("ignores an in-app element drag (todo-row reorder) — no capture overlay (FIX6)", () => {
    render(
      <Dropzone onFiles={vi.fn()}>
        <div>content</div>
      </Dropzone>,
    );
    const zone = screen.getByTestId("dropzone");
    // an element drag carries text/* types, never "Files"
    fireEvent.dragEnter(zone, { dataTransfer: { types: ["text/plain"] } });
    fireEvent.dragOver(zone, { dataTransfer: { types: ["text/plain"] } });
    // the capture overlay must NOT activate during a row reorder
    expect(zone).toHaveAttribute("data-dragging", "false");
  });

  it("does not emit when a drop has no image", () => {
    const onFiles = vi.fn();
    render(
      <Dropzone onFiles={onFiles}>
        <div>content</div>
      </Dropzone>,
    );
    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: {
        files: [new File(["x"], "a.txt", { type: "text/plain" })],
        items: [],
      },
    });
    expect(onFiles).not.toHaveBeenCalled();
  });


});
