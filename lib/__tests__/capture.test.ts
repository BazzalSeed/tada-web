// @vitest-environment node
// T2.2 — capture pipeline unit tests. Store + extractor are injected mocks; the
// user is `unlimited` so withQuota short-circuits (no DB). Asserts the
// capture-first invariant, graceful failed-extraction, in-place enrichment of
// the plain todo, and dedupe.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { runCapture } from "@/lib/capture";
import type {
  Capture,
  ExtractorClient,
  ExtractorOutput,
  TadaStore,
  Todo,
  UserCtx,
} from "@/lib/contracts";

const user: UserCtx = { userId: "u1", email: "u1@t.local", plan: "unlimited" };

function makeStore(): TadaStore & { _seq: string[] } {
  const seq: string[] = [];
  let n = 0;
  return {
    _seq: seq,
    createCapture: vi.fn(async (_u, c: Partial<Capture>) => {
      seq.push("createCapture");
      return { id: "cap1", createdAt: "now", kind: c.kind ?? "text", blobPath: c.blobPath ?? null, note: c.note ?? null } as Capture;
    }),
    createTodo: vi.fn(async (_u, t: Partial<Todo>) => {
      seq.push("createTodo");
      return { id: `t${++n}`, ...t } as Todo;
    }),
    updateTodo: vi.fn(async (_u, id: string, patch: Partial<Todo>) => {
      seq.push("updateTodo");
      return { id, ...patch } as Todo;
    }),
    listTodos: vi.fn(async () => []),
    labels: vi.fn(async () => []),
    upsertLabelByName: vi.fn(async (_u, name: string) => ({ id: `lbl-${name}`, name, colorHex: "#c8632e" })),
    reorderTodo: vi.fn(),
    subtasks: vi.fn(async () => []),
    views: vi.fn(async () => []),
    saveView: vi.fn(),
  } as unknown as TadaStore & { _seq: string[] };
}

let store: TadaStore & { _seq: string[] };
beforeEach(() => {
  store = makeStore();
});

describe("runCapture — capture-first invariant", () => {
  it("persists Capture + a plain Todo BEFORE calling extract", async () => {
    const order: string[] = [];
    const extractor: ExtractorClient = {
      extract: vi.fn(async (): Promise<ExtractorOutput> => {
        order.push("extract");
        return { todos: [] };
      }),
    };
    await runCapture(user, { kind: "text", text: "buy milk" }, { store, extractor });
    // capture + plain todo created before extract ran
    const captureIdx = store._seq.indexOf("createCapture");
    const todoIdx = store._seq.indexOf("createTodo");
    expect(captureIdx).toBe(0);
    expect(todoIdx).toBe(1);
    expect(extractor.extract).toHaveBeenCalled();
  });

  it("a failed extraction still leaves the plain todo standing", async () => {
    const extractor: ExtractorClient = {
      extract: vi.fn(async (): Promise<ExtractorOutput> => {
        throw new Error("gemini down");
      }),
    };
    const res = await runCapture(user, { kind: "text", text: "call mom" }, { store, extractor });
    expect(res.todos).toHaveLength(1);
    expect(res.todos[0].title).toBe("call mom");
  });
});

