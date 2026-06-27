import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CaptureThumbnail } from "../CaptureThumbnail";

describe("CaptureThumbnail", () => {
  it("renders an image from the blob path", () => {
    render(<CaptureThumbnail src="https://blob/x.png" alt="capture" />);
    const img = screen.getByRole("img", { name: /capture/i });
    expect(img).toHaveAttribute("src", "https://blob/x.png");
  });

  it("renders nothing without a src", () => {
    const { container } = render(<CaptureThumbnail src={null} alt="x" />);
    expect(container).toBeEmptyDOMElement();
  });
});
