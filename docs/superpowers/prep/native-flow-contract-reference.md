# Tada macOS → TypeScript/Next.js Web Porting Contract

## Overview
**Tada** is a capture-first, single flat pool task manager with AI-powered quick extraction (vision → JSON), one add surface ("All" tab), and pure filter-views for everything else. This document freezes the TS type contracts and behavioral signatures needed to replicate the native app's exact flow.

---

## 1. DATA MODELS

### `Todo` (§10: base task entity)
**File:** `Sources/TadaModels/Todo.swift`

TS interface:
```typescript
interface Todo {
  id: UUID;
  createdAt: Date;
  sourceCaptureId: UUID;
  title: string;           // Imperative, ≤8 words
  detail?: string;
  status: TodoStatus;      // "open" | "done" | "dismissed"
  actionType: ActionType;  // "none" | "calendar" | "reminder"
  actionPayload?: ActionPayload;  // null when actionType == "none"
  actionState: ActionState;  // "none" | "proposed" | "done" | "failed"
  actionExternalId?: string;  // EventKit/Calendar API ID on execution success
  dueAt?: Date;
  sortIndex: number;  // Drag-reorder index; lower sorts first (default: -createdAt.epoch)
  priority: Priority;  // "none" | "p3" | "p2" | "p1" (default: "none")
  listId?: UUID;  // Defaults to Inbox (nil)
  labelIds: UUID[];  // Cross-cutting tags (default: [])
  recurrence?: RecurrenceRule;
  parentId?: UUID;  // One-level subtask nesting
  reminderAt?: Date;  // Local notification time (distinct from dueAt)
}

enum TodoStatus {
  OPEN = "open",
  DONE = "done",
  DISMISSED = "dismissed",
}

enum ActionType {
  NONE = "none",
  CALENDAR = "calendar",
  REMINDER = "reminder",
}

enum ActionState {
  NONE = "none",
  PROPOSED = "proposed",  // Extractor offered; awaiting user tap
  DONE = "done",          // Executed; actionExternalId populated
  FAILED = "failed",      // Execution attempted and failed
}
```

**JSON Coding Keys:**
```json
{
  "id": "UUID",
  "created_at": "Date (ISO8601 with offset)",
  "source_capture_id": "UUID",
  "title": "string",
  "detail": "string?",
  "status": "TodoStatus (string)",
  "action_type": "ActionType (string)",
  "action_payload": "ActionPayload? (see below)",
  "action_state": "ActionState (string)",
  "action_external_id": "string?",
  "due_at": "Date?",
  "sort_index": "number",
  "priority": "Priority (string, default 'none')",
  "list_id": "UUID?",
  "label_ids": "UUID[]",
  "recurrence": "RecurrenceRule?",
  "parent_id": "UUID?",
  "remind_at": "Date?"
}
```

---

### `SavedView` (User-defined filter = "Project")
**File:** `Sources/TadaModels/SavedView.swift`

```typescript
interface SavedView {
  id: UUID;
  name: string;
  colorHex: string;  // e.g. "#5B5BD6"
  sortIndex: number;  // Lower sorts first
  criteria: FilterCriteria;
  icon: string;  // SF Symbol name (default: "line.3.horizontal.decrease.circle")
}
```

**JSON Coding Keys:**
```json
{
  "id": "UUID",
  "name": "string",
  "color_hex": "string",
  "sort_index": "number",
  "criteria": "FilterCriteria",
  "icon": "string (default backfilled)"
}
```

---

### `FilterCriteria` (View-selection filter)
**File:** `Sources/TadaModels/FilterCriteria.swift`

```typescript
interface FilterCriteria {
  labelIds: UUID[];  // ANY-of: todo matches if it has ANY of these labels
  minPriority?: Priority;  // Threshold filter (rank-based)
  dateWindow: DateWindow;  // Coarse date binning
  includeCompleted: boolean;  // Include .done status (default: false)
}

enum DateWindow {
  ANY = "any",      // All times
  TODAY = "today",  // Due today (same calendar day)
  OVERDUE = "overdue",  // Due before start-of-today
  NEXT7 = "next7",  // Due within next 7 days
  NO_DATE = "noDate",  // No due date set (dueAt == nil)
}
```

**Filtering Logic** (§3: deterministic, no side effects):
- Dismiss dismissed todos immediately (never render).
- Exclude done todos unless `includeCompleted`.
- Apply `minPriority` rank threshold (todo.priority.rank >= minPriority.rank).
- Apply label any-of: if `labelIds` is non-empty, todo must have at least one matching label.
- Apply date window:
  - `.any` → pass all.
  - `.noDate` → reject if `dueAt != nil`.
  - `.today` → accept if `dueAt` is same calendar day as `now`.
  - `.overdue` → accept if `dueAt < startOfDay(now)`.
  - `.next7` → accept if `startOfDay(now) <= dueAt < startOfDay(now + 7 days)`.