describe("runCapture — extraction results", () => {
  it("enriches the plain todo in place and creates extras; proposes actions", async () => {
    const extractor: ExtractorClient = {
      extract: vi.fn(async (): Promise<ExtractorOutput> => ({
        todos: [
          {
            title: "Meet Dakota",
            actionType: "meeting",
            actionPayload: { kind: "meeting", title: "Sync", durationMin: 30 },
            suggestedLabels: ["work"],
            suggestedPriority: "p1",
          },
          { title: "Email the deck", actionType: "none" },
        ],
      })),
    };
    const res = await runCapture(user, { kind: "image", image: { base64: "QUJD", mimeType: "image/png" } }, { store, extractor });
    // first extracted folds into the plain todo (update, not a 2nd create)
    expect(store.updateTodo).toHaveBeenCalledTimes(1);
    const firstPatch = (store.updateTodo as ReturnType<typeof vi.fn>).mock.calls[0][2];
    expect(firstPatch.title).toBe("Meet Dakota");
    expect(firstPatch.actionState).toBe("proposed");
    expect(firstPatch.priority).toBe("p1");
    expect(firstPatch.labelIds).toEqual(["lbl-work"]);
    // the second extracted becomes a new todo; total returned = 2
    expect(res.todos).toHaveLength(2);
  });

  it("hydrates image bytes from a blobPath URL for extraction", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const extractor: ExtractorClient = {
      extract: vi.fn(async (): Promise<ExtractorOutput> => ({ todos: [] })),
    };
    await runCapture(
      user,
      { kind: "image", blobPath: "https://blob.vercel-storage.com/captures/x.png" },
      { store, extractor },
    );
    expect(fetchMock).toHaveBeenCalledWith("https://blob.vercel-storage.com/captures/x.png");
    const input = (extractor.extract as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(input.image).toBeTruthy();
    expect(input.image.mimeType).toBe("image/png");
    vi.unstubAllGlobals();
  });

  it("uploads an inline image to Blob and persists its blobPath (thumbnail)", async () => {
    const uploadImage = vi.fn(async () => "https://blob.vercel-storage.com/captures/new.png");
    const extractor: ExtractorClient = { extract: vi.fn(async (): Promise<ExtractorOutput> => ({ todos: [] })) };
    const res = await runCapture(
      user,
      { kind: "image", image: { base64: "QUJD", mimeType: "image/png" } },
      { store, extractor, uploadImage },
    );
    expect(uploadImage).toHaveBeenCalledWith({ base64: "QUJD", mimeType: "image/png" });
    expect((store.createCapture as ReturnType<typeof vi.fn>).mock.calls[0][1].blobPath).toBe(
      "https://blob.vercel-storage.com/captures/new.png",
    );
    expect(res.capture.blobPath).toBe("https://blob.vercel-storage.com/captures/new.png");
  });

  it("keeps an already-uploaded blobPath (large-image path) without re-uploading", async () => {
    const uploadImage = vi.fn();
    const extractor: ExtractorClient = { extract: vi.fn(async (): Promise<ExtractorOutput> => ({ todos: [] })) };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new Uint8Array([1]), { headers: { "content-type": "image/png" } })));
    await runCapture(user, { kind: "image", blobPath: "https://blob/existing.png" }, { store, extractor, uploadImage });
    expect(uploadImage).not.toHaveBeenCalled();
    expect((store.createCapture as ReturnType<typeof vi.fn>).mock.calls[0][1].blobPath).toBe("https://blob/existing.png");
    vi.unstubAllGlobals();
  });

  it("a blob-upload failure still persists the capture (capture-first, null blobPath)", async () => {
    const uploadImage = vi.fn(async () => { throw new Error("blob down"); });
    const extractor: ExtractorClient = { extract: vi.fn(async (): Promise<ExtractorOutput> => ({ todos: [] })) };
    const res = await runCapture(
      user,
      { kind: "image", image: { base64: "QUJD", mimeType: "image/png" } },
      { store, extractor, uploadImage },
    );
    expect((store.createCapture as ReturnType<typeof vi.fn>).mock.calls[0][1].blobPath).toBeNull();
    expect(res.todos).toHaveLength(1); // plain todo still stands
  });

  it("text capture persists a null blobPath and never uploads", async () => {
    const uploadImage = vi.fn();
    const extractor: ExtractorClient = { extract: vi.fn(async (): Promise<ExtractorOutput> => ({ todos: [] })) };
    await runCapture(user, { kind: "text", text: "buy milk" }, { store, extractor, uploadImage });
    expect(uploadImage).not.toHaveBeenCalled();
    expect((store.createCapture as ReturnType<typeof vi.fn>).mock.calls[0][1].blobPath).toBeNull();
  });

  it("skips extracted todos flagged duplicateOf an existing open title", async () => {
    store.listTodos = vi.fn(async () => [{ id: "x", title: "buy milk", status: "open" } as Todo]);
    const extractor: ExtractorClient = {
      extract: vi.fn(async (): Promise<ExtractorOutput> => ({
        todos: [{ title: "buy milk", actionType: "none", duplicateOf: "buy milk" }],
      })),
    };
    const res = await runCapture(user, { kind: "text", text: "groceries" }, { store, extractor });
    // dup dropped → only the plain todo remains, untouched (no enrich update)
    expect(store.updateTodo).not.toHaveBeenCalled();
    expect(res.todos).toHaveLength(1);
  });
});
