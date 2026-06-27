import { afterEach, describe, expect, it, vi } from "vitest";
import { captureImageFile, captureText } from "../capture";

afterEach(() => vi.restoreAllMocks());

function okFetch(body: unknown) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => ({
    ok: true,
    status: 201,
    json: async () => body,
  }));
  globalThis.fetch = fn as never;
  return fn;
}

describe("captureImageFile", () => {
  it("base64-encodes a small image and POSTs it to /api/capture", async () => {
    const fetchMock = okFetch({ capture: { id: "c1" }, todos: [{ id: "t1" }] });
    const file = new File([new Uint8Array([1, 2, 3])], "shot.png", {
      type: "image/png",
    });
    const out = await captureImageFile(file);
    expect(out.capture.id).toBe("c1");
    expect(out.todos).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/capture");
    const sent = JSON.parse(init!.body as string);
    expect(sent.kind).toBe("image");
    expect(sent.image.mimeType).toBe("image/png");
    expect(sent.image.base64).toBe("AQID"); // base64 of [1,2,3]
  });

  it("throws on a non-ok capture response", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 402 })) as never;
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" });
    await expect(captureImageFile(file)).rejects.toThrow();
  });
});

describe("captureText", () => {
  it("POSTs text to /api/capture", async () => {
    const fetchMock = okFetch({ capture: { id: "c2" }, todos: [{ id: "t2" }] });
    const out = await captureText("Plan offsite");
    expect(out.todos[0].id).toBe("t2");
    const sent = JSON.parse(fetchMock.mock.calls[0]![1]!.body as string);
    expect(sent).toEqual({ kind: "text", text: "Plan offsite" });
  });
});
