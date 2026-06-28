# Quick-Add Golden Flow Polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the quick-add capture flow feel finished — multi-line input, a sparkle indicator while AI enriches, and a deliberate, gated meeting "review & send" card that confirms the contact and shows booked details.

**Architecture:** Capture stays instant (a deterministic plain todo lands immediately; the model is never in the hot path). The async enrich pass shows a sparkle, then offers chips. Accepting the Meeting chip stamps the action onto the todo, shows a small "Send invite" pill on the row, and auto-opens the right detail pane onto an editable review card (`MeetingOffer`, delegated from the shared `OfferPanel`). The card resolves the attendee via the existing `/api/contacts/resolve`, gates Send on required fields, keeps the todo's due date in sync with the meeting start, and shows booked details + a calendar link after send. Backend changes carry a real event title + the event `htmlLink`, stored inside the existing JSON `actionPayload` column — **no schema migration**.

**Tech Stack:** Next.js App Router, TypeScript, React, Vitest + @testing-library/react, Vercel AI SDK (Gemini), Google Calendar/People APIs.

Spec: `docs/superpowers/specs/2026-06-27-quick-add-golden-flow-design.md`.

## Global Constraints

- TypeScript only — no Python. Wire keys snake_case; TS fields camelCase.
- AI providers: Gemini only in the product runtime — NO Claude/Anthropic.
- Never auto-execute a side effect — every write fires only on an explicit tap/confirmed action.
- Double gate for meetings: the client disables Send AND the server executor independently refuses an incomplete/unresolved meeting.
- Design system: rust accent `var(--color-accent)` (`#c8632e`); selected/active = accent or soft raised surface, never a heavy black fill. Reuse existing CSS variables.
- NO schema migration: `actionPayload` is `Json?`, `dueAt` is an existing column (verified in `prisma/schema.prisma`).
- Match surrounding code idiom, naming, and comment density.
- Before any `git push`: `npm run ci` green (Docker up for integration). Do NOT commit/push without explicit user authorization (push deploys to prod + runs migrations).
- Test runner: `npm test` (vitest run). Single file: `npx vitest run <path>`.

---

### Task 1: Multi-line quick-add input (spec §0)

Convert the single-line quick-add field to an auto-growing textarea. Enter submits; Shift+Enter inserts a newline.

**Files:**
- Modify: `app/components/capture/HighlightedInput.tsx`
- Modify: `app/components/capture/HighlightedInput.module.css`
- Test: `app/components/capture/__tests__/HighlightedInput.test.tsx` (create)

**Interfaces:**
- Consumes: existing `HighlightedInputProps { value, tokens, onChange, onSubmit, placeholder?, autoFocus? }` (unchanged).
- Produces: same component contract — `AddCardView` needs no change.

- [ ] **Step 1: Write the failing test**

```tsx
// app/components/capture/__tests__/HighlightedInput.test.tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HighlightedInput } from "../HighlightedInput";

describe("HighlightedInput", () => {
  it("renders a textarea, submits on Enter, newlines on Shift+Enter", () => {
    const onSubmit = vi.fn();
    render(<HighlightedInput value="buy milk" tokens={[]} onChange={vi.fn()} onSubmit={onSubmit} />);
    const field = screen.getByRole("textbox");
    expect(field.tagName).toBe("TEXTAREA");
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter", shiftKey: false });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/capture/__tests__/HighlightedInput.test.tsx`
Expected: FAIL — `field.tagName` is `INPUT`.

- [ ] **Step 3: Swap `<input>` for an auto-growing `<textarea>`**

In `HighlightedInput.tsx`, add `useEffect`/`useRef` imports and an auto-grow effect, then replace the `<input … />` (lines ~64-78) with a textarea:

```tsx
import { useEffect, useMemo, useRef } from "react";
// …inside the component, alongside `segments`:
  const taRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
```

```tsx
      <textarea
        ref={taRef}
        className={styles.input}
        rows={1}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />
```

- [ ] **Step 4: Update the CSS for textarea + backdrop parity**

In `HighlightedInput.module.css`, the shared `.backdrop, .input` block already sets `white-space: pre-wrap; word-break: break-word; line-height: 1.4`. Replace the `.input` rule with:

```css
.input {
  position: relative;
  width: 100%;
  background: transparent;
  color: transparent;
  caret-color: var(--color-accent);
  outline: none;
  resize: none;
  overflow-y: auto;
  display: block;
  max-height: calc(1.4em * 6 + var(--space-3) * 2); /* ~6 rows, then scroll */
}
```

