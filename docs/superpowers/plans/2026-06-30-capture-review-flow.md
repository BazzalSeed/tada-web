# Capture Review & Approve Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the hero capture (screenshot/image + long typed text) into a **review-and-approve** flow: capture → optional describe → **Extract** → edit/approve the proposed 1+ todos → create. Nothing is created until the user approves.

**Architecture:** Split today's one-shot `runCapture` (which persists immediately) into two server phases — **propose** (run `extract()`, persist a `Capture` for the thumbnail, return `ExtractedTodo[]` WITHOUT creating todos) and **commit** (create the user-approved todos against that capture). A new client `CaptureReview` modal drives the state machine (idle → extracting → proposals | failed). Image ingest (upload/paste/drop) and multi-line typed submit both open the review; a single short typed line stays instant (unchanged).

**Tech Stack:** Next.js App Router (route handlers), TypeScript, React client components + `useReducer` store (`app/lib/store.tsx`), Gemini via the existing `ExtractorClient` seam, Vitest.

## Global Constraints

- **Touch & feel must be congruent with the existing app.** The `CaptureReview` modal and every new surface reuse the app's design tokens (`--accent`, `--color-*`, `--space-*`, `--radius-*`, `--dur-*`, `--ease-*`), the soft-scrim modal pattern (`ContentPlaceholder.module.css` `.modalScrim` — never an opaque black fill), `<ViewLoading>` for loading, and the existing affordance styles (labeled fields, rust accent, EB Garamond display / Geist body / Geist Mono eyebrows). It must feel native to the detail pane + view editor, not a bolt-on. Highlight = accent or soft raised surface, never a heavy fill.
- **Capture is the hero — never silent.** Failures surface visibly (existing `CaptureZone` toast pattern); a parse-miss shows a friendly retry, not nothing.
- **Nothing is created until the user approves** (the review's "Add N" action). Aligns with the locked "show the effect, user confirms" principle.
- **Single short typed line = instant 1 todo + enrichment chips — UNCHANGED.** Only multi-line/paragraph typed text routes to review.
- **Reuse the extractor seam.** Do NOT add a second extraction path; both phases go through the existing `ExtractorClient.extract()` / `runCapture` internals.
- **Wire keys snake_case; TS fields camelCase.** Match surrounding idiom + comment density.
- **`npm run ci` green before every push** (typecheck + unit + integration; Docker up).

---

### Task 1: Backend — `proposeCapture` (extract, persist Capture, DO NOT create todos)

**Files:**
- Modify: `lib/capture.ts` (add `proposeCapture`, factor shared blob/extractor-input helpers already present)
- Modify: `lib/contracts/extractor.ts` (export `ProposeResult` type near `CaptureRequest`)
- Test: `lib/__tests__/capture.test.ts` (add a `proposeCapture` describe block; mirror the existing `runCapture` test harness — injected `ExtractorClient`)

**Interfaces:**
- Consumes: existing `runCapture` internals in `lib/capture.ts` — `resolveBlobPath()`, `inlineImage()`, `deriveKind()`, `defaultTitle()`, and `extractor.extract(input: ExtractorInput)`.
- Produces:
  ```ts
  // lib/contracts/extractor.ts
  export interface ProposeResult {
    capture: Capture;              // persisted (kind/blobPath/note) — backs the thumbnail
    proposals: ExtractedTodo[];    // 0..n; NOT persisted as todos
    failed: boolean;               // true when extraction threw or returned []
  }
  // lib/capture.ts
  export async function proposeCapture(user: UserCtx, req: CaptureRequest): Promise<ProposeResult>;
  ```

- [ ] **Step 1: Write the failing test** (add to `lib/__tests__/capture.test.ts`, reuse the file's existing fake extractor + prisma mocks):

```ts
describe("proposeCapture", () => {
  it("persists a Capture and returns proposals WITHOUT creating todos", async () => {
    const extractor = fakeExtractor([
      { title: "Email Dakota", suggestedLabels: ["work"] },
      { title: "Book room" },
    ]);
    const res = await proposeCapture(testUser, { text: "email dakota then book a room" }, { extractor });
    expect(res.capture.id).toBeTruthy();
    expect(res.proposals.map((p) => p.title)).toEqual(["Email Dakota", "Book room"]);
    expect(res.failed).toBe(false);
    expect(createdTodos()).toHaveLength(0); // spy on prisma.todo.create — none called
  });

  it("marks failed=true (not throw) when extraction returns nothing", async () => {
    const res = await proposeCapture(testUser, { text: "??" }, { extractor: fakeExtractor([]) });
    expect(res.failed).toBe(true);
    expect(res.proposals).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — verify it fails** (`proposeCapture` not exported): `npx vitest run lib/__tests__/capture.test.ts` → FAIL "proposeCapture is not a function".

- [ ] **Step 3: Implement `proposeCapture`** in `lib/capture.ts`. Reuse the request→ExtractorInput assembly from `runCapture` (blob path resolve, inline image, existing-titles/labels/lists for dedupe), persist the `Capture` row (same as runCapture's capture-first step), call `withQuota(user, "extractTodos", () => extractor.extract(input))`, and return `{ capture, proposals: output.todos, failed: output.todos.length === 0 }`. Wrap `extract` in try/catch → on throw, `failed: true, proposals: []` (capture still persisted). **Do not** create any Todo rows.

- [ ] **Step 4: Run tests — pass**: `npx vitest run lib/__tests__/capture.test.ts` → PASS.

- [ ] **Step 5: Commit**: `feat(capture): proposeCapture — extract without persisting todos`.

---

### Task 2: Backend — `commitCapture` + create-approved-todos, and the two routes

**Files:**
- Modify: `lib/capture.ts` (add `commitCapture`)
- Create: `app/api/capture/propose/route.ts`
- Create: `app/api/capture/commit/route.ts`
- Test: `lib/__tests__/capture.test.ts` (add `commitCapture` block); `app/api/capture/__tests__/route.test.ts` (add propose/commit route tests — mirror the existing capture route test)

**Interfaces:**
- Consumes: `proposeCapture` (Task 1); existing `store.createTodo(userId, draft)` in `lib/store.ts`; `currentUser()`.
- Produces:
  ```ts
  // lib/capture.ts
  export interface CommitRequest { captureId: string; todos: ExtractedTodo[]; }
  export async function commitCapture(user: UserCtx, req: CommitRequest): Promise<{ todos: Todo[] }>;
  // Routes:
  // POST /api/capture/propose  body: CaptureRequest      -> 200 ProposeResult
  // POST /api/capture/commit   body: CommitRequest       -> 201 { todos: Todo[] }
  ```

- [ ] **Step 1: Failing test** (`lib/__tests__/capture.test.ts`):

```ts
describe("commitCapture", () => {
  it("creates one Todo per approved proposal, linked to the capture", async () => {
    const cap = await seedCapture(testUser, { kind: "image" });
    const { todos } = await commitCapture(testUser, {
      captureId: cap.id,
      todos: [{ title: "Email Dakota", suggestedLabels: ["work"] }, { title: "Book room" }],
    });
    expect(todos.map((t) => t.title)).toEqual(["Email Dakota", "Book room"]);
    expect(todos.every((t) => t.sourceCaptureId === cap.id)).toBe(true);
  });
});
```

- [ ] **Step 2: Run — fails** (`commitCapture` missing).

- [ ] **Step 3: Implement `commitCapture`**: validate the `captureId` belongs to `user` (findFirst where id+userId; 404 via `HttpError(404)` if not); for each approved `ExtractedTodo`, map to a Todo draft (title, priority, dueAt, labelIds via existing label-ensure, actionType/actionPayload if present, `sourceCaptureId = captureId`) and create via `store.createTodo`. Return `{ todos }`. Then create the two route handlers using the existing `app/api/capture/route.ts` as the exact template (currentUser → readJson → validate → call → `json(result, 201|200)` → `handleApiError`).

- [ ] **Step 4: Route tests + unit — pass** (`npx vitest run lib/__tests__/capture.test.ts app/api/capture/__tests__/route.test.ts`).

- [ ] **Step 5: Commit**: `feat(capture): commitCapture + /api/capture/propose|commit routes`.

---

### Task 3: API client — `proposeCapture` + `commitCapture`

**Files:**
- Modify: `app/lib/api.ts` (add the two wrappers next to the existing capture helpers)
- Modify: `app/lib/capture.ts` (a `fileToCaptureRequest(file): Promise<CaptureRequest>` if not already present — base64 the image for the propose call)
- Test: none new (thin wrappers; covered by component tests in later tasks)

**Interfaces:**
- Produces:
  ```ts
  // app/lib/api.ts
  export async function proposeCapture(body: CaptureRequest): Promise<ProposeResult>;
  export async function commitCapture(captureId: string, todos: ExtractedTodo[]): Promise<Todo[]>;
  ```

- [ ] **Step 1: Implement** both via the existing `send<T>()` helper (`send<ProposeResult>("/api/capture/propose", { method: "POST", body: JSON.stringify(body) })`; commit returns `{ todos }` → return `todos`). Reuse the image→base64 path already used by `captureImageFile`.
- [ ] **Step 2: Typecheck**: `npx tsc --noEmit` → clean.
- [ ] **Step 3: Commit**: `feat(capture): api client for propose/commit`.

---

### Task 4: Client review state (pending capture + proposals + status)

**Files:**
- Modify: `app/lib/store.tsx` (add a `review` slice to `TadaState` + actions), OR a focused `useCaptureReview` hook if the reducer grows unwieldy — prefer a hook to keep the reducer lean.
- Create: `app/lib/useCaptureReview.ts`
- Test: `app/lib/__tests__/useCaptureReview.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  type ReviewSource = { kind: "image"; file: File } | { kind: "text"; text: string };
  type ReviewStatus = "describing" | "extracting" | "proposals" | "failed";
  interface CaptureReview {
    open: boolean; source: ReviewSource | null; note: string;
    status: ReviewStatus; captureId: string | null; proposals: ExtractedTodo[];
    start(source: ReviewSource): void;         // opens modal in "describing"
    setNote(v: string): void;
    extract(): Promise<void>;                  // -> proposeCapture; sets proposals|failed
    editProposal(i: number, patch: Partial<ExtractedTodo>): void;
    removeProposal(i: number): void;
    commit(): Promise<Todo[]>;                 // -> commitCapture; dispatch UPSERT_TODO each; close
    cancel(): void;
  }
  export function useCaptureReview(): CaptureReview;
  ```

- [ ] **Step 1: Failing test** — `start()` sets open+describing; `extract()` with a mocked `proposeCapture` populating 2 proposals sets status "proposals"; empty → "failed"; `commit()` calls `commitCapture` and dispatches todos. Mock `@/app/lib/api`.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** the hook (local `useState` for the review object; `extract` builds a `CaptureRequest` from source+note via `fileToCaptureRequest`/`{text}`; `commit` maps proposals→`commitCapture(captureId, proposals)` then `dispatch({type:"UPSERT_TODO"})` per returned todo + `dispatch({type:"UPSERT_CAPTURE"})`).
- [ ] **Step 4: Run — pass.**
- [ ] **Step 5: Commit**: `feat(capture): useCaptureReview state machine`.

---

### Task 5: UI — `CaptureReview` modal

**Files:**
- Create: `app/components/capture/CaptureReview.tsx`
- Create: `app/components/capture/CaptureReview.module.css`
- Modify: `app/components/shell/AppShellContainer.tsx` (render `<CaptureReview />` as an overlay when `review.open`, same overlay pattern as `ViewEditor`/`ConfirmDialog`)
- Test: `app/components/capture/__tests__/CaptureReview.test.tsx`

**Interfaces:**
- Consumes: `useCaptureReview()` (Task 4).

- [ ] **Step 1: Failing test** — renders: image thumbnail (object URL) OR the text; a "Add context" textarea bound to `note`; an **Extract** button (disabled while `extracting`); after `proposals`, an editable list (each row: title input + remove ✕) + **"Add N todo(s)"** + **Cancel**; on `failed`, a friendly line + **Try again**. Assert the gated button text and that clicking Extract calls the hook.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** the modal (soft scrim per `ContentPlaceholder.module.css` `.modalScrim`; rust accent; `role="dialog" aria-modal`). Use `<ViewLoading>` in the `extracting` state for consistency. The proposals list edits via `editProposal`/`removeProposal`; the primary button label is ``Add ${proposals.length} todo${proposals.length===1?"":"s"}``, disabled when 0.
- [ ] **Step 4: Run — pass.**
- [ ] **Step 5: Commit**: `feat(capture): CaptureReview modal`.

---

### Task 6: Rewire image ingest → open review (no instant create)

**Files:**
- Modify: `app/lib/useImageCapture.ts` (its `ingest` opens the review for the FIRST image instead of POST-and-dispatch)
- Modify: `app/components/capture/CaptureZone.tsx` (unchanged call site; still `ingest(files)`) and `app/components/capture/AddCardView.tsx` (the upload input still calls `ingest`)
- Test: `app/lib/__tests__/useImageCapture.test.tsx` (update: assert `start({kind:"image",file})` called, NOT an immediate dispatch)

**Interfaces:**
- Consumes: `useCaptureReview().start`.

- [ ] **Step 1: Update the test** to expect `review.start` invoked with the image file and NO `UPSERT_TODO` dispatch.
- [ ] **Step 2: Run — fails** (still auto-creates).
- [ ] **Step 3: Implement** — `ingest(files)` calls `review.start({ kind: "image", file: files[0] })` (single-image review for v1; multi-file is a future follow-up — `log`/comment it). Keep the error toast for unreadable files.
- [ ] **Step 4: Run — pass.**
- [ ] **Step 5: Commit**: `feat(capture): image ingest opens the review card`.

---

### Task 7: Typed submit — single line instant, paragraph → review; relabel upload

**Files:**
- Modify: `app/components/capture/AddCardView.tsx` (`submit()` branches on multi-line/length; relabel the upload affordance)
- Modify: `app/components/capture/AddCardView.module.css` (upload button → labeled affordance + a one-line hint)
- Test: `app/components/capture/__tests__/AddCardView.test.tsx` (single line → optimistic UPSERT_TODO as today; multi-line → `review.start({kind:"text",text})` and NO direct create)

**Interfaces:**
- Consumes: `useCaptureReview().start`.

- [ ] **Step 1: Update/extend tests** — `isMultiCapture(text)` returns true when the text has a newline OR length > 140 (tune constant `MULTI_CAPTURE_MIN = 140`). Single line → current instant path; multi → review.
- [ ] **Step 2: Run — fails.**
- [ ] **Step 3: Implement** — add `const MULTI_CAPTURE_MIN = 140;` and `function isMultiCapture(t: string) { return /\n/.test(t) || t.trim().length > MULTI_CAPTURE_MIN; }`. In `submit()`: if `isMultiCapture(rawText)` → `review.start({ kind: "text", text: rawText })`, clear the input, return (skip the optimistic single-todo path). Else the existing instant path. Relabel the upload button from the bare ↑ to an affordance reading **"Screenshot → todos"** (icon + short label) with `title`/`aria-label` "Add a screenshot — Tada turns it into todos", and a muted one-line hint under the input on empty focus.
- [ ] **Step 4: Run — pass.**
- [ ] **Step 5: Commit**: `feat(capture): paragraph typing opens review; clearer screenshot affordance`.

---

### Task 8: Parse-fail polish, docs, and full verification

**Files:**
- Modify: `app/components/capture/CaptureReview.tsx` (final failed-state copy: "Couldn't find any tasks in this — add a note describing what to do, then retry.")
- Modify: `docs/architecture.md` (capture pipeline note: propose→review→commit) and `README.md` capture bullet if present
- Test: extend `CaptureReview.test.tsx` for the failed→retry loop

- [ ] **Step 1: Implement** the failed-state copy + a **Try again** that returns to `describing` keeping the note.
- [ ] **Step 2: `npm run ci`** (typecheck + unit + integration; Docker up) → all green.
- [ ] **Step 3: Playwright MCP e2e** (per CLAUDE.md — real input injection), signed in on the live app:
  1. Paste/upload a screenshot → review card opens with the thumbnail; add a note → **Extract** → proposals appear → remove one → **Add N** → exactly those todos land in All.
  2. Type a multi-line paragraph with 2–3 tasks → review opens → proposals → approve → multiple todos created.
  3. Type a single short line → instant single todo (no review), unchanged.
  4. Force a parse-miss (blank-ish image) → friendly failed state + retry works.
  Screenshot-verify (DOM-present ≠ visually-correct).
- [ ] **Step 4: Commit**: `docs(capture): review→approve pipeline; polish parse-fail`.

## Self-Review

- **Spec coverage:** native screenshot → OS paste already caught + upload affordance clearer (Task 7); annotate step → describe field (Task 5); approve before create → propose/commit split (Tasks 1–2, 5); can fail to parse → `failed` state + retry (Tasks 1, 8); paragraph→multiple → Task 7; upload clarity → Task 7. ✓
- **Placeholder scan:** constants (`MULTI_CAPTURE_MIN=140`), route paths, and type names are concrete. ✓
- **Type consistency:** `ProposeResult`, `CommitRequest`, `ReviewSource/Status`, `ExtractedTodo` used consistently across tasks; `proposeCapture`/`commitCapture` names stable client+server. ✓

## Verification
- `npm run ci` green (typecheck + unit + integration).
- Playwright MCP e2e (Task 8) — the four flows above, screenshot-verified.
- No commit/push that deploys without explicit authorization.
