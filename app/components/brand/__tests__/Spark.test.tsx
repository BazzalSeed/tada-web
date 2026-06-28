import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Spark } from "../Spark";

describe("Spark", () => {
  it("renders an svg sized by the size prop", () => {
    const { container } = render(<Spark size={20} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("width", "20");
  });
});
