// @vitest-environment node
// T2.2 — capture pipeline unit tests. Store + extractor are injected mocks; the
// user is `unlimited` so withQuota short-circuits (no DB). Asserts the
// capture-first invariant, graceful failed-extraction, in-place enrichment of
// the plain todo, and dedupe.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { commitCapture, proposeCapture, runCapture } from "@/lib/capture";
import { HttpError } from "@/lib/http";
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
    getCapture: vi.fn(async (_u, id: string) =>
      id === "cap1"
        ? ({ id: "cap1", createdAt: "now", kind: "image", blobPath: null, note: null } as Capture)
        : null,
    ),
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

// Helper: build a fake ExtractorClient that resolves with a fixed todo list.
function fakeExtractor(todos: { title: string; suggestedLabels?: string[] }[]): ExtractorClient {
  return {
    extract: vi.fn(async (): Promise<ExtractorOutput> => ({
      todos: todos.map((t) => ({ title: t.title, actionType: "none", suggestedLabels: t.suggestedLabels })),
    })),
  };
}

describe("proposeCapture", () => {
  it("persists a Capture and returns proposals WITHOUT creating todos", async () => {
    const extractor = fakeExtractor([
      { title: "Email Dakota", suggestedLabels: ["work"] },
      { title: "Book room" },
    ]);
    const res = await proposeCapture(user, { text: "email dakota then book a room" }, { store, extractor });
    expect(res.capture.id).toBeTruthy();
    expect(res.proposals.map((p) => p.title)).toEqual(["Email Dakota", "Book room"]);
    expect(res.failed).toBe(false);
    // capture row persisted
    expect(store.createCapture).toHaveBeenCalledTimes(1);
    // no todo rows created at all
    expect(store.createTodo).not.toHaveBeenCalled();
    expect(store.updateTodo).not.toHaveBeenCalled();
  });

  it("marks failed=true (not throw) when extraction returns nothing", async () => {
    const res = await proposeCapture(user, { text: "??" }, { store, extractor: fakeExtractor([]) });
    expect(res.failed).toBe(true);
    expect(res.proposals).toEqual([]);
    // capture still persisted even on empty extraction
    expect(store.createCapture).toHaveBeenCalledTimes(1);
    expect(store.createTodo).not.toHaveBeenCalled();
  });

  it("marks failed=true (not throw) when extractor throws", async () => {
    const extractor: ExtractorClient = {
      extract: vi.fn(async (): Promise<ExtractorOutput> => { throw new Error("gemini down"); }),
    };
    const res = await proposeCapture(user, { text: "call mom" }, { store, extractor });
    expect(res.failed).toBe(true);
    expect(res.proposals).toEqual([]);
    expect(res.capture.id).toBeTruthy();
    expect(store.createTodo).not.toHaveBeenCalled();
  });

  it("dedupes proposals against existing open todos", async () => {
    store.listTodos = vi.fn(async () => [{ id: "x", title: "buy milk", status: "open" } as Todo]);
    const extractor: ExtractorClient = {
      extract: vi.fn(async (): Promise<ExtractorOutput> => ({
        todos: [
          { title: "buy milk", actionType: "none", duplicateOf: "buy milk" },
          { title: "fresh item", actionType: "none" },
        ],
      })),
    };
    const res = await proposeCapture(user, { text: "groceries" }, { store, extractor });
    expect(res.proposals.map((p) => p.title)).toEqual(["fresh item"]);
    expect(res.failed).toBe(false);
    expect(store.createTodo).not.toHaveBeenCalled();
  });
});

describe("commitCapture", () => {
  it("creates one Todo per approved proposal, each linked to the capture", async () => {
    const { todos } = await commitCapture(user, {
      captureId: "cap1",
      todos: [
        { title: "Email Dakota", actionType: "none", suggestedLabels: ["work"] },
        { title: "Book room", actionType: "none" },
      ],
    }, { store });
    expect(todos.map((t) => t.title)).toEqual(["Email Dakota", "Book room"]);
    expect(todos.every((t) => t.sourceCaptureId === "cap1")).toBe(true);
    expect(store.createTodo).toHaveBeenCalledTimes(2);
  });

  it("throws HttpError(404) when the capture isn't found for this user", async () => {
    await expect(
      commitCapture(user, { captureId: "missing", todos: [{ title: "x", actionType: "none" }] }, { store }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      commitCapture(user, { captureId: "missing", todos: [{ title: "x", actionType: "none" }] }, { store }),
    ).rejects.toBeInstanceOf(HttpError);
  });
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

  it("a post-extraction DB fault does NOT throw — falls back to the plain todo", async () => {
    // Extraction succeeds, but persisting the enrichment dies (e.g. a Neon
    // connection dropped mid-request past the retry budget). Capture-first means
    // the request still resolves with the durable plain todo, never a 500.
    store.updateTodo = vi.fn(async () => {
      throw new Error("terminating connection due to administrator command (57P01)");
    });
    const extractor: ExtractorClient = {
      extract: vi.fn(async (): Promise<ExtractorOutput> => ({
        todos: [{ title: "Book dentist", actionType: "none" }],
      })),
    };
    const res = await runCapture(user, { kind: "text", text: "dentist" }, { store, extractor });
    expect(res.todos).toHaveLength(1);
    expect(res.todos[0].title).toBe("dentist"); // the plain todo, unmodified
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
