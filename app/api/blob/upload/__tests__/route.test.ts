// @vitest-environment node
// T2.3 — signed direct-to-Blob upload route. `handleUpload` from @vercel/blob/client
// is mocked; we drive its onBeforeGenerateToken to assert our authorization
// (currentUser) + image constraints, and the 401 path. Live upload is covered by
// a gated test once BLOB_READ_WRITE_TOKEN is provisioned.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vercel/blob/client", () => ({ handleUpload: vi.fn() }));
vi.mock("@/lib/auth", () => ({ currentUser: vi.fn() }));

import { handleUpload } from "@vercel/blob/client";
import { currentUser } from "@/lib/auth";
import { POST as upload } from "@/app/api/blob/upload/route";

const mockHandle = handleUpload as unknown as ReturnType<typeof vi.fn>;
const mockUser = currentUser as unknown as ReturnType<typeof vi.fn>;

const post = () =>
  upload(
    new Request("http://localhost/api/blob/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "blob.generate-client-token", payload: {} }),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue({ userId: "u1", email: "u1@t.local", plan: "free" });
});

describe("POST /api/blob/upload", () => {
  it("authorizes via currentUser and restricts to images with a size cap", async () => {
    let tokenConfig: Record<string, unknown> | undefined;
    mockHandle.mockImplementation(async ({ onBeforeGenerateToken }) => {
      tokenConfig = await onBeforeGenerateToken("captures/shot.png", null, false);
      return { ok: true };
    });

    const res = await post();
    expect(res.status).toBe(200);
    expect(mockUser).toHaveBeenCalled();
    expect(tokenConfig).toBeTruthy();
    expect(tokenConfig!.allowedContentTypes).toContain("image/png");
    expect(typeof tokenConfig!.maximumSizeInBytes).toBe("number");
    // tokenPayload carries the owner so onUploadCompleted can attribute the blob
    expect(JSON.parse(tokenConfig!.tokenPayload as string).userId).toBe("u1");
  });

  it("returns 401 when the uploader is unauthenticated", async () => {
    mockHandle.mockImplementation(async ({ onBeforeGenerateToken }) => {
      // handleUpload invokes the gate; an unauthenticated user makes it throw.
      await onBeforeGenerateToken("captures/shot.png", null, false);
      return {};
    });
    mockUser.mockRejectedValue(new Error("unauthorized"));
    const res = await post();
    expect(res.status).toBe(401);
  });
});
