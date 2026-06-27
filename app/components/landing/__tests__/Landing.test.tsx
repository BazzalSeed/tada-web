import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

const signIn = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

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

afterEach(() => {
  vi.unstubAllGlobals();
  signIn.mockClear();
});

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

  it("mounts the waitlist form in the closing section", () => {
    render(<Landing />);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
  });

  it("top-right Log in triggers Google sign-in and lands on /app (T4.2)", () => {
    render(<Landing />);
    const login = screen.getByRole("button", { name: /log in/i });
    fireEvent.click(login);
    expect(signIn).toHaveBeenCalledWith("google", { redirectTo: "/app" });
  });

  it("keeps Join the waitlist as a separate CTA (not the top-right login)", () => {
    render(<Landing />);
    // the waitlist join lives on its own submit, distinct from Log in
    expect(
      screen.getByRole("button", { name: /join the waitlist/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /log in/i })).toBeInTheDocument();
  });
});