**JSON:**
```json
{
  "label_ids": "UUID[]",
  "min_priority": "Priority? (null = no threshold)",
  "date_window": "DateWindow (string)",
  "include_completed": "boolean"
}
```

---

### `TodoLabel` (Cross-cutting tag)
**File:** `Sources/TadaModels/TodoLabel.swift`

```typescript
interface TodoLabel {
  id: UUID;
  name: string;  // e.g. "waiting", "errand", "quick"
  colorHex: string;  // e.g. "#FF5733"
}
```

**JSON:**
```json
{
  "id": "UUID",
  "name": "string",
  "color_hex": "string"
}
```

---

### `TodoList` (One-level shallow container)
**File:** `Sources/TadaModels/TodoList.swift`

```typescript
interface TodoList {
  id: UUID;
  name: string;
  colorHex: string;
  sortIndex: number;  // Lower sorts first
  isInbox: boolean;  // True for the default Inbox
}

// Fixed Inbox identity:
const INBOX_ID = UUID("00000000-0000-0000-0000-000000000001");

function inboxList(): TodoList {
  return {
    id: INBOX_ID,
    name: "Inbox",
    colorHex: "#8A8A8E",
    sortIndex: -1,
    isInbox: true,
  };
}
```

**JSON:**
```json
{
  "id": "UUID",
  "name": "string",
  "color_hex": "string",
  "sort_index": "number",
  "is_inbox": "boolean"
}
```

---

### `Priority` (Task urgency, Todoist-style)
**File:** `Sources/TadaModels/Priority.swift`

```typescript
enum Priority {
  NONE = "none",   // rank: 0 (no flag, Todoist P4)
  P3 = "p3",       // rank: 1
  P2 = "p2",       // rank: 2
  P1 = "p1",       // rank: 3 (most urgent, red flag)
}

function priorityRank(p: Priority): number {
  switch (p) {
    case "none": return 0;
    case "p3": return 1;
    case "p2": return 2;
    case "p1": return 3;
  }
}
```

---

### `RecurrenceRule` (Simple shallow recurrence)
**File:** `Sources/TadaModels/RecurrenceRule.swift`

```typescript
interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  interval: number;  // Every N units (default 1); ≥ 1 after clamping
  weekday?: number;  // 1=Sunday … 7=Saturday (Calendar component), for weekly anchoring
}

enum RecurrenceFrequency {
  DAILY = "daily",
  WEEKLY = "weekly",
  MONTHLY = "monthly",
  YEARLY = "yearly",
}
```

**Note:** No RRULE language. Next occurrence is computed by `RecurrenceEngine.nextOccurrence()`.

**JSON:**
```json
{
  "frequency": "RecurrenceFrequency (string)",
  "interval": "number",
  "weekday": "number? (1-7)"
}
```

---

### `ActionPayload` (§6: extractor → execution contract)
**File:** `Sources/TadaModels/ActionPayload.swift`

Two variants, tagged in persistence (not in §6 wire format):

#### **CalendarActionPayload**
```typescript
interface CalendarActionPayload {
  title: string;
  attendees?: string[];  // Names or email addresses
  start?: string;  // ISO8601 local datetime "yyyy-MM-dd'T'HH:mm:ss" (no offset), or null
  durationMin: number;  // Default 30
  notes?: string;
}
```

**JSON:**
```json
{
  "title": "string",
  "attendees": "[string]?",
  "start": "string (ISO8601 local, no offset)?",
  "duration_min": "number",
  "notes": "string?"
}
```

#### **ReminderActionPayload**
```typescript
interface ReminderActionPayload {
  text: string;
  remindAt?: string;  // ISO8601 local datetime (no offset), or null
}
```

**JSON:**
```json
{
  "text": "string",
  "remind_at": "string (ISO8601 local)?",
}
```

#### **ActionPayload Enum** (Tagged variant in persistence)
On the wire (§6 extractor output), the payload is a bare object; variant is named by `action_type`.
In persistence (§10), it is tagged:

```typescript
type ActionPayload =
  | { type: "calendar"; calendar: CalendarActionPayload }
  | { type: "reminder"; reminder: ReminderActionPayload };
```

---

### `Capture` (Screenshot + note, pre-extraction)
**File:** `Sources/TadaModels/Capture.swift`