And add `overflow-y: auto;` to the `.backdrop` rule so long content clips identically.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run app/components/capture/__tests__/HighlightedInput.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/components/capture/HighlightedInput.tsx app/components/capture/HighlightedInput.module.css app/components/capture/__tests__/HighlightedInput.test.tsx
git commit -m "feat(capture): multi-line quick-add (textarea, Shift+Enter newline)"
```

---

### Task 2: Shared Spark + "Enhancing…" sparkle (spec §New)

Promote the inline `Spark` glyph to a shared component and show an animated pill while the enrich pass runs.

**Files:**
- Create: `app/components/brand/Spark.tsx`
- Modify: `app/components/landing/Landing.tsx` (import shared Spark; delete local copy)
- Modify: `app/components/capture/AddCardView.tsx` (add `enriching` state + indicator)
- Modify: `app/components/capture/AddCardView.module.css` (pill + twinkle keyframe)
- Test: `app/components/brand/__tests__/Spark.test.tsx` (create)

**Interfaces:**
- Produces: `export function Spark({ size?: number, className?: string }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

```tsx
// app/components/brand/__tests__/Spark.test.tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { Spark } from "../Spark";

describe("Spark", () => {
  it("renders an svg sized by the size prop", () => {
    const { container } = render(<Spark size={20} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg).toHaveAttribute("width", "20");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/components/brand/__tests__/Spark.test.tsx`
Expected: FAIL — module `../Spark` does not exist.

- [ ] **Step 3: Create the shared Spark**

```tsx
// app/components/brand/Spark.tsx
// The four-point "ta-da" glyph (brand mark), shared by the landing page and the
// quick-add enhancing indicator. Inherits color via currentColor.
export function Spark({ size = 12, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 0c.6 5.7 3.3 8.4 9 9-5.7.6-8.4 3.3-9 9-.6-5.7-3.3-8.4-9-9 5.7-.6 8.4-3.3 9-9Z"
      />
    </svg>
  );
}
```

- [ ] **Step 4: Point Landing.tsx at the shared component**

In `app/components/landing/Landing.tsx`: delete the local `function Spark(...)` (lines ~10-19) and add `import { Spark } from "@/app/components/brand/Spark";`. All existing `<Spark size={…} />` call-sites still type-check.

- [ ] **Step 5: Run Spark test**

Run: `npx vitest run app/components/brand/__tests__/Spark.test.tsx`
Expected: PASS.

- [ ] **Step 6: Add the enriching indicator to AddCardView**

In `app/components/capture/AddCardView.tsx`:
- Import: `import { Spark } from "@/app/components/brand/Spark";`
- Add state with the others: `const [enriching, setEnriching] = useState(false);`
- Replace the `enrichText(rawText).then(...).catch(...)` tail in `submit()` with:

```tsx
    setEnriching(true);
    enrichText(rawText)
      .then((suggestions) => {
        const first = suggestions[0];
        if (!first) return;
        const offered = novelChips(enrichmentChips(first, new Date()), persisted);
        if (offered.length === 0) return;
        setEnrichTarget(persisted);
        setChips(offered);
      })
      .catch(() => {
        // enrichment is best-effort; silence failures (quota / offline / pre-auth).
      })
      .finally(() => setEnriching(false));
```

- Render the pill just before `<EnrichmentBar …>`:

```tsx
      {enriching ? (
        <div className={styles.enhancing} role="status" aria-live="polite">
          <Spark size={13} className={styles.enhanceSpark} />
          <span>Enhancing…</span>
        </div>
      ) : null}
```

- [ ] **Step 7: Add the pill + twinkle CSS**

In `app/components/capture/AddCardView.module.css`:

```css
.enhancing {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-2);
  font-size: var(--fs-ui-small, 0.8rem);
  color: var(--color-accent-text);
}
.enhanceSpark { color: var(--color-accent); animation: enhanceTwinkle 1.1s ease-in-out infinite; }
@keyframes enhanceTwinkle {
  0%, 100% { opacity: 0.45; transform: scale(0.85) rotate(0deg); }
  50%      { opacity: 1;    transform: scale(1.15) rotate(45deg); }
}
@media (prefers-reduced-motion: reduce) {
  .enhanceSpark { animation: none; opacity: 1; }
}
```

- [ ] **Step 8: Run tests + commit**

Run: `npx vitest run app/components/brand app/components/capture`
Expected: PASS.

```bash
git add app/components/brand app/components/landing/Landing.tsx app/components/capture/AddCardView.tsx app/components/capture/AddCardView.module.css
git commit -m "feat(capture): sparkle indicator while AI enriches; share <Spark> brand mark"
```

---

### Task 3: Backend — real meeting title + calendar link round-trip (spec §1, §3)

Fix the titleless invite and carry the created event's `htmlLink` end-to-end. `htmlLink` rides in the JSON `actionPayload` column — no migration.

**Files:**
- Modify: `lib/contracts/executors.ts` (add `actionLink?: string` to `ExecResult`)
- Modify: `lib/contracts/types.ts` (add `htmlLink?: string | null` to meeting `ActionPayload`)
- Modify: `lib/executors.ts` (`summary` fallback; return `htmlLink`)
- Modify: `lib/finish.ts` (`applyFinishResult` merges `htmlLink` into the meeting payload)
- Modify: `app/lib/api.ts` (`FinishResponse` gains `actionLink?`)
- Modify: `app/lib/offer.ts` (`reflectFinish` mirrors `actionLink` → payload `htmlLink`)
- Verify: `app/api/todos/[id]/finish/route.ts` returns `actionLink` (see Step 5 note)
- Test: `lib/__tests__/executors.test.ts` (extend; create if absent)

**Interfaces:**
- Produces: `ExecResult.actionLink?: string`; meeting `ActionPayload.htmlLink?: string | null`; `FinishResponse.actionLink?: string`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/executors.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
vi.mock("../google", () => ({ getGoogleAccessToken: vi.fn(async () => "tok") }));
import { executors } from "../executors";
import type { UserCtx } from "../contracts";

const user = { userId: "u1", googleRefreshToken: "r", timezone: "America/New_York" } as UserCtx;

describe("sendMeetingInvite", () => {
  beforeEach(() => vi.restoreAllMocks());
  it("uses a non-empty summary and returns the event htmlLink", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "evt_1", htmlLink: "https://cal/evt_1" }), { status: 200 }),
    );
    const res = await executors.sendMeetingInvite(
      {
        kind: "meeting", title: "",
        start: "2026-06-30T14:00:00", durationMin: 30,
        resolvedAttendees: [{ name: "Hansen", email: "hansen@acme.com", status: "resolved" }],
      },
      user,
    );
    expect(res.ok).toBe(true);
    expect(res.actionLink).toBe("https://cal/evt_1");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.summary.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/__tests__/executors.test.ts`
Expected: FAIL — `actionLink` undefined / empty summary.

- [ ] **Step 3: Add the contract fields**

`lib/contracts/executors.ts` — in `interface ExecResult`, add:
```ts
  actionLink?: string; // created event's calendar URL (meeting), surfaced after send
