// @vitest-environment node
// T2.3 — LIVE Vercel Blob round-trip (put → head → del). Gated behind
// RUN_BLOB_TESTS + BLOB_READ_WRITE_TOKEN so the default suite never needs the
// token. Verifies the token works and an uploaded blobPath resolves.
import { describe, expect, it } from "vitest";
import { put, head, del } from "@vercel/blob";

const RUN = !!process.env.RUN_BLOB_TESTS && !!process.env.BLOB_READ_WRITE_TOKEN;

describe.skipIf(!RUN)("Vercel Blob (live)", () => {
  it("uploads an image and the blobPath resolves, then deletes it", async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    const { url, pathname } = await put(`captures/test-${Date.now()}.png`, bytes, {
      access: "public",
      contentType: "image/png",
      addRandomSuffix: true,
    });
    expect(url).toMatch(/^https?:\/\//);
    expect(pathname).toContain("captures/");

    const meta = await head(url);
    expect(meta.size).toBe(bytes.byteLength);
    expect(meta.contentType).toBe("image/png");

    await del(url);
  }, 30_000);
});