```typescript
interface Capture {
  id: UUID;
  createdAt: Date;
  screenshotPath: string;  // Absolute or Application-Support-relative path to PNG
  note?: string;  // User-typed annotation from capture overlay
}
```

**JSON:**
```json
{
  "id": "UUID",
  "created_at": "Date (ISO8601 with offset)",
  "screenshot_path": "string",
  "note": "string?"
}
```

---

### `TadaDate` (Canonical datetime format)
**File:** `Sources/TadaModels/TadaDate.swift`

Extractor outputs **offset-less local timestamps** in format `"yyyy-MM-dd'T'HH:mm:ss"`.
These are interpreted in the user's local timezone (no UTC offset).

**TS helpers:**
```typescript
class TadaDate {
  // Parse "yyyy-MM-dd'T'HH:mm:ss" → Date (local tz)
  static parse(s: string): Date | null;
  
  // Format Date → "yyyy-MM-dd'T'HH:mm:ss"
  static string(from: Date): string;
  
  // Friendly display: "Jun 23, 2026, 2:00 PM"
  static display(s: string): string;
}
```

---

### `FractionalIndex` (Drag-reorder)
**File:** `Sources/TadaModels/FractionalIndex.swift`

One-off drag update (no re-sequence):
```typescript
function between(
  before: number | null,
  after: number | null
): number {
  if (before !== null && after !== null) return (before + after) / 2;
  if (before === null && after !== null) return after - 1;
  if (before !== null && after === null) return before + 1;
  return 0;  // Empty list
}
```

Used to compute `todo.sortIndex` when a todo is dropped between two neighbors.

---

## 2. FILTERING

### `FilterEngine` (Pure filter application)
**File:** `Sources/TadaModels/FilterEngine.swift`

```typescript
class FilterEngine {
  static apply(
    criteria: FilterCriteria,
    todos: Todo[],
    now: Date,
    calendar: Calendar = Calendar.current
  ): Todo[] {
    return todos.filter(t => this.matches(t, criteria, now, calendar));
  }

  private static matches(
    t: Todo,
    c: FilterCriteria,
    now: Date,
    calendar: Calendar
  ): boolean {
    // Step 1: Never render dismissed
    if (t.status === "dismissed") return false;
    
    // Step 2: Exclude done unless includeCompleted
    if (t.status === "done" && !c.includeCompleted) return false;
    
    // Step 3: Priority threshold (rank-based)
    if (c.minPriority) {
      if (t.priority.rank < c.minPriority.rank) return false;
    }
    
    // Step 4: Label any-of
    if (c.labelIds.length > 0) {
      const todoLabelSet = new Set(t.labelIds);
      const criteriaLabelSet = new Set(c.labelIds);
      if (todoLabelSet.isDisjoint(criteriaLabelSet)) return false;  // No intersection
    }
    
    // Step 5: Date window
    switch (c.dateWindow) {
      case "any":
        break;
      case "noDate":
        if (t.dueAt !== null) return false;
        break;
      case "today":
        if (!t.dueAt || !calendar.isDate(t.dueAt, inSameDayAs: now)) {
          return false;
        }
        break;
      case "overdue":
        if (!t.dueAt || t.dueAt >= calendar.startOfDay(now)) {
          return false;
        }
        break;
      case "next7":
        if (!t.dueAt) return false;
        const endOfWindow = calendar.date(byAdding: .day, value: 7, to: calendar.startOfDay(now));
        if (t.dueAt < calendar.startOfDay(now) || t.dueAt >= endOfWindow) {
          return false;
        }
        break;
    }
    
    return true;
  }
}
```

### `ViewSelection` Mapping
**File:** `Sources/TadaUI/ViewModels/ViewsViewModel.swift`

```typescript
enum ViewSelection {
  ALL = "all",
  TODAY = "today",
  PROJECT = "project",  // Parametrized by SavedView ID
  LABEL = "label",      // Parametrized by TodoLabel ID
}

function criteriaFor(selection: ViewSelection): FilterCriteria {
  switch (selection) {
    case ALL:
      return new FilterCriteria();  // .any date, no labels, no priority
    case TODAY:
      return new FilterCriteria({ dateWindow: "today" });
    case PROJECT(id):
      // Fetch SavedView by id, return its criteria; fallback to .all if not found
    case LABEL(id):
      // Fetch TodoLabel by id, return criteria with that labelId (any-of)
      return new FilterCriteria({ labelIds: [id] });
  }
}
```

---

## 3. QUICK ADD PARSING

### `QuickAddParser` (Local, NLP stub for Phase 0)
**File:** `Sources/TadaExtractor/QuickAddParser.swift`

Recognized tokens (stripped from title):