```
`lib/contracts/types.ts` — in the `meeting` member of `ActionPayload`, add:
```ts
      htmlLink?: string | null; // created Google Calendar event URL (set after send)
```

- [ ] **Step 4: Fix the executor**

In `lib/executors.ts` `sendMeetingInvite`, change the body summary line and the success return:
```ts
          summary: p.title?.trim() || "Meeting",
```
```ts
    const event = (await res.json()) as { id?: string; htmlLink?: string };
    return { ok: true, actionExternalId: event.id, actionLink: event.htmlLink };
```

- [ ] **Step 5: Persist the link + pass it to the client**

`lib/finish.ts` `applyFinishResult`, replace the `if (result.ok) { … }` branch with:
```ts
  if (result.ok) {
    const actionPayload =
      todo.actionType === "meeting" && todo.actionPayload?.kind === "meeting" && result.actionLink
        ? { ...todo.actionPayload, htmlLink: result.actionLink }
        : todo.actionPayload;
    await store.updateTodo(user.userId, todo.id, {
      actionState: "done",
      actionExternalId: result.actionExternalId ?? null,
      ...(actionPayload !== todo.actionPayload ? { actionPayload } : {}),
    });
    if (todo.parentId) {
      const line = resultLine(todo, result);
      if (line) await appendNote(store, user.userId, todo.parentId, line);
    }
  } else {
    await store.updateTodo(user.userId, todo.id, { actionState: "failed" });
  }
```

`app/lib/api.ts` — add to `interface FinishResponse`: `actionLink?: string;`

`app/lib/offer.ts` `reflectFinish` — replace the `if (res.ok) { … }` block with:
```ts
  if (res.ok) {
    if (todo.actionType === "research") {
      return { actionState: "done", actionExternalId: "research", detail: res.markdown ?? todo.detail };
    }
    if (todo.actionType === "meeting" && todo.actionPayload?.kind === "meeting" && res.actionLink) {
      return {
        actionState: "done",
        actionExternalId: res.actionExternalId ?? null,
        actionPayload: { ...todo.actionPayload, htmlLink: res.actionLink },
      };
    }
    return { actionState: "done", actionExternalId: res.actionExternalId ?? null };
  }
```

> Verify `app/api/todos/[id]/finish/route.ts`: if it returns the `ExecResult` whole (e.g. `json(result)` / `NextResponse.json(result)`), `actionLink` flows automatically — no change. If it cherry-picks fields into the response object, add `actionLink: result.actionLink` there.

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run lib/__tests__/executors.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/contracts/executors.ts lib/contracts/types.ts lib/executors.ts lib/finish.ts app/lib/api.ts app/lib/offer.ts lib/__tests__/executors.test.ts
git commit -m "feat(meeting): real event title + calendar link round-trip"
```

---

### Task 4: Extractor prompt nudge — don't invent a meeting day (spec §1)

Stop the enrich pass from fabricating a weekday when only a clock time is given, and always set a concise meeting title.

**Files:**
- Modify: `lib/extractor.ts` (`ENRICH_SYSTEM_PROMPT`)

- [ ] **Step 1: Edit the ENRICH meeting guidance**

