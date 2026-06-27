import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { SuggestionCards } from "../SuggestionCards";

describe("SuggestionCards", () => {
  it("renders the starter prompts", () => {
    render(<SuggestionCards onPick={vi.fn()} />);
    expect(screen.getByRole("button", { name: /what's due today/i })).toBeInTheDocument();
    expect(screen.getAllByRole("button").length).toBeGreaterThanOrEqual(3);
  });

  it("emits the prompt text when a card is picked", () => {
    const onPick = vi.fn();
    render(<SuggestionCards onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: /what's due today/i }));
    expect(onPick).toHaveBeenCalledWith(expect.stringMatching(/due today/i));
  });
});
