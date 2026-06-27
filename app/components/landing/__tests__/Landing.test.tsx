import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Landing } from "../Landing";

beforeEach(() => {
  // jsdom lacks these; the mount effect probes both.
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  class IO {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  vi.stubGlobal("IntersectionObserver", IO as never);
});

afterEach(() => vi.unstubAllGlobals());

describe("Landing", () => {
  it("renders the hero thesis and the three capture sources", () => {
    render(<Landing />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/ta-da/i);
    expect(screen.getByText("Email")).toBeInTheDocument();
    expect(screen.getByText("Screenshots")).toBeInTheDocument();
    expect(screen.getByText("Quick add")).toBeInTheDocument();
  });

  it("renders the Todoist differentiation (vs) and the how-it-works beats", () => {
    render(<Landing />);
    expect(screen.getByText(/a normal to-do app/i)).toBeInTheDocument();
    expect(screen.getByText(/01 — Capture/i)).toBeInTheDocument();
    expect(screen.getByText(/03 — Ta-da/i)).toBeInTheDocument();
  });

  it("mounts the waitlist form and points the nav CTA at it", () => {
    render(<Landing />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    const cta = screen.getAllByRole("link", { name: /join the waitlist/i })[0];
    expect(cta).toHaveAttribute("href", "#waitlist");
  });
});