In `lib/extractor.ts`, in `ENRICH_SYSTEM_PROMPT`, replace the meeting bullet (`1. meeting — meeting/call/sync with other people. attendees = named people; start only if an explicit time.`) with:
```
  1. meeting — meeting/call/sync with other people. Set payload.title to a short event title (≤6 words, e.g. "Follow up on Claudia"). attendees = named people. start: include ONLY when the user gives a time. If they give a clock time but NO day, anchor start's DATE to suggestedDueAt if you set one, else today — never invent a different weekday.
```

- [ ] **Step 2: Typecheck (prompt-only change)**

Run: `npm run typecheck`
Expected: PASS.

> No deterministic unit test for model phrasing. If `lib/__tests__/extractor.test.ts` already asserts prompt substrings, add `expect(ENRICH_SYSTEM_PROMPT).toContain("short event title")`; otherwise Task 7's Playwright pass validates behavior live.

- [ ] **Step 3: Commit**

```bash
git add lib/extractor.ts
git commit -m "feat(enrich): meeting title + don't fabricate a meeting day"
```

---

### Task 5: Meeting review card — gating, contact confirm, due-date sync, booked details (spec §1, §3)

The core change. A focused `MeetingOffer` component (delegated from the shared `OfferPanel`): editable Title · When (date+time) · With · Length; Send gated on required fields; attendee resolved-and-shown on mount (even a unique match); the todo's due date kept in sync with the meeting start; booked details + calendar link when done. Reminder/research stay in `OfferPanel` unchanged.

**Files:**
- Create: `app/components/todo/MeetingOffer.tsx`
- Create: `app/components/todo/MeetingOffer.module.css`
- Modify: `app/components/todo/OfferPanel.tsx` (add optional `onPatch`; delegate meeting to `MeetingOffer`)
- Modify: `app/components/shell/DetailPaneView.tsx` (pass `onPatch={patch}` to `OfferPanel`)
- Modify: `app/components/chat/tiles/ChatActionTodo.tsx` (pass an `onPatch` to `OfferPanel`)
- Modify: `app/lib/api.ts` (add `resolveContacts(names)` wrapper)
- Test: `app/components/todo/__tests__/MeetingOffer.test.tsx` (create)
- Modify: `app/components/todo/__tests__/OfferPanel.test.tsx` (remove the 4 meeting cases — see Step 8)

**Interfaces:**
- Consumes: `Attendee`, `ActionPayload`, `Todo` (`@/lib/contracts`); `formatDue`, `formatClock` (`@/app/lib/format`).
- Produces:
  - `export async function resolveContacts(names: string[]): Promise<Attendee[]>` in `app/lib/api.ts`.
  - `export function MeetingOffer(props: OfferPanelProps): JSX.Element`.
  - `OfferPanelProps` gains optional `onPatch?: (patch: Partial<Todo>) => void` (todo-level patch, for due-date sync).

- [ ] **Step 1: Add the resolveContacts client wrapper**

In `app/lib/api.ts` (near `finishTodo`; reuse the existing `Attendee` import if present, else add it):
```ts
import type { Attendee } from "@/lib/contracts";
// Resolve raw attendee names → Attendee[] (resolved email or unresolved+candidates)
// via POST /api/contacts/resolve, so the meeting card confirms contacts before Send.
export async function resolveContacts(names: string[]): Promise<Attendee[]> {
  const { attendees } = await send<{ attendees: Attendee[] }>("/api/contacts/resolve", {
    method: "POST",
    body: JSON.stringify({ names }),
  });
  return attendees;
}
```

- [ ] **Step 2: Add optional `onPatch` to OfferPanelProps**

In `app/components/todo/OfferPanel.tsx`, extend the props interface:
```ts
  onPatch?: (patch: Partial<Todo>) => void; // todo-level patch (meeting due-date sync)
```
(Import `Todo` from `@/lib/contracts` if not already imported.)

- [ ] **Step 3: Write the failing test**

