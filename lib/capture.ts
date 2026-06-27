// ============================================================================
// T2.2 — capture pipeline (the capture-first spine, shared by all sources:
// screenshot / manual text / forwarded email). Persists a Capture + a plain Todo
// BEFORE extraction so a failed extraction still leaves a usable todo. Extraction
// runs under withQuota(extractTodos); its first result enriches the plain todo in
// place, the rest become new todos; dedupe drops duplicateOf matches.
// ============================================================================

import { put } from "@vercel/blob";
import { store as defaultStore } from "./store";
import { extractor as defaultExtractor } from "./extractor";
import { withQuota } from "./quota";
import type {
  Capture,
  CaptureKind,
  ExtractedTodo,
  ExtractorClient,
  ExtractorInput,
  TadaStore,
  Todo,
  UserCtx,
} from "./contracts";

// Request shape accepted by the capture route + inbound-email handler.
export interface CaptureRequest {
  kind?: CaptureKind;
  text?: string | null;
  note?: string | null;
  image?: { base64: string; mimeType: string } | null;
  blobPath?: string | null;
  email?: ExtractorInput["email"];
}

export interface CaptureResult {
  capture: Capture;
  todos: Todo[];
}

export interface CaptureDeps {
  store?: TadaStore;
  extractor?: ExtractorClient;
  // Server-side Blob upload of inline image bytes → public URL (injectable for tests).
  uploadImage?: (image: { base64: string; mimeType: string }) => Promise<string>;
}

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/heic": "heic",
};

// Default uploader: persist inline image bytes to Vercel Blob so every image
// capture has a durable, reloadable blobPath for its thumbnail — decoupled from
// the inline-base64 bytes handed to Gemini for extraction (latency path).
async function defaultUploadImage(image: { base64: string; mimeType: string }): Promise<string> {
  const ext = MIME_EXT[image.mimeType] ?? "png";
  const { url } = await put(`captures/${crypto.randomUUID()}.${ext}`, Buffer.from(image.base64, "base64"), {
    access: "public",
    contentType: image.mimeType,
  });
  return url;
}

// Resolve the blobPath to persist on the Capture: an already-uploaded blobPath
// (the large-image client path) passes through; an inline image is uploaded here
// so it gets a thumbnail too. Upload failure is non-fatal — capture-first means
// the Capture still persists (without a thumbnail) rather than failing the capture.
async function resolveBlobPath(
  req: CaptureRequest,
  uploadImage: (image: { base64: string; mimeType: string }) => Promise<string>,
): Promise<string | null> {
  if (req.blobPath) return req.blobPath;
  if (!req.image) return null;
  try {
    return await uploadImage(req.image);
  } catch (err) {
    console.error("[capture] blob upload failed (kind=image):", err);
    return null;
  }
}

