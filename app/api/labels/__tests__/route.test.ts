// @vitest-environment node
// T1.2b — labels routes. currentUser + store mocked; asserts list/upsert
// envelopes, name validation, and auth. Store is integration-tested elsewhere.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ currentUser: vi.fn() }));
vi.mock("@/lib/store", () => ({
  store: { labels: vi.fn(), upsertLabelByName: vi.fn() },
}));

import { currentUser } from "@/lib/auth";
import { store } from "@/lib/store";
import { GET as listLabels, POST as upsertLabel } from "@/app/api/labels/route";

const mockUser = currentUser as unknown as ReturnType<typeof vi.fn>;
const user = { userId: "u1", email: "u1@t.local", plan: "free" as const };

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue(user);
});

describe("GET /api/labels", () => {
  it("returns the owner's labels in a { labels } envelope", async () => {
    (store.labels as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "l1", name: "work", colorHex: "#c8632e" },
    ]);
    const res = await listLabels(new Request("http://localhost/api/labels"));
    expect(res.status).toBe(200);
    expect(store.labels).toHaveBeenCalledWith("u1");
    expect((await res.json()).labels[0].name).toBe("work");
  });

  it("returns 401 when unauthenticated", async () => {
    mockUser.mockRejectedValue(new Error("unauthorized"));
    const res = await listLabels(new Request("http://localhost/api/labels"));
    expect(res.status).toBe(401);
  });
});

const post = (body: unknown) =>
  upsertLabel(
    new Request("http://localhost/api/labels", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/labels", () => {
  it("upserts by name and returns { label }", async () => {
    (store.upsertLabelByName as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "l1",
      name: "errand",
      colorHex: "#c8632e",
    });
    const res = await post({ name: "Errand" });
    expect(res.status).toBe(200);
    expect(store.upsertLabelByName).toHaveBeenCalledWith("u1", "Errand");
    expect((await res.json()).label.id).toBe("l1");
  });

  it("rejects an empty name with 400", async () => {
    const res = await post({ name: "  " });
    expect(res.status).toBe(400);
    expect(store.upsertLabelByName).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockUser.mockRejectedValue(new Error("unauthorized"));
    const res = await post({ name: "x" });
    expect(res.status).toBe(401);
  });
});