```tsx
// app/components/todo/__tests__/MeetingOffer.test.tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Todo } from "@/lib/contracts";
import { MeetingOffer } from "../MeetingOffer";

vi.mock("@/app/lib/api", () => ({
  resolveContacts: vi.fn(async () => [
    { name: "Hansen", email: "hansen@acme.com", status: "resolved" },
  ]),
}));
import { resolveContacts } from "@/app/lib/api";

function mtg(payloadOver: Record<string, unknown> = {}, todoOver: Partial<Todo> = {}): Todo {
  return {
    id: "t1", createdAt: "2026-06-27T08:00:00", sourceCaptureId: "c1",
    title: "Follow up on Claudia", status: "open",
    actionType: "meeting", actionState: "proposed", sortIndex: 0,
    priority: "none", labelIds: [],
    actionPayload: { kind: "meeting", title: "", attendees: ["Hansen"], start: null, durationMin: 30, ...payloadOver },
    ...todoOver,
  } as Todo;
}

describe("MeetingOffer", () => {
  beforeEach(() => vi.clearAllMocks());

  it("resolves the contact on mount and shows the email (even a unique match)", async () => {
    const onPatchPayload = vi.fn(async () => {});
    render(<MeetingOffer todo={mtg()} onFinish={vi.fn()} onPatchPayload={onPatchPayload} />);
    await waitFor(() => expect(resolveContacts).toHaveBeenCalledWith(["Hansen"]));
    await waitFor(() =>
      expect(onPatchPayload).toHaveBeenCalledWith(
        expect.objectContaining({
          resolvedAttendees: [expect.objectContaining({ email: "hansen@acme.com", status: "resolved" })],
        }),
      ),
    );
  });

  it("disables Send until title + date/time + a resolved attendee are all present", () => {
    render(<MeetingOffer todo={mtg()} onFinish={vi.fn()} onPatchPayload={vi.fn()} />);
    expect(screen.getByRole("button", { name: /send invite/i })).toBeDisabled();
  });

  it("syncs the todo due date when the meeting date is set", () => {
    const onPatch = vi.fn();
    const onPatchPayload = vi.fn(async () => {});
    render(
      <MeetingOffer
        todo={mtg({ resolvedAttendees: [{ name: "Hansen", email: "hansen@acme.com", status: "resolved" }] })}
        onFinish={vi.fn()} onPatchPayload={onPatchPayload} onPatch={onPatch}
      />,
    );
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: "2026-06-30" } });
    expect(onPatchPayload).toHaveBeenCalledWith(expect.objectContaining({ start: "2026-06-30T00:00:00" }));
    expect(onPatch).toHaveBeenCalledWith({ dueAt: "2026-06-30T00:00:00" });
  });

  it("enables Send and fires onFinish once everything is valid", async () => {
    const onFinish = vi.fn(async () => ({ ok: true, actionExternalId: "evt_1", actionLink: "https://cal/evt_1" }));
    render(
      <MeetingOffer
        todo={mtg({
          title: "Follow up on Claudia", start: "2026-06-30T09:00:00",
          resolvedAttendees: [{ name: "Hansen", email: "hansen@acme.com", status: "resolved" }],
        })}
        onFinish={onFinish} onPatchPayload={vi.fn()}
      />,
    );
    const send = screen.getByRole("button", { name: /send invite/i });
    expect(send).not.toBeDisabled();
    fireEvent.click(send);
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
  });

  it("shows booked details + a calendar link when done", () => {
    render(
      <MeetingOffer
        todo={mtg(
          {
            title: "Follow up on Claudia", start: "2026-06-30T09:00:00",
            resolvedAttendees: [{ name: "Hansen", email: "hansen@acme.com", status: "resolved" }],
            htmlLink: "https://cal/evt_1",
          },
          { actionState: "done" },
        )}
        onFinish={vi.fn()} onPatchPayload={vi.fn()}
      />,
    );
    expect(screen.getByText(/invite sent/i)).toBeInTheDocument();
    expect(screen.getByText(/hansen@acme\.com/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /google calendar/i })).toHaveAttribute("href", "https://cal/evt_1");
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run app/components/todo/__tests__/MeetingOffer.test.tsx`
Expected: FAIL — module `../MeetingOffer` does not exist.

- [ ] **Step 5: Implement MeetingOffer**