| Token | Pattern | Resolution |
|-------|---------|-----------|
| Priority | `p1`, `p2`, `p3` (case-insensitive) | Maps to `Priority` enum; `p4` → `.none` |
| Label | `@labelname` | Extracted; resolved as cross-cutting tag |
| List | `#listname` | Extracted; resolved to TodoList (Inbox if not found) |
| Date | `today`, `tomorrow`/`tmr`, weekday names, ISO `yyyy-MM-dd` | Resolved to start-of-day unless time appended |
| Recurrence | `every <unit \| weekday>` | Scanned before date words to avoid consuming weekday independently |

**Signature:**
```typescript
class QuickAddParser {
  static parse(
    text: string,
    now: Date = new Date(),
    calendar: Calendar = Calendar.current
  ): ParsedQuickAdd {
    // Scan for recurrence FIRST (to avoid consuming "monday" independently)
    // Then priority, labels, list, dates
    // Return remaining as title
  }

  private static resolveDate(
    word: string,
    now: Date,
    calendar: Calendar
  ): Date | null {
    // "today", "tomorrow"/"tmr" → relative offsets
    // Weekday names → next occurrence (offset > 0)
    // ISO dates → parsed directly
    // Result: start-of-day midnight (caller can layer default time if needed)
  }

  private static resolveRecurrence(word: string): RecurrenceRule | null {
    // "day"/"daily" → RecurrenceRule(frequency: .daily)
    // "week"/"weekly" → RecurrenceRule(frequency: .weekly)
    // "month"/"monthly" → RecurrenceRule(frequency: .monthly)
    // "year"/"yearly" → RecurrenceRule(frequency: .yearly)
    // Weekday names → RecurrenceRule(frequency: .weekly, weekday: N)
  }
}
```

**Output:**
```typescript
interface ParsedQuickAdd {
  title: string;  // Remaining text after token stripping
  dueAt?: Date;   // Resolved date
  priority: Priority;  // Default .none
  labelNames: string[];  // User-typed label names (need ID resolution)
  listName?: string;   // User-typed list name
  recurrence?: RecurrenceRule;
  tokens: Token[];  // For live inline highlighting (character offsets)
}

interface Token {
  kind: "date" | "priority" | "label" | "list";
  start: number;  // Character offset in original string
  length: number;
}
```

**Live Highlighting:** `tokens` carry byte offsets for AttributedString-style inline coloring as the user types.

---

## 4. RECURRENCE

### `RecurrenceEngine` (Next occurrence math)
**File:** `Sources/TadaModels/RecurrenceEngine.swift`

```typescript
class RecurrenceEngine {
  static nextOccurrence(
    after: Date,
    rule: RecurrenceRule,
    calendar: Calendar = Calendar.current
  ): Date | null {
    const components: DateComponents = {};
    
    switch (rule.frequency) {
      case "daily":
        components.day = rule.interval;
        break;
      case "weekly":
        components.day = 7 * rule.interval;
        break;
      case "monthly":
        components.month = rule.interval;
        break;
      case "yearly":
        components.year = rule.interval;
        break;
    }
    
    return calendar.date(byAdding: components, to: after);
  }
}
```

**Behavior:** Pure date arithmetic. No state, no side effects. Deterministic given injected `Calendar`.

---

## 5. EXTRACTOR CONTRACT (§6)

### ExtractorIO (Boundary types)
**File:** `Sources/TadaExtractor/ExtractorIO.swift`

#### **ExtractorInput** (Request)
```typescript
interface ExtractorInput {
  image: string;  // Base64-encoded PNG
  note?: string;  // User annotation from capture overlay
  existingOpenTitles: string[];  // For dedupe check (duplicate_of matching)
  existingLists: string[];  // User's list names (AI proposes from real taxonomy)
  existingLabels: string[];  // User's label names
}
```

**JSON:**
```json
{
  "image": "string (base64)",
  "note": "string?",
  "existing_open_titles": "string[]",
  "existing_lists": "string[]",
  "existing_labels": "string[]"
}
```

#### **ExtractorOutput** (Response)
```typescript
interface ExtractorOutput {
  todos: ExtractedTodo[];  // Zero todos is valid
}
```

#### **ExtractedTodo** (Individual todo from extraction)
```typescript
interface ExtractedTodo {
  title: string;  // Imperative, ≤8 words
  detail?: string;
  actionType: ActionType;  // "none" | "calendar" | "reminder"
  actionPayload?: BareActionPayload;  // Null when actionType == "none"
  duplicateOf?: string;  // Matching existing title ⇒ app skips creating
  suggestedListName?: string;  // AI-proposed list (map to existing/create)
  suggestedLabels: string[];  // AI-proposed label names
  suggestedPriority?: Priority;
  suggestedDueAt?: string;  // ISO8601 local "yyyy-MM-dd'T'HH:mm:ss" or null
  recurrenceText?: string;  // Raw phrase like "every monday" for QuickAddParser
}
```

