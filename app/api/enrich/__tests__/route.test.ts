// @vitest-environment node
// T2.5 — POST /api/enrich route. currentUser + runEnrich mocked; asserts auth,
// validation, and the { suggestions } envelope.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ currentUser: vi.fn() }));
vi.mock("@/lib/enrich", () => ({ runEnrich: vi.fn() }));

import { currentUser } from "@/lib/auth";
import { runEnrich } from "@/lib/enrich";
import { POST as enrich } from "@/app/api/enrich/route";

const mockUser = currentUser as unknown as ReturnType<typeof vi.fn>;
const mockRun = runEnrich as unknown as ReturnType<typeof vi.fn>;
const user = { userId: "u1", email: "u1@t.local", plan: "free" as const };

const post = (body: unknown) =>
  enrich(
    new Request("http://localhost/api/enrich", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue(user);
});

describe("POST /api/enrich", () => {
  it("returns { suggestions } for the typed text", async () => {
    mockRun.mockResolvedValue({ suggestions: [{ title: "Call dentist", actionType: "reminder" }] });
    const res = await post({ text: "call dentist tomorrow" });
    expect(res.status).toBe(200);
    expect(mockRun).toHaveBeenCalledWith(user, "call dentist tomorrow");
    expect((await res.json()).suggestions[0].title).toBe("Call dentist");
  });

  it("rejects empty text with 400", async () => {
    const res = await post({ text: "  " });
    expect(res.status).toBe(400);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockUser.mockRejectedValue(new Error("unauthorized"));
    const res = await post({ text: "x" });
    expect(res.status).toBe(401);
  });
});