```tsx
// app/components/todo/MeetingOffer.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionPayload, Attendee, Todo } from "@/lib/contracts";
import { resolveContacts } from "@/app/lib/api";
import { formatDue, formatClock } from "@/app/lib/format";
import type { OfferPanelProps } from "./OfferPanel";
import styles from "./MeetingOffer.module.css";

type Meeting = Extract<ActionPayload, { kind: "meeting" }>;
const DURATIONS = [15, 30, 45, 60];

// Split/recombine an offset-less local ISO ("2026-06-30T09:00:00") <-> date+time.
function splitStart(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  return { date: iso.slice(0, 10), time: /^\d{2}:\d{2}/.test(iso.slice(11, 16)) ? iso.slice(11, 16) : "" };
}
function joinStart(date: string, time: string): string | null {
  if (!date) return null;
  return `${date}T${time || "00:00"}:00`;
}

export function MeetingOffer({ todo, onFinish, onPatchPayload, onPatch }: OfferPanelProps) {
  const p = (todo.actionPayload?.kind === "meeting" ? todo.actionPayload : null) as Meeting | null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedOnce = useRef(false);

  // Always-confirm contact: resolve raw names on mount so the user SEES the email
  // before Send (no silent booking, even on a unique match). Runs once.
  useEffect(() => {
    if (!p || resolvedOnce.current) return;
    const raw = p.attendees ?? [];
    if (raw.length && !(p.resolvedAttendees?.length)) {
      resolvedOnce.current = true;
      resolveContacts(raw)
        .then((attendees) => onPatchPayload({ ...p, resolvedAttendees: attendees }))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!p) return null;

  const title = p.title?.trim() || todo.title;
  const { date, time } = splitStart(p.start);
  const duration = p.durationMin ?? 30;
  const attendees: Attendee[] =
    p.resolvedAttendees ??
    (p.attendees ?? []).map((a) =>
      a.includes("@")
        ? { name: a, email: a, status: "resolved" as const }
        : { name: a, status: "unresolved" as const },
    );
  const allResolved = attendees.length > 0 && attendees.every((a) => a.status === "resolved" && a.email);
  const canSend = !!title && !!date && !!time && allResolved && !busy;

  function patchPayload(next: Partial<Meeting>) {
    onPatchPayload({ ...p!, ...next });
  }
  // When the meeting's date changes, keep the todo's due date in sync (one source
  // of truth — spec: "due date = meeting date").
  function setStart(nextDate: string, nextTime: string) {
    const start = joinStart(nextDate, nextTime);
    patchPayload({ start });
    onPatch?.({ dueAt: nextDate ? `${nextDate}T00:00:00` : null });
  }

  // ---- DONE: booked details + calendar link ----
  if (todo.actionState === "done") {
    const when = p.start
      ? `${formatDue(p.start, new Date()).label}${formatClock(p.start) ? ` · ${formatClock(p.start)}` : ""}`
      : "";
    const emails = (p.resolvedAttendees ?? []).map((a) => a.email).filter(Boolean).join(", ");
    return (
      <div className={styles.panel} data-state="done">
        <p className={styles.eyebrow}>✓ Invite sent</p>
        <p className={styles.bookedTitle}>{title}</p>
        <dl className={styles.details}>
          {emails ? (<><dt>With</dt><dd>{emails}</dd></>) : null}
          {when ? (<><dt>When</dt><dd>{when}</dd></>) : null}
          <dt>Length</dt><dd>{duration} min</dd>
        </dl>
        {p.htmlLink ? (
          <a className={styles.calLink} href={p.htmlLink} target="_blank" rel="noreferrer">
            View in Google Calendar →
          </a>
        ) : null}
      </div>
    );
  }

  async function pickCandidate(index: number, email: string, name?: string) {
    const next = [...attendees];
    next[index] = { ...next[index], email, name: name ?? next[index].name, status: "resolved" };
    patchPayload({ resolvedAttendees: next });
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await onFinish();
      if (res.needsDisambiguation) {
        patchPayload({ resolvedAttendees: res.needsDisambiguation });
      } else if (!res.ok) {
        setError(res.error ?? "Couldn't send the invite.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.panel} data-state={todo.actionState}>
      <p className={styles.eyebrow}>Send meeting invite</p>

      <label className={styles.field}>
        <span className={styles.label}>Title</span>
        <input className={styles.text} value={title} onChange={(e) => patchPayload({ title: e.target.value })} />
      </label>

      <div className={styles.when}>
        <label className={styles.field}>
          <span className={styles.label}>Date</span>
          <input type="date" value={date} onChange={(e) => setStart(e.target.value, time)} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Time</span>
          <input type="time" value={time} onChange={(e) => setStart(date, e.target.value)} />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Length</span>
          <select value={duration} onChange={(e) => patchPayload({ durationMin: Number(e.target.value) })}>
            {DURATIONS.map((d) => (<option key={d} value={d}>{d}m</option>))}
          </select>
        </label>
      </div>

      <div className={styles.attendees}>
        <span className={styles.label}>With</span>
        {attendees.map((a, i) =>
          a.status === "resolved" && a.email ? (
            <p key={i} className={styles.resolved}>✓ {a.name ?? a.email} &lt;{a.email}&gt;</p>
          ) : (
            <div key={i} className={styles.unresolved}>
              <span className={styles.who}>{a.name ?? "?"}</span>
              <div className={styles.candidates}>
                {(a.candidates ?? []).map((c) => (
                  <button key={c.email} type="button" className={styles.candidate}
                    disabled={busy} onClick={() => pickCandidate(i, c.email, c.name)}>
                    {c.name} &lt;{c.email}&gt;
                  </button>
                ))}
                {(a.candidates ?? []).length === 0 ? (
                  <input className={styles.emailInput} type="email" placeholder="name@email.com"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const v = (e.target as HTMLInputElement).value.trim();
                        if (v) void pickCandidate(i, v);
                      }
                    }} />
                ) : null}
              </div>
            </div>
          ),
        )}
      </div>

      <button type="button" className={styles.send} disabled={!canSend} onClick={send}>
        {busy ? "Sending…" : "Send invite"}
      </button>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <p className={styles.guarantee}>You confirm before anything is sent.</p>
    </div>
  );
}
```

Create `app/components/todo/MeetingOffer.module.css` (reuse the look of `OfferPanel.module.css` — soft raised panel, accent Send, no black fill):