**Wire-format action_payload** (on-the-wire variant, NOT tagged):
```typescript
type BareActionPayload =
  | { title: string; attendees?: string[]; start?: string; duration_min: number; notes?: string }
  | { text: string; remind_at?: string };
```

**JSON:**
```json
{
  "title": "string",
  "detail": "string?",
  "action_type": "ActionType (string)",
  "action_payload": "bare object or null",
  "duplicate_of": "string?",
  "suggested_list": "string?",
  "suggested_labels": "string[]",
  "suggested_priority": "Priority? (string)",
  "suggested_due_at": "string (ISO8601 local)?",
  "recurrence_text": "string?"
}
```

### ExtractorClient (Protocol)
**File:** `Sources/TadaExtractor/ExtractorClient.swift`

```typescript
interface ExtractorClient {
  extract(input: ExtractorInput): Promise<ExtractorOutput>;
  
  // Identifies provider for routing/test assertions (e.g. "anthropicKey", "ollama")
  readonly kindTag: string;
}

enum ExtractorError {
  NOT_IMPLEMENTED = "notImplemented",
  MALFORMED_JSON = "malformedJSON",  // Includes error message
  TIMEOUT = "timeout",
  OFFLINE = "offline",
  TRANSPORT = "transport",  // Includes HTTP message
}
```

### LiveExtractorClient (Claude Vision API)
**File:** `Sources/TadaExtractor/ExtractorClient.swift` (impl)

Calls Anthropic Messages API:
- Model: `claude-opus-4-5` (overridable via `TADA_CLAUDE_MODEL` env)
- Timeout: 30 seconds
- Max tokens: 1024
- Vision: `image/png` base64
- System prompt: `ExtractionPrompt.system` (frozen)
- Strips markdown fence `\`\`\`json ... \`\`\`` if model wraps output

```typescript
class LiveExtractorClient implements ExtractorClient {
  kindTag = "anthropicKey";
  
  private apiURL = "https://api.anthropic.com/v1/messages";
  private anthropicVersion = "2023-06-01";
  private timeoutSeconds = 30;
  
  constructor(apiKeyOrNull?: string) {
    // apiKeyOverride if provided, else env var TADA_CLAUDE_API_KEY, else ~/.tada/config.json
  }
  
  async extract(input: ExtractorInput): Promise<ExtractorOutput> {
    // Build request with system prompt, image, user message
    // POST to Anthropic API
    // Extract text from response content[0]
    // Strip markdown, parse JSON
    // Throw ExtractorError on failure
  }
}
```

### ExtractionPrompt (System instruction)
**File:** `Sources/TadaExtractor/ExtractionPrompt.swift`

**Frozen system prompt encoding the §6 contract:**

Key constraints (non-negotiable):
1. **Single task maximum** — At most ONE actionable item from full-screen OCR.
2. **Ignore UI chrome** — Menu bars, code editors, terminal, scrollbars.
3. **Never invent action** — Default `action_type: "none"` unless clear/unambiguous calendar/reminder signal.
4. **Never invent time** — Only emit `start`/`remind_at` if explicit time appears; else null.
5. **Dedupe by title** — Match against `existing_open_titles`; if match, set `duplicate_of`.
6. **Auto-organize** — Propose `suggested_list`, `suggested_labels`, `suggested_priority`, `suggested_due_at`, `recurrence_text` from user's real taxonomy.

**Calendar action criteria:** "meeting/event being explicitly proposed" (e.g. "Can we meet Tuesday at 2pm?").
**Reminder action criteria:** "explicit deadline or 'remind me'" phrasing.

---

### DedupeFilter (Post-extraction dedup)
```typescript
class DedupeFilter {
  static apply(
    output: ExtractorOutput,
    existingOpenTitles: string[]
  ): ExtractedTodo[] {
    const openSet = new Set(existingOpenTitles);
    return output.todos.filter(todo => {
      if (!todo.duplicateOf) return true;
      return !openSet.has(todo.duplicateOf);
    });
  }
}
```

---

## 6. ACTION EXECUTION (§7)

### ActionExecutor (Execute an action)
**File:** `Sources/TadaExecution/ActionExecutor.swift`