// Blob-backed images arrive as a `blobPath` URL (from /api/blob/upload). Fetch
// the bytes so the extractor receives an inline image. Returns null on any
// non-image / failure — capture-first means a missed image still leaves a todo.
async function hydrateImage(
  req: CaptureRequest,
): Promise<{ base64: string; mimeType: string } | null> {
  if (req.image) return req.image;
  if (!req.blobPath || !/^https?:\/\//.test(req.blobPath)) return null;
  const res = await fetch(req.blobPath);
  if (!res.ok) return null;
  const mimeType = res.headers.get("content-type") ?? "image/png";
  if (!mimeType.startsWith("image/")) return null;
  const base64 = Buffer.from(await res.arrayBuffer()).toString("base64");
  return { base64, mimeType };
}

function inferKind(req: CaptureRequest): CaptureKind {
  if (req.kind) return req.kind;
  if (req.image) return "image";
  if (req.email) return "email";
  return "text";
}

function plainTitleFor(req: CaptureRequest, kind: CaptureKind): string {
  const t = req.text?.trim() || req.note?.trim() || req.email?.subject?.trim();
  if (t) return t;
  return kind === "image" ? "Screenshot capture" : "New capture";
}

// Native DedupeFilter: drop todos flagged duplicateOf an EXISTING open title.
function dedupe(todos: ExtractedTodo[], openTitles: string[]): ExtractedTodo[] {
  const open = new Set(openTitles);
  return todos.filter((t) => !t.duplicateOf || !open.has(t.duplicateOf));
}

// Resolve an extracted todo's suggested labels (+ suggestedListName folded in,
// since v0 is a flat tagged pool with no list containers) to label ids.
async function resolveLabelIds(
  store: TadaStore,
  userId: string,
  e: ExtractedTodo,
): Promise<string[]> {
  const names = [...(e.suggestedLabels ?? [])];
  if (e.suggestedListName) names.push(e.suggestedListName);
  const ids: string[] = [];
  for (const name of names) {
    const lbl = await store.upsertLabelByName(userId, name);
    ids.push(lbl.id);
  }
  return ids;
}

// Maps an ExtractedTodo → a Todo patch. Action offers are PROPOSED, never
// executed here (never auto-execute a side effect).
async function toTodoPatch(
  store: TadaStore,
  userId: string,
  e: ExtractedTodo,
  sourceCaptureId: string,
): Promise<Partial<Todo>> {
  return {
    sourceCaptureId,
    title: e.title,
    detail: e.detail ?? null,
    actionType: e.actionType,
    actionPayload: e.actionPayload ?? null,
    actionState: e.actionType === "none" ? "none" : "proposed",
    dueAt: e.suggestedDueAt ?? null,
    priority: e.suggestedPriority ?? "none",
    labelIds: await resolveLabelIds(store, userId, e),
    // recurrenceText → RecurrenceRule needs parseQuickAdd (T1.1); applied later.
  };
}

export async function runCapture(
  user: UserCtx,
  req: CaptureRequest,
  deps: CaptureDeps = {},
): Promise<CaptureResult> {
  const store = deps.store ?? defaultStore;
  const extractor = deps.extractor ?? defaultExtractor;
  const uploadImage = deps.uploadImage ?? defaultUploadImage;
  const kind = inferKind(req);

  // 1. CAPTURE-FIRST — persist Capture + a plain Todo before extraction. Every
  //    image capture gets a durable blobPath (inline images uploaded here) so the
  //    thumbnail renders + survives reload, independent of the extraction bytes.
  const blobPath = await resolveBlobPath(req, uploadImage);
  const capture = await store.createCapture(user.userId, {
    kind,
    blobPath,
    note: req.note ?? null,
  });
  const plain = await store.createTodo(user.userId, {
    sourceCaptureId: capture.id,
    title: plainTitleFor(req, kind),
  });

  // 2. Taxonomy for dedupe + auto-organize.
  const [allTodos, labelRows] = await Promise.all([
    store.listTodos(user.userId),
    store.labels(user.userId),
  ]);
  const openTitles = allTodos
    .filter((t) => t.status === "open" && t.id !== plain.id)
    .map((t) => t.title);

  // 3. Extract under quota. A failure (blob fetch / quota / model / transport)
  //    leaves the plain todo standing — capture-first guarantee.
  let fresh: ExtractedTodo[] = [];
  try {
    const image = await hydrateImage(req);
    const input: ExtractorInput = {
      image,
      text: req.text ?? null,
      note: req.note ?? null,
      email: req.email ?? null,
      existingOpenTitles: openTitles,
      existingLists: [],
      existingLabels: labelRows.map((l) => l.name),
    };
    const out = await withQuota(user, "extractTodos", () =>
      extractor.extract(input),
    );
    fresh = dedupe(out.todos, openTitles);
  } catch (err) {
    // Capture-first already persisted the plain todo, so the user is covered —
    // but log so extraction reliability stays observable (quota 402 included).
    console.error(
      `[capture] extraction failed for capture ${capture.id} (kind=${kind}):`,
      err,
    );
    fresh = [];
  }

  if (fresh.length === 0) {
    return { capture, todos: [plain] };
  }

  // 4. First result enriches the plain todo in place; the rest become new todos.
  const [first, ...rest] = fresh;
  const enriched = await store.updateTodo(
    user.userId,
    plain.id,
    await toTodoPatch(store, user.userId, first, capture.id),
  );
  const extras: Todo[] = [];
  for (const e of rest) {
    extras.push(
      await store.createTodo(
        user.userId,
        await toTodoPatch(store, user.userId, e, capture.id),
      ),
    );
  }

  return { capture, todos: [enriched, ...extras] };
}
