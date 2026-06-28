import type { Capture, SavedView, Todo, TodoLabel } from "@/lib/contracts";
import type { TadaState } from "./store";

// A tiny inline SVG "screenshot" so a capture thumbnail is visible in the demo.
const SAMPLE_THUMB =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='%23f0ece3'/%3E%3Crect x='6' y='8' width='28' height='4' rx='2' fill='%23c8632e'/%3E%3Crect x='6' y='18' width='20' height='3' rx='1.5' fill='%235d574d'/%3E%3Crect x='6' y='26' width='24' height='3' rx='1.5' fill='%235d574d'/%3E%3C/svg%3E";

const captures: Record<string, Capture> = {
  "c-1": {
    id: "c-1",
    createdAt: "2026-06-26T09:00:00",
    kind: "image",
    blobPath: SAMPLE_THUMB,
  },
};

// TEMPORARY demo data so the shell is verifiable before live data lands.
// T1.4 replaces this preload with a fetch through the API seam (/api/todos).
const labels: TodoLabel[] = [
  { id: "l-work", name: "work", colorHex: "#c8632e" },
  { id: "l-errand", name: "errand", colorHex: "#5d574d" },
];

const views: SavedView[] = [
  {
    id: "v-work",
    name: "Work",
    colorHex: "#c8632e",
    icon: "briefcase",
    sortIndex: 0,
    criteria: {
      labelIds: ["l-work"],
      dateWindow: "any",
      includeCompleted: false,
    },
  },
  {
    id: "v-errands",
    name: "Errands",
    colorHex: "#8a8a8e",
    icon: "bag",
    sortIndex: 1,
    criteria: {
      labelIds: ["l-errand"],
      dateWindow: "any",
      includeCompleted: false,
    },
  },
];

const todos: Todo[] = [
  {
    id: "t-deck",
    createdAt: "2026-06-26T09:00:00",
    sourceCaptureId: "c-1",
    title: "Email Dakota the Q3 deck",
    detail: "Attach the revised revenue slide before sending.",
    status: "open",
    actionType: "meeting",
    actionPayload: {
      kind: "meeting",
      title: "Q3 review with Dakota",
      attendees: ["dakota@acme.com"],
      start: "2026-06-30T14:00:00",
      durationMin: 30,
    },
    actionState: "proposed",
    sortIndex: 0,
    priority: "p1",
    labelIds: ["l-work"],
  },
  {
    id: "t-deck-1",
    createdAt: "2026-06-26T09:01:00",
    sourceCaptureId: "c-1",
    title: "Revise the revenue slide",
    status: "done",
    actionType: "none",
    actionState: "none",
    sortIndex: 0,
    priority: "none",
    labelIds: [],
    parentId: "t-deck",
  },
  {
    id: "t-deck-2",
    createdAt: "2026-06-26T09:02:00",
    sourceCaptureId: "c-1",
    title: "Proofread the appendix",
    status: "open",
    actionType: "none",
    actionState: "none",
    sortIndex: 1,
    priority: "none",
    labelIds: [],
    parentId: "t-deck",
  },
  {
    id: "t-milk",
    createdAt: "2026-06-26T10:15:00",
    sourceCaptureId: "c-2",
    title: "Buy oat milk",
    status: "open",
    actionType: "none",
    actionState: "none",
    sortIndex: 1,
    priority: "none",
    labelIds: ["l-errand"],
  },
  {
    id: "t-research",
    createdAt: "2026-06-26T11:30:00",
    sourceCaptureId: "c-3",
    title: "Research standing desks under $400",
    status: "open",
    actionType: "research",
    actionPayload: { kind: "research", topic: "standing desks under $400" },
    actionState: "none",
    sortIndex: 2,
    priority: "p2",
    dueAt: "2026-06-27T00:00:00",
    labelIds: ["l-work"],
  },
];

export const seedState: Partial<TadaState> = { todos, views, labels, captures };