```typescript
class ActionExecutor {
  static async execute(
    todo: Todo,
    using service: EventKitService
  ): Promise<Todo> {
    const updated = { ...todo };
    try {
      switch (todo.actionPayload) {
        case .calendar(payload):
          const id = await service.createCalendarEvent(payload);
          updated.actionState = "done";
          updated.actionExternalId = id;
          break;
        case .reminder(payload):
          const id = await service.createReminder(payload);
          updated.actionState = "done";
          updated.actionExternalId = id;
          break;
        case null:
          break;  // Nothing to execute
      }
    } catch (err) {
      // §7.5, §9: on failure, surface state, leave todo open
      updated.actionState = "failed";
      // status stays .open, actionExternalId stays null
    }
    return updated;
  }

  static async executeDetailed(
    todo: Todo,
    using service: EventKitService
  ): Promise<ExecutionOutcome> {
    // Like execute(), but maps ExecutionError → human-readable failureReason
    // Used by UI to show "Calendar access denied. Open Settings → Privacy → Calendars."
  }
}

interface ExecutionOutcome {
  todo: Todo;
  failureReason?: string;  // null on success
}
```

### EventKitService (Protocol for calendar/reminders)
**File:** `Sources/TadaExecution/EventKitService.swift`

```typescript
interface EventKitService {
  // Query access status (no prompt)
  calendarAccessStatus(): AccessStatus;
  reminderAccessStatus(): AccessStatus;
  
  // Request access (shows OS prompt if not yet determined)
  requestCalendarAccess(): Promise<AccessStatus>;
  requestReminderAccess(): Promise<AccessStatus>;
  
  // Execute: create event/reminder on the default calendar
  // Returns: EventKit identifier for persistence on todo.actionExternalId
  // Throws: ExecutionError
  createCalendarEvent(payload: CalendarActionPayload): Promise<string>;
  createReminder(payload: ReminderActionPayload): Promise<string>;
}

enum AccessStatus {
  NOT_DETERMINED = "notDetermined",
  DENIED = "denied",
  AUTHORIZED = "authorized",
}

enum ExecutionError {
  NOT_IMPLEMENTED = "notImplemented",
  PERMISSION_DENIED = "permissionDenied",  // Calendar/Reminders access not granted
  MISSING_ESSENTIAL_FIELD = "missingEssentialField",  // Includes field name
  EVENT_KIT_FAILURE = "eventKitFailure",  // Includes error message
}
```

**Behavior:**
- On first execute: request access if `notDetermined` (shows OS prompt).
- Then guard: must be `authorized` or throw `permissionDenied`.
- Create event with title, notes, start date, duration, attendees (if present).
- Create reminder with text and alarm date (if present).
- Return EventKit identifier (persisted as `actionExternalId`).

### NotificationScheduler (Local notifications)
**File:** `Sources/TadaExecution/NotificationScheduler.swift`

```typescript
interface NotificationScheduler {
  requestAuthorization(): Promise<boolean>;
  schedule(todoId: UUID, title: string, fireAt: Date): Promise<void>;
  cancel(todoId: UUID): Promise<void>;
}

enum NotificationError {
  NOT_IMPLEMENTED = "notImplemented",
  NOT_AUTHORIZED = "notAuthorized",
  SCHEDULING_FAILED = "schedulingFailed",  // Includes error message
}
```

Fire time is computed by caller: `reminderAt ?? dueAt`.

---

## 7. UI BEHAVIORS & ADD-CARD FLOW

### AddTaskCardViewModel (Draft state manager)
**File:** `Sources/TadaUI/ViewModels/AddTaskCardViewModel.swift`

```typescript
@MainActor
class AddTaskCardViewModel {
  @Published rawText: string = "";  // Raw user input
  @Published dueAt?: Date;
  @Published priority: Priority = .none;
  @Published labelNames: string[] = [];  // Lowercased, deduped
  @Published isThinking: boolean = false;  // "✨ Tada is organizing…"
  @Published showCard: boolean = false;  // Card visibility (set by CaptureCoordinator)
  
  cleanTitle: string = "";  // Title after stripping tokens

  // Called on every keystroke; runs QuickAddParser, syncs pill state
  reparse(): void;
  
  // Apply AI suggestions from ExtractedTodo
  // Folds suggestedListName into labelNames (flat pool — no containers)
  applyAISuggestions(e: ExtractedTodo): void;
  
  // Pre-fill labels from active project view's label constraints
  seedLabels(names: string[]): void;
  
  // Clear all draft state (post-submit)
  reset(): void;
  
  // Pre-fill from capture note; request card to appear; set isThinking
  prefillFromCapture(note: string): void;
}
```

