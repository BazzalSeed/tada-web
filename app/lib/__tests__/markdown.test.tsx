import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("renders a todo: link as a button that opens the target todo", () => {
    const onTodoLink = vi.fn();
    render(
      <Markdown source="Prep done [→ full report](todo:sub_123)" onTodoLink={onTodoLink} />,
    );
    const link = screen.getByRole("button", { name: "→ full report" });
    fireEvent.click(link);
    expect(onTodoLink).toHaveBeenCalledWith("sub_123");
  });

  it("renders an http link as an anchor", () => {
    render(<Markdown source="see [docs](https://example.com)" />);
    const a = screen.getByText("docs");
    expect(a.tagName).toBe("A");
    expect(a).toHaveAttribute("href", "https://example.com");
  });
});
