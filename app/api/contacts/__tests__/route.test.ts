// @vitest-environment node
// T3.1a — contacts routes for the meeting-offer disambiguation UI.
// POST /api/contacts/search { query } -> { candidates }
// POST /api/contacts/resolve { names } -> { attendees }  (bulk name->Attendee)
// currentUser + the contacts lib mocked. Read-only, no metering.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ currentUser: vi.fn() }));
vi.mock("@/lib/contacts", () => ({
  contactResolverFor: vi.fn(),
  resolveAttendees: vi.fn(),
}));

import { currentUser } from "@/lib/auth";
import { contactResolverFor, resolveAttendees } from "@/lib/contacts";
import { POST as search } from "@/app/api/contacts/search/route";
import { POST as resolve } from "@/app/api/contacts/resolve/route";

const mockUser = currentUser as unknown as ReturnType<typeof vi.fn>;
const user = { userId: "u1", email: "u1@t.local", plan: "unlimited" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue(user);
});

const post = (handler: (r: Request) => Promise<Response>, url: string, body: unknown) =>
  handler(new Request(url, { method: "POST", body: JSON.stringify(body) }));

describe("POST /api/contacts/search", () => {
  it("returns ranked candidates for a query", async () => {
    (contactResolverFor as ReturnType<typeof vi.fn>).mockReturnValue({
      resolve: vi.fn(async () => [{ name: "Dakota Lee", email: "dakota@x.com" }]),
    });
    const res = await post(search, "http://localhost/api/contacts/search", { query: "dakota" });
    expect(res.status).toBe(200);
    expect((await res.json()).candidates[0].email).toBe("dakota@x.com");
    expect(contactResolverFor).toHaveBeenCalledWith(user);
  });

  it("400s a missing query", async () => {
    const res = await post(search, "http://localhost/api/contacts/search", {});
    expect(res.status).toBe(400);
  });

  it("401s when unauthenticated", async () => {
    mockUser.mockRejectedValue(new Error("unauthorized"));
    const res = await post(search, "http://localhost/api/contacts/search", { query: "x" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/contacts/resolve", () => {
  it("bulk-resolves extracted names into the Attendee flow", async () => {
    (resolveAttendees as ReturnType<typeof vi.fn>).mockResolvedValue([
      { name: "Dakota Lee", email: "dakota@x.com", status: "resolved" },
      { name: "Sam", status: "unresolved", candidates: [{ name: "Sam A", email: "a@x.com" }] },
    ]);
    const res = await post(resolve, "http://localhost/api/contacts/resolve", { names: ["Dakota", "Sam"] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.attendees).toHaveLength(2);
    expect(body.attendees[1].status).toBe("unresolved");
    expect(resolveAttendees).toHaveBeenCalled();
  });

  it("400s when names is not an array", async () => {
    const res = await post(resolve, "http://localhost/api/contacts/resolve", { names: "nope" });
    expect(res.status).toBe(400);
  });
});