**Add-card data flow:**
1. User types → `rawText` bound to TextField → `onChange` calls `reparse()`.
2. `reparse()` runs `QuickAddParser.parse(rawText)` → extracts title, dueAt, priority, labelNames, tokens.
3. `cleanTitle` set to remaining text (UI displays for preview).
4. Pills (date/priority/labels/reminder) updated immediately.
5. **AI enrichment (async):** Extractor returns `ExtractedTodo` → call `applyAISuggestions()` → folds suggestions into pills, clears `isThinking`.
6. **Submit:** Caller (`TodoListViewModel.createFromDraft()`) reads final pill state, creates Todo, calls `reset()`.

### AddTaskCardView (UI)
**File:** `Sources/TadaUI/Views/AddTask/AddTaskCardView.swift`

Layout:
- Title TextField (bound to `vm.rawText`, `onChange` → `reparse()`).
- Optional description field (revealed on focus or non-empty).
- **Pill row:** Date · Priority · Labels · Reminder (interactive, opens pickers).
- **Thinking row:** "✨ Tada is organizing…" (pulsing dot) when `vm.isThinking`.
- **Bottom bar:** Active view name (left) + Cancel · Add buttons (right).
- Return submits (card stays open for rapid add).
- Disabled Add when `rawText.trimmed.isEmpty`.

**Key behaviors:**
- Title auto-focused on appear.
- Description field collapses when empty and unfocused.
- Return key → submit if non-empty; card does NOT auto-dismiss (caller controls).
- Thinking row animates in/out.

### TodoDetailView (Right-hand notebook pane)
**File:** `Sources/TadaUI/Views/Detail/TodoDetailView.swift`

Layout (freshet-influenced):
- **Header:** "Mark done" button (left) + close button (right).
- **Title:** Large serif, no label, no box.
- **Properties row:** Inline pills for priority, dueAt, labelIds (each opens popover for editing).
- **Divider + Notes section:** Write/Preview toggle for markdown.
  - Write: monospaced TextEditor with syntax highlighting.
  - Preview: rendered GFM (headings, lists, code blocks, blockquotes, bold/italic).
- **Action section:** `OfferView` (only if `actionType != .none`).
- **Screenshot section:** Thumbnail of source capture (if present).
- **Metadata row:** Created date, Status (open/done/dismissed).

**Edit behaviors:**
- Title and detail auto-save on `onDisappear` and explicit save.
- Priority/dueAt/labelIds: inline popover editing; persist immediately (`onUpdateProperties` callback).
- Label picker: search, toggle selection, create new labels (matches add-card picker).

### CommandPaletteView (⌘K search)
**File:** `Sources/TadaUI/Views/CommandPalette/CommandPaletteView.swift`

Layout:
- Search field (focused on appear, Return = select first result).
- Result list (ranked: views, labels, todos).
- Keyboard: ↑/↓ to navigate, Return to select, Esc to dismiss.

**Result routing:**
- `.view(selection, name)` → `viewsVM.selection = selection` → dismiss.
- `.label(label)` → `viewsVM.selection = .label(label.id)` → dismiss.
- `.todo(todo)` → `onSelectTodo(todo)` → dismiss.

### OfferView (Action execution pill)
**File:** `Sources/TadaUI/Views/MainWindow/OfferView.swift`

States:

| State | UI |
|-------|-----|
| `.proposed` (start present) | Accent pill button: "⚡ Book 30m with Dakota · Jun 23, 2 PM" |
| `.proposed` (start missing, calendar) | Inline time field: "When? e.g. Tue 2pm" + submit arrow |
| `.done` | Green checkmark: "Done" |
| `.failed` | Red error message + "Open Settings" link (if permissions) + Retry button |
| `.none` | Hidden |

**Offer label construction (§7.3):**
- Calendar: `"Book {durationMin}m [with {first attendee}] [· {TadaDate.display(start)}]"`
- Reminder: `"Remind: {text} [· {TadaDate.display(remindAt)}]"`

**Inline time field (§7.4):**
- Shown only when calendar action lacks `start` (missing essential field).
- Resolves user input via `QuickAddParser.resolveDate()`.
- On submit, calls `onExecute(trimmedInput)` with resolved date.

---

## 8. KEY UI INTERACTIONS

### Add-Card Submit Flow
1. User types title + tokens (date, priority, labels).
2. `reparse()` strips tokens, updates pills.
3. Capture triggers enrichment → `applyAISuggestions()` → UI shows "thinking" row.
4. User hits Return or clicks "Add task".
5. Caller reads final `rawText`, `cleanTitle`, `dueAt`, `priority`, `labelNames`.
6. Create `Todo` with resolved list/label IDs.
7. Call `vm.reset()` → clears all draft state.
8. Card remains visible for rapid add (caller dismisses when done).

