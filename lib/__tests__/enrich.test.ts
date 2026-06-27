// @vitest-environment node
// T2.5 — quick-add enrichment pipeline. Non-creating: runs the extractor over the
// typed text and RETURNS suggestions (the instant quick-add todo already exists
// via POST /api/todos). Store + extractor mocked; unlimited user → withQuota
// short-circuits (no DB).
import { describe, expect, it, vi } from "vitest";
import { runEnrich } from "@/lib/enrich";
import type {
  ExtractorClient,
  ExtractorOutput,
  TadaStore,
  Todo,
  UserCtx,
} from "@/lib/contracts";

const user: UserCtx = { userId: "u1", email: "u1@t.local", plan: "unlimited" };

const store = {
  listTodos: vi.fn(async () => [{ id: "x", title: "buy milk", status: "open" } as Todo]),
  labels: vi.fn(async () => [{ id: "l", name: "work", colorHex: "#c8632e" }]),
} as unknown as TadaStore;

describe("runEnrich", () => {
  it("returns extractor suggestions without creating todos, passing taxonomy", async () => {
    const extractor: ExtractorClient = {
      extract: vi.fn(async (): Promise<ExtractorOutput> => ({
        todos: [
          {
            title: "Call dentist",
            actionType: "reminder",
            actionPayload: { kind: "reminder", text: "Call dentist", remindAt: null },
            suggestedPriority: "p2",
            suggestedLabels: ["health"],
          },
        ],
      })),
    };
    const out = await runEnrich(user, "call dentist tomorrow", { store, extractor });
    expect(out.suggestions).toHaveLength(1);
    expect(out.suggestions[0].suggestedPriority).toBe("p2");
    // taxonomy threaded for dedupe + organize
    const input = (extractor.extract as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(input.text).toBe("call dentist tomorrow");
    expect(input.existingOpenTitles).toContain("buy milk");
    expect(input.existingLabels).toContain("work");
  });
});
