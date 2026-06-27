// @vitest-environment node
// T3.6b — GET /api/captures. Backs thumbnail hydration on load (frontend's
// DataBootstrap fetches it → capturesById). Ownership-scoped via currentUser;
// returns { captures: Capture[] } (id + blobPath + kind + note + createdAt).
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ currentUser: vi.fn() }));
vi.mock("@/lib/store", () => ({ store: { listCaptures: vi.fn() } }));

import { currentUser } from "@/lib/auth";
import { store } from "@/lib/store";
import { GET as captures } from "@/app/api/captures/route";

const mockUser = currentUser as unknown as ReturnType<typeof vi.fn>;
const mockList = store.listCaptures as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue({ userId: "u1", email: "u1@t.local", plan: "unlimited" });
});

describe("GET /api/captures", () => {
  it("returns the user's captures (id + blobPath)", async () => {
    mockList.mockResolvedValue([
      { id: "c1", kind: "image", blobPath: "https://blob/x.png", createdAt: "2026-06-26T00:00:00Z" },
    ]);
    const res = await captures(new Request("http://localhost/api/captures"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(store.listCaptures).toHaveBeenCalledWith("u1");
    expect(body.captures[0].blobPath).toBe("https://blob/x.png");
  });

  it("401s when unauthenticated", async () => {
    mockUser.mockRejectedValue(new Error("unauthorized"));
    const res = await captures(new Request("http://localhost/api/captures"));
    expect(res.status).toBe(401);
    expect(store.listCaptures).not.toHaveBeenCalled();
  });
});
