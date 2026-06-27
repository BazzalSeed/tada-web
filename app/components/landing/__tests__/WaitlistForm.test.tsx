import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { WaitlistForm } from "../WaitlistForm";

afterEach(() => vi.restoreAllMocks());

function okFetch(body: unknown = { ok: true, alreadyJoined: false }) {
  const fn = vi.fn(async () => ({ ok: true, json: async () => body }));
  globalThis.fetch = fn as never;
  return fn as unknown as ReturnType<typeof vi.fn>;
}

describe("WaitlistForm", () => {
  it("rejects an invalid email without calling the API", () => {
    const fetchMock = okFetch();
    render(<WaitlistForm />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByRole("button", { name: /join the waitlist/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText(/valid email/i)).toBeInTheDocument();
  });

  it("POSTs a valid email to /api/waitlist and shows the success state", async () => {
    const fetchMock = okFetch();
    render(<WaitlistForm />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "seedzpy@gmail.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /join the waitlist/i }));
    await waitFor(() =>
      expect(screen.getByText(/you're on the list/i)).toBeInTheDocument(),
    );
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/waitlist");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ email: "seedzpy@gmail.com" });
    // the form is replaced by the confirmation — no more submit button
    expect(
      screen.queryByRole("button", { name: /join the waitlist/i }),
    ).toBeNull();
  });

  it("normalizes the email (trim + lowercase) before sending", async () => {
    const fetchMock = okFetch();
    render(<WaitlistForm />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "  SEEDZpy@Gmail.com  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /join the waitlist/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      email: "seedzpy@gmail.com",
    });
  });

  it("recovers on a failed request (re-enables, shows a retry hint)", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })) as never;
    render(<WaitlistForm />);
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "seedzpy@gmail.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /join the waitlist/i }));
    await waitFor(() =>
      expect(screen.getByText(/didn't go through|try again/i)).toBeInTheDocument(),
    );
    // still usable
    expect(
      screen.getByRole("button", { name: /join the waitlist/i }),
    ).toBeEnabled();
  });
});
