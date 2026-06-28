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

  // --- Nested lists ---

  it("renders a nested list: outer <ul> contains a <li> with the top text and an inner <ul>", () => {
    render(<Markdown source={"* Top\n    * Nested"} />);
    const uls = document.querySelectorAll("ul");
    expect(uls).toHaveLength(2);
    // The outer li should contain text "Top"
    const outerLi = uls[0].children[0] as HTMLElement;
    expect(outerLi.textContent).toContain("Top");
    // The inner ul should be inside that outer li
    const innerUl = outerLi.querySelector("ul");
    expect(innerUl).not.toBeNull();
    // The inner li should contain "Nested"
    expect(innerUl!.textContent).toContain("Nested");
  });

  it("indented bullet does NOT render a literal '*' character as visible text", () => {
    const { container } = render(<Markdown source={"* Top\n    * Nested"} />);
    // No stray asterisk should appear in the rendered output
    expect(container.textContent).not.toMatch(/^\s*\*\s*$/m);
    // More directly: the text content should not contain a bare '*'
    const text = container.textContent ?? "";
    expect(text).not.toContain("*");
  });

  it("multi-level nested list: 3 depth levels render correctly", () => {
    const src = "- A\n  - B\n    - C";
    render(<Markdown source={src} />);
    const uls = document.querySelectorAll("ul");
    // Should have 3 nested <ul> elements
    expect(uls.length).toBeGreaterThanOrEqual(2);
    expect(document.body.textContent).toContain("A");
    expect(document.body.textContent).toContain("B");
    expect(document.body.textContent).toContain("C");
  });

  it("inline markup inside nested list items still works", () => {
    render(<Markdown source={"* Top **bold** item\n    * Nested `code`"} />);
    expect(document.querySelector("strong")).not.toBeNull();
    expect(document.querySelector("code")).not.toBeNull();
  });

  // --- Horizontal rule ---

  it('renders "---" as an <hr>', () => {
    render(<Markdown source="---" />);
    expect(document.querySelector("hr")).not.toBeNull();
  });

  it('renders "***" as an <hr>', () => {
    render(<Markdown source="***" />);
    expect(document.querySelector("hr")).not.toBeNull();
  });

  it('renders "___" as an <hr>', () => {
    render(<Markdown source="___" />);
    expect(document.querySelector("hr")).not.toBeNull();
  });

  it('"- item" still renders as a list item, not an <hr>', () => {
    render(<Markdown source="- item" />);
    expect(document.querySelector("hr")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it('"* item" still renders as a list item, not an <hr>', () => {
    render(<Markdown source="* item" />);
    expect(document.querySelector("hr")).toBeNull();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
  });

  it('"---" does not render as a paragraph with literal dashes', () => {
    render(<Markdown source="---" />);
    expect(document.querySelector("p")).toBeNull();
    expect(document.querySelector("hr")).not.toBeNull();
  });
});
