import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Markdown } from "../markdown";

describe("Markdown (minimal renderer)", () => {
  it("renders inline bold", () => {
    render(<Markdown source="Send the **Q3** deck" />);
    expect(screen.getByText("Q3").tagName).toBe("STRONG");
  });

  it("renders headings — # → H1", () => {
    render(<Markdown source="# Findings" />);
    const h = screen.getByText("Findings");
    expect(h.tagName).toBe("H1");
  });

  it("renders headings — #### → H4", () => {
    render(<Markdown source="#### Foo" />);
    const h = screen.getByText("Foo");
    expect(h.tagName).toBe("H4");
  });

  it("renders headings — ###### → H6", () => {
    render(<Markdown source="###### Small" />);
    const h = screen.getByText("Small");
    expect(h.tagName).toBe("H6");
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

  it("renders inline code as <code>", () => {
    render(<Markdown source="Use `npm install` to start" />);
    const code = screen.getByText("npm install");
    expect(code.tagName).toBe("CODE");
  });

  it("renders inline code without parsing bold/links inside", () => {
    render(<Markdown source="Try `**not bold**`" />);
    const code = screen.getByText("**not bold**");
    expect(code.tagName).toBe("CODE");
  });

  it("renders a fenced code block as <pre><code>", () => {
    const src = "```\nconst x = 1;\nconst y = 2;\n```";
    render(<Markdown source={src} />);
    const pre = document.querySelector("pre");
    expect(pre).not.toBeNull();
    expect(pre!.querySelector("code")).not.toBeNull();
    expect(pre!.textContent).toContain("const x = 1;");
    expect(pre!.textContent).toContain("const y = 2;");
  });

  it("renders a blockquote for > lines", () => {
    render(<Markdown source="> This is a quote" />);
    const bq = document.querySelector("blockquote");
    expect(bq).not.toBeNull();
    expect(bq!.textContent).toContain("This is a quote");
  });

  it("inline-parses text inside a blockquote", () => {
    render(<Markdown source="> See **this**" />);
    const strong = screen.getByText("this");
    expect(strong.tagName).toBe("STRONG");
    expect(strong.closest("blockquote")).not.toBeNull();
  });
});