### Detail Pane Editing
1. Click a property pill (priority, date, labels) → popover opens.
2. Select/edit → persists immediately via `onUpdateProperties` callback.
3. Title/detail: keystroke-driven; saved on blur or explicit save.
4. Notes markdown toggle: auto-save on mode switch (blur-to-render).

### Command Palette Routing
1. ⌘K opens palette, search field focused.
2. Type query → results ranked (views first, labels, todos).
3. ↑/↓ navigate, Return selects → dismisses, routes to selection handler.
4. Esc dismisses without selection.

---

## 9. KEY INVARIANTS

1. **One flat pool:** All todos in a single collection; no nesting (except one-level parentId for subtasks).
2. **Add surface is "All":** Only the Inbox/All tab allows direct todo creation.
3. **Everything else is read-only filter:** SavedViews and label taps are pure filters, no moves/creates.
4. **Capture-first:** Captures persisted before extraction; failed extraction leaves plain todo standing (§9).
5. **Action is user-gated:** `ActionState.proposed` awaits explicit tap; never self-executes.
6. **Deterministic filtering:** `FilterEngine.apply()` is pure; no side effects.
7. **Local timezone:** Extractor timestamps are offset-less; interpreted in user's `TimeZone.current`.
8. **Dedupe by title:** `duplicate_of` set ⇒ app skips creating todo.

---

## 10. MIGRATION PATH: Swift → TypeScript

### Type mapping:
```
Swift UUID                          → TypeScript string (UUID format)
Swift Date (ISO8601 with offset)   → TypeScript Date | ISO8601 string
Swift Sendable (thread-safe)       → (no direct analog in TS; use immutability)
Swift @Published (reactive)        → TypeScript React state hooks / Zustand / Jotai
Swift @MainActor (UI thread)       → TypeScript async/await + event loop awareness
Swift Optional<T> (T?)             → TypeScript T | undefined | null
Swift enum (string-backed)         → TypeScript enum | union type
Swift struct (Codable)             → TypeScript interface + JSON.parse/stringify
```

### Service implementations:
- **ExtractorClient:** Implement against Gemini API (image → JSON) or keep Anthropic if API key available.
- **EventKitService:** Map to Google Calendar API (web) or stub for MVP.
- **NotificationScheduler:** Map to browser Notification API or email digest.
- **Store:** SQLite / PostgreSQL with ORM (Prisma, Drizzle) for persistence.

---

## 11. REFERENCE: Concrete Signatures

### Create a todo from quick-add:
```typescript
async function createFromQuickAdd(
  rawText: string,
  activeViewSelection: ViewSelection,
  store: TadaStore
): Promise<Todo> {
  const parsed = QuickAddParser.parse(rawText);
  
  // Resolve list
  const list = parsed.listName
    ? await store.listByName(parsed.listName) ?? createInbox()
    : inboxList();
  
  // Resolve labels
  const labelIds = await Promise.all(
    parsed.labelNames.map(name =>
      store.labelByName(name).then(l => l?.id ?? createLabel(name).then(l => l.id))
    )
  );
  
  const todo = new Todo({
    id: UUID(),
    createdAt: new Date(),
    sourceCaptureId: captureId,  // From capture context
    title: parsed.title,
    status: "open",
    dueAt: parsed.dueAt,
    priority: parsed.priority,
    listId: list.id,
    labelIds,
    recurrence: parsed.recurrence,
  });
  
  return await store.createTodo(todo);
}
```

### Filter and render todos for a view:
```typescript
function todosForSelection(
  selection: ViewSelection,
  allTodos: Todo[],
  viewsVM: ViewsVM,
  now: Date
): Todo[] {
  const criteria = viewsVM.criteriaFor(selection);
  return FilterEngine.apply(criteria, allTodos, now)
    .sort((a, b) => a.sortIndex - b.sortIndex);  // Drag-order
}
```

### Execute an action:
```typescript
async function executeAction(
  todo: Todo,
  service: EventKitService,
  inlineTimeString?: string
): Promise<ExecutionOutcome> {
  // If calendar action and start is missing, resolve inlineTimeString
  if (todo.actionPayload?.type === "calendar" && !todo.actionPayload.calendar.start && inlineTimeString) {
    const resolvedDate = QuickAddParser.resolveDate(inlineTimeString, new Date());
    // Update todo.actionPayload.calendar.start before execution
  }
  
  return await ActionExecutor.executeDetailed(todo, service);
}
```

---

**Document complete. Ready for TS contract freeze and implementation.**