```css
.panel { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3);
  border: 1px solid var(--color-border); border-radius: var(--radius-md);
  background: var(--color-surface-raised, var(--color-surface)); }
.eyebrow { font-size: var(--fs-ui-small, 0.8rem); color: var(--color-accent-text); margin: 0; }
.field { display: flex; flex-direction: column; gap: 2px; }
.label { font-size: var(--fs-ui-small, 0.75rem); color: var(--color-ink-muted); }
.text, .field input, .field select { font: inherit; padding: var(--space-2);
  border: 1px solid var(--color-border); border-radius: var(--radius-sm);
  background: var(--color-surface); color: var(--color-ink); }
.when { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.attendees { display: flex; flex-direction: column; gap: 4px; }
.resolved { margin: 0; color: var(--color-ink); }
.candidates { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.candidate { font: inherit; cursor: pointer; padding: 2px var(--space-2);
  border: 1px solid var(--color-border); border-radius: var(--radius-sm); background: var(--color-surface); }
.emailInput { font: inherit; padding: var(--space-2); border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.send { font: inherit; cursor: pointer; padding: var(--space-2) var(--space-3); align-self: flex-start;
  background: var(--color-accent); color: #fff; border: none; border-radius: var(--radius-sm); }
.send:disabled { opacity: 0.5; cursor: not-allowed; }
.bookedTitle { margin: 0; font-weight: 600; }
.details { display: grid; grid-template-columns: max-content 1fr; gap: 2px var(--space-3); margin: 0; }
.details dt { color: var(--color-ink-muted); }
.details dd { margin: 0; }
.calLink { color: var(--color-accent); }
.guarantee { font-size: var(--fs-ui-small, 0.75rem); color: var(--color-ink-muted); margin: 0; }
.error { color: var(--color-danger, #c0392b); margin: 0; }
```
(Adjust variable names to those actually present in `OfferPanel.module.css` / the tokens file.)

- [ ] **Step 6: Delegate the meeting branch from OfferPanel**

In `app/components/todo/OfferPanel.tsx`: `import { MeetingOffer } from "./MeetingOffer";`, accept the new `onPatch` prop in the destructure, and at the very top of the component body (before the done-state / describeOffer logic) short-circuit meetings:
```tsx
  if (todo.actionType === "meeting") {
    return (
      <MeetingOffer todo={todo} onFinish={onFinish} onPatchPayload={onPatchPayload} onPatch={onPatch} />
    );
  }
```

- [ ] **Step 7: Wire `onPatch` from both OfferPanel hosts**

`app/components/shell/DetailPaneView.tsx` — pass the existing todo patcher:
```tsx
      <OfferPanel
        todo={todo}
        onFinish={finishOffer}
        onPatchPayload={(payload: ActionPayload) => patch({ actionPayload: payload })}
        onPatch={patch}
      />
```
`app/components/chat/tiles/ChatActionTodo.tsx` — inside `offerFor`, add an `onPatch` that persists a todo-level patch the same way `onPatchPayload` does:
```tsx
        onPatch={async (p: Partial<Todo>) => {
          const saved = await patchTodo(todo.id, p);
          if (saved) {
            setTodos((prev) => ({ ...prev, [todo.id]: saved }));
            dispatch({ type: "UPSERT_TODO", todo: saved });
          }
        }}
```

- [ ] **Step 8: Remove the superseded meeting tests from OfferPanel.test.tsx**

The 4 meeting cases in `app/components/todo/__tests__/OfferPanel.test.tsx` (the "asks for a missing meeting time", "gates on missing attendees", "renders attendee candidate pickers", and "shows a calm confirmation when already executed" cases — lines ~46-157) assert the OLD single-ask meeting UI, now owned by `MeetingOffer`. Delete those 4 cases. KEEP the reminder case ("shows the concrete effect and only finishes on the explicit tap").

- [ ] **Step 9: Run tests to verify they pass**

Run: `npx vitest run app/components/todo/__tests__/MeetingOffer.test.tsx app/components/todo/__tests__/OfferPanel.test.tsx`
Expected: PASS (MeetingOffer suite + the surviving reminder case).

- [ ] **Step 10: Commit**

```bash
git add app/components/todo/MeetingOffer.tsx app/components/todo/MeetingOffer.module.css app/components/todo/OfferPanel.tsx app/components/shell/DetailPaneView.tsx app/components/chat/tiles/ChatActionTodo.tsx app/lib/api.ts app/components/todo/__tests__/MeetingOffer.test.tsx app/components/todo/__tests__/OfferPanel.test.tsx
git commit -m "feat(meeting): review-and-send card — gating, contact confirm, due-date sync, booked details"
```

---

### Task 6: Affordance — compact "Send invite" pill + open card on chip accept (spec §2)

The 1+2 hybrid: the row shows a small, deliberate pill (not the stray ⚡ with a long effect line); accepting the Meeting chip lands the user on the card directly.

**Files:**
- Modify: `app/components/todo/TodoList.tsx` (compact offer label)
- Modify: `app/components/todo/TodoRow.module.css` (tighten the offer chip — optional polish)
- Modify: `app/components/capture/AddCardView.tsx` (`acceptChip`, `action` case → open detail pane)

- [ ] **Step 1: Make the row offer a compact pill (verb only, no effect line)**

In `app/components/todo/TodoList.tsx`, where it builds the row offer (`const offer = eff ? { eyebrow: eff.eyebrow, line: eff.lines[0] } : null;`), use the compact CTA verb and drop the long line:
```tsx
    const offer = eff ? { eyebrow: eff.cta, line: undefined } : null;
```
`eff.cta` is "Send invite" / "Set reminder" / "Research" (from `offerEffect`). `TodoRow` already renders `offer.eyebrow` and omits the line when absent, so the pill becomes a short label.

