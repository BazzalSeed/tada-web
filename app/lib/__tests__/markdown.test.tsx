import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Markdown } from "../markdown";

describe("Markdown (minimal renderer)", () => {
  it("renders inline bold", () => {
    render(<Markdown source="Send the **Q3** deck" />);
    expect(screen.getByText("Q3").tagName).toBe("STRONG");
  });

  it("renders headings", () => {
    render(<Markdown source="# Findings" />);
    const h = screen.getByText("Findings");
    expect(h.tagName).toBe("H3");
  });

  it("renders unordered lists", () => {
    render(<Markdown source={"- one\n- two"} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders paragraphs for plain lines", () => {
    render(<Markdown source={"hello world"} />);
    expect(screen.getByText("hello world").tagName).toBe("P");
  });
});
