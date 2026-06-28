# Quick-Add Golden Flow — Design Spec

**Date:** 2026-06-27
**Status:** Draft for review
**Scope:** Polish the capture → enrich → meeting flow in the quick-add card. One cohesive flow, one spec. Schema redesign is explicitly out of scope (deferred by the user).

---

## Why

The quick-add card (`AddCardView`, shown in **All**) is the capture hero: type → an instant
plain todo lands → an async Gemini "enrich" pass offers suggestion chips → accepting the **Meeting**
chip turns the todo into an actionable meeting → tapping books it. Driving it with a real prompt
(`send a meeting invite to hansen for 9am to follow up on claudia`) exposed that the flow is rough
end-to-end: the input is cramped, the meeting is under-specified yet sends anyway, the action shows
up as a stray button, and nothing confirms what got booked. This spec makes the flow feel finished.

## Locked decisions (already agreed)

1. **Full editable meeting review card**, with **Send gated** until the required fields are present.
2. **Always show + confirm the resolved contact before Send** — even a unique match is displayed
   (softens the old "unique match books straight through"; no silent booking).
3. **Affordance = 1+2 hybrid:** the list row shows a *small, deliberate* "Send invite" pill (not a
   stray ⚡, not the full card crammed into the list); the **full editable card lives in the right
   detail pane**, which auto-opens when the Meeting chip is accepted.

These hold the product invariant: *the offer shows the concrete effect; the tap is the confirmation;
nothing auto-executes.*

---

## What we're changing, by the points raised

### 0 · Multi-line capture input
The single-line quick-add field becomes an **auto-growing textarea** (1 row → grows to ~6 rows, then
scrolls). **Enter** adds the todo; **Shift+Enter** inserts a newline. The live token highlight
(priority / label / date colors) keeps aligning as text wraps.

### New · "Enhancing…" sparkle while AI enriches
Capture stays instant — the deterministic plain todo lands immediately, the model is never in the hot
path. The moment the async enrich pass starts, a small **✨ Enhancing…** indicator appears **on the
just-added todo row** (the row being enriched, in the All list — NOT in the add card) with the brand
ta-da spark animating; it disappears when the suggestion chips arrive (or the pass fails silently).
The "which todo is enriching" state rides in the store so the row can render it. The existing inline `<Spark>` glyph (today defined in the landing page) is promoted
to a shared component and reused here. Animation respects `prefers-reduced-motion`.

### 1 · The meeting review card (core fix)
An editable card in the detail pane with the meeting's fields — **Title · When (date + time) · With ·
Length** — resolving every sub-issue:

- **Invented day / empty title:** date and time are explicit, editable fields the user confirms; the
  title pre-fills from a cleaned event title and is editable. A half-guessed meeting never sends
  silently.
- **Attendee not confirmed:** on open, the raw name ("hansen") is resolved against the user's Google
  contacts and shown as **✓ Hansen &lt;hansen@…&gt;** — even on a unique match. Ambiguous → a candidate
  picker; no match → an inline email field.
- **Required-field gating:** **Send invite stays disabled** until the *required* fields are valid.

**Required vs optional fields.** Required (Send impossible without all of them): **Title**, a full
**When = date + time**, and **one resolved attendee** (with an email). Defaulted, never blocking:
**Length** (30 min). Optional: notes. The tap remains the only thing that books.

**Persistence + double gate.** Every edit in the card is **persisted to the backend as the user makes
it** — through the existing PATCH-the-todo channel that updates the stored action payload (the same
path the detail pane already uses). The gate is then enforced in **two** independent places: the
client disables Send, **and** the server executor refuses to book a meeting that is missing a time or
has an unresolved attendee. An incomplete meeting cannot be booked even if the client were bypassed —
never-auto-execute, belt and suspenders.

**Due date = meeting date.** For a meeting todo, the meeting's start date *is* the todo's due date —
they are the same concept. Confirming **When** in the card drives the todo's due date, so the two
cannot drift apart. (The original "due 6/28 but booked Monday" bug was exactly these two fields, which
the enrich pass had produced independently, diverging.) One date, one source of truth.