- [ ] **Step 2: Open the detail pane when an action chip is accepted**

In `app/components/capture/AddCardView.tsx` `acceptChip`, after the existing `patchTodo(merged.id, patch)` call, add:
```tsx
    if (chip.kind === "action") {
      dispatch({ type: "SELECT_TODO", id: merged.id });
    }
```
(`merged` and `dispatch` are already in scope.)

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add app/components/todo/TodoList.tsx app/components/todo/TodoRow.module.css app/components/capture/AddCardView.tsx
git commit -m "feat(capture): compact action pill + open review card on chip accept"
```

---

### Task 8: Relocate the enhancing indicator to the enriching todo row (user feedback)

Task 2 put the "Enhancing…" pill in the add card; per user feedback it belongs on the just-added
todo ROW being enriched. Route the enriching todo id through the store so the row renders the spark.

**Files:**
- Modify: `app/lib/store.tsx` (add `enrichingTodoId: string | null` to state + a `SET_ENRICHING` action)
- Modify: `app/components/capture/AddCardView.tsx` (dispatch `SET_ENRICHING` on enrich start/finally; remove the in-card pill)
- Modify: `app/components/capture/AddCardView.module.css` (drop `.enhancing`/`.enhanceSpark` — moved)
- Modify: `app/components/todo/TodoListView.tsx` (pass `enrichingId={state.enrichingTodoId}` to TodoList)
- Modify: `app/components/todo/TodoList.tsx` (thread `enrichingId`; pass `enriching={todo.id === enrichingId}` to TodoRow)
- Modify: `app/components/todo/TodoRow.tsx` (+ `.module.css`) (render a small animated `<Spark>` + "Enhancing…" when `enriching`)
- Test: a TodoRow test that the spark shows only when `enriching`.

Reuses the shared `<Spark>` (Task 2) and the twinkle keyframe (move it into `TodoRow.module.css`).

### Task 7: Full verification (CI + Playwright e2e)

**Files:** none (verification only).

- [ ] **Step 1: Run the unit suite**

Run: `npm test`
Expected: PASS (HighlightedInput, Spark, executors, MeetingOffer; trimmed OfferPanel).

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run full CI (Docker up for integration)**

Run: `docker compose up -d && npm run ci`
Expected: PASS.

- [ ] **Step 4: Playwright MCP end-to-end (signed in, :3000)**

Per the spec this journey needs real input injection — drive it in Playwright, not a cmux spot check. Verify:
1. Multi-line: quick-add with Shift+Enter keeps the newline; Enter submits → instant todo.
2. While enriching, the ✨ "Enhancing…" Spark pill animates, then chips appear.
3. Type `send a meeting invite to hansen for 9am to follow up on claudia` → accept the **Meeting** chip → the review card opens in the detail pane directly; the row shows a small "Send invite" pill (no stray ⚡ with a long line).
4. Card shows `✓ Hansen <…>` (resolved on mount), an editable Title, Date+Time, Length; **Send disabled** until Title + Date + Time are filled; set an explicit date and confirm the todo's due date follows it.
5. Tap **Send invite** → calendar event created with the real title; done state shows With / When / Length + "View in Google Calendar". Screenshot-verify (DOM-present ≠ visually-correct).

- [ ] **Step 5: Report results; do NOT push without authorization**

Summarize pass/fail with screenshots. Hold for explicit user authorization before any `git push` (push deploys to prod + runs migrations).

---

## Self-Review

- **Spec coverage:** §0 multi-line → Task 1. §New sparkle → Task 2. §1 review card (gating, contact confirm, due-date sync) → Task 5 (+ backend title in Task 3, prompt nudge in Task 4). §2 affordance (compact pill + open card) → Task 6. §3 booked details + link → Task 5 done-state (+ link round-trip in Task 3). Double-gate: client (Task 5 `canSend`) + server (existing executor `needsField`/`needsDisambiguation`, untouched). No-migration: htmlLink in JSON `actionPayload` (Task 3), dueAt existing column (Task 5). All covered.
- **Type consistency:** `ExecResult.actionLink` (T3) → `FinishResponse.actionLink` (T3) → consumed via `onFinish` result + `reflectFinish` (T3) → `ActionPayload(meeting).htmlLink` rendered in `MeetingOffer` done-state (T5). `resolveContacts(names): Promise<Attendee[]>` defined T5S1, consumed T5S5. `OfferPanelProps.onPatch?: (patch: Partial<Todo>) => void` added T5S2, supplied T5S7, consumed in `MeetingOffer` (T5S5). Row offer uses `eff.cta` (T6S1), which `offerEffect` already returns.
- **Placeholder scan:** none — every code step shows complete code.
- **Ambiguity:** "required fields" pinned to Title + date + time + resolved attendee (`canSend`); Length defaults to 30; due-date sync writes `${date}T00:00:00`.
