// @vitest-environment node
// T3.1a — contact resolution. GoogleContactResolver hits People API
// people:searchContacts (access token + fetch mocked); maps results to ranked
// ContactCandidate[], skips entries without an email. resolveAttendees turns raw
// extracted names into the Attendee disambiguation flow (resolved vs unresolved).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/google", () => ({ getGoogleAccessToken: vi.fn() }));

import { getGoogleAccessToken } from "@/lib/google";
import { contactResolverFor, resolveAttendees } from "@/lib/contacts";
import type { UserCtx } from "@/lib/contracts";

const mockToken = getGoogleAccessToken as unknown as ReturnType<typeof vi.fn>;
const user: UserCtx = { userId: "u1", email: "u1@t.local", plan: "unlimited", googleRefreshToken: "r" };

const peopleResult = (over: Record<string, unknown>) => ({
  person: {
    names: [{ displayName: over.name ?? "Person" }],
    emailAddresses: over.email === null ? [] : [{ value: over.email ?? "p@x.com" }],
    organizations: over.org ? [{ name: over.org }] : [],
    photos: over.photo ? [{ url: over.photo }] : [],
  },
});

beforeEach(() => {
  vi.clearAllMocks();
  mockToken.mockResolvedValue("at-123");
});

describe("contactResolverFor.resolve", () => {
  it("maps People API results to candidates and skips entries without an email", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            results: [
              peopleResult({ name: "Dakota Lee", email: "dakota@x.com", org: "Acme" }),
              peopleResult({ name: "No Email", email: null }),
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const out = await contactResolverFor(user).resolve("dakota");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Dakota Lee", email: "dakota@x.com", org: "Acme" });
    vi.unstubAllGlobals();
  });

  it("ranks an exact name match above partial matches", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            results: [
              peopleResult({ name: "Dakota Smith", email: "ds@x.com" }),
              peopleResult({ name: "Dakota", email: "exact@x.com" }),
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const out = await contactResolverFor(user).resolve("Dakota");
    expect(out[0].email).toBe("exact@x.com"); // exact match first
    vi.unstubAllGlobals();
  });

  it("returns [] for a blank query without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await contactResolverFor(user).resolve("  ")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("returns [] when the user has no Google connection", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const out = await contactResolverFor({ ...user, googleRefreshToken: undefined }).resolve("dakota");
    expect(out).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("gracefully degrades when otherContacts:search returns 403 and still returns saved-contacts results", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if ((url as string).includes("otherContacts")) {
          return new Response(null, { status: 403 });
        }
        return new Response(
          JSON.stringify({
            results: [
              peopleResult({ name: "Dakota Lee", email: "dakota@x.com", org: "Acme" }),
            ],
          }),
          { status: 200 },
        );
      }),
    );

    const out = await contactResolverFor(user).resolve("dakota");
    // saved-contacts result still surfaced despite otherContacts 403
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Dakota Lee", email: "dakota@x.com" });
    // 403 must be surfaced as a warning (not swallowed silently)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("403"));
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Google scope"));

    vi.unstubAllGlobals();
    warnSpy.mockRestore();
  });
});

describe("resolveAttendees", () => {
  const resolver = (byName: Record<string, { name: string; email: string }[]>) => ({
    resolve: vi.fn(async (q: string) => byName[q] ?? []),
  });

  it("passes through an attendee that is already an email", async () => {
    const r = resolver({});
    const out = await resolveAttendees(r, ["d@x.com"]);
    expect(out[0]).toMatchObject({ email: "d@x.com", status: "resolved" });
    expect(r.resolve).not.toHaveBeenCalled();
  });

  it("auto-resolves a name with a single candidate", async () => {
    const r = resolver({ Dakota: [{ name: "Dakota Lee", email: "dakota@x.com" }] });
    const out = await resolveAttendees(r, ["Dakota"]);
    expect(out[0]).toMatchObject({ email: "dakota@x.com", status: "resolved" });
  });

  it("leaves a name unresolved (with candidates) when ambiguous", async () => {
    const r = resolver({
      Sam: [
        { name: "Sam A", email: "a@x.com" },
        { name: "Sam B", email: "b@x.com" },
      ],
    });
    const out = await resolveAttendees(r, ["Sam"]);
    expect(out[0].status).toBe("unresolved");
    expect(out[0].candidates).toHaveLength(2);
  });

  it("leaves a name unresolved with no candidates when nothing matches", async () => {
    const out = await resolveAttendees(resolver({}), ["Ghost"]);
    expect(out[0]).toMatchObject({ name: "Ghost", status: "unresolved" });
    expect(out[0].candidates ?? []).toHaveLength(0);
  });
});