### 2 · The meeting affordance (1+2 hybrid)
When enrichment detects a meeting and the user accepts the chip:
- the freshly-added row shows a **small "Send invite" pill** — compact and intentional, replacing the
  stray ⚡ — as the re-entry point;
- the app **auto-opens the right detail pane** onto the review card (section 1), so the user lands on
  the card directly instead of hunting for a button.

### 3 · Booked details after send
The done state stops showing only "✓ Invite sent" + the raw title. It shows the **concrete booked
details** — With (email), When (date/time), Length — plus a **"View in Google Calendar"** link.

### Baked-in correctness fixes (called out so they're not surprises)
- The calendar invite now goes out with a **real title** (today it can send titleless, because the
  event summary reads an empty payload field).
- The enrichment prompt gets a nudge to **stop fabricating a weekday** when only a clock time is given,
  and to always set a concise event title. The card remains the real guarantee; this improves the
  pre-fill.

---

## Architecture & components

The change is mostly front-end, behind existing seams; the back-end touch is small and migration-free.

- **`HighlightedInput`** (capture) — swap the `<input>` for an auto-growing `<textarea>`; keep the
  highlight backdrop. *What it does:* the capture text field. *Depends on:* the deterministic
  `parseQuickAdd` tokens (unchanged).
- **`Spark`** (new shared brand component) — the four-point ta-da glyph, promoted from the landing
  page. *Used by:* landing page + the new enriching indicator.
- **`AddCardView`** (capture) — adds an `enriching` state driving the sparkle pill, and opens the
  detail pane when an action chip is accepted. *Depends on:* the enrich API (unchanged), the store.
- **`MeetingOffer`** (new, focused component) — the editable review card. Owns field editing,
  contact resolution on open, the Send gate, and the booked-details done state. *Depends on:*
  `POST /api/contacts/resolve` (already exists) via a thin `resolveContacts()` client wrapper, and
  the existing finish endpoint. The shared `OfferPanel` delegates `actionType === "meeting"` to it;
  reminder/research stay in `OfferPanel` unchanged. Splitting meetings into their own file keeps each
  component small and independently testable.
- **Back-end (deterministic executor + contracts):** the meeting executor sends a non-empty title and
  returns the created event's calendar link; the link is carried back through the finish result and
  stored inside the existing **JSON action payload field** — **no Prisma schema migration**.

### Data flow (meeting path)
`type in quick-add` → instant plain todo → enrich pass (✨) → accept **Meeting** chip → todo becomes a
meeting + **detail pane opens** → card resolves the contact (✓ shown) → user confirms title/date/time
→ **Send invite** (gated) → executor books via Google Calendar → done state shows booked details +
calendar link. Every step is explicit; nothing books without the Send tap.

## Error handling
- Enrichment failures are silent (best-effort) — the plain todo already exists; the sparkle just
  clears. Capture is never blocked.
- Contact resolution failure → the attendee stays unresolved and Send stays gated; the user can pick a
  candidate or type an email.
- Booking failure → an inline error on the card with a retry; the todo stays open (finishing an action
  ≠ completing the todo).

## Testing
- Unit: textarea Enter/Shift+Enter behavior; the shared `Spark`; the meeting card's gating,
  resolve-on-open, and done-state details; the executor's non-empty title + returned link.
- End-to-end (Playwright, signed in): multi-line capture; the sparkle during enrich; accept Meeting →
  card opens; resolved contact shown; Send disabled until valid; Send → booked details + calendar
  link. (This journey needs real input injection — not a cmux spot check.)
- Gate: `npm run ci` green before any push. No push without explicit authorization (push deploys to
  prod + runs migrations).

## Out of scope
- **The data-model *redesign*** the user is returning to later (restructuring tables/columns,
  possibly promoting action fields out of the JSON blob). **This pass needs no schema migration:**
  `actionPayload` is already a `Json?` column, so the meeting fields and the new `htmlLink` live
  inside it; `dueAt` is already a column. Verified against `prisma/schema.prisma` — no `prisma
  migrate`, no deploy-time migration. Being migration-free, this work won't collide with the later
  redesign.
- Reminder and research offer surfaces (unchanged).
- Voice/chat meeting paths beyond what already shares `OfferPanel` (the card is shared, so they
  inherit it for free, but they're not the focus of this pass).
