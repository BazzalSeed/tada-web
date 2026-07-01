// @vitest-environment node
// T2.2 — POST /api/capture route. currentUser + the capture pipeline are mocked;
// asserts auth, validation, and the response envelope. The pipeline itself is
// unit-tested in lib/__tests__/capture.test.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ currentUser: vi.fn() }));
vi.mock("@/lib/capture", () => ({
  runCapture: vi.fn(),
  proposeCapture: vi.fn(),
  commitCapture: vi.fn(),
}));

import { currentUser } from "@/lib/auth";
import { commitCapture, proposeCapture, runCapture } from "@/lib/capture";
import { POST as capture } from "@/app/api/capture/route";
import { POST as capturePropose } from "@/app/api/capture/propose/route";
import { POST as captureCommit } from "@/app/api/capture/commit/route";

const mockUser = currentUser as unknown as ReturnType<typeof vi.fn>;
const mockRun = runCapture as unknown as ReturnType<typeof vi.fn>;
const mockPropose = proposeCapture as unknown as ReturnType<typeof vi.fn>;
const mockCommit = commitCapture as unknown as ReturnType<typeof vi.fn>;
const user = { userId: "u1", email: "u1@t.local", plan: "free" as const };

const post = (body: unknown) =>
  capture(
    new Request("http://localhost/api/capture", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue(user);
});

describe("POST /api/capture", () => {
  it("runs the capture pipeline and returns 201 { capture, todos }", async () => {
    mockRun.mockResolvedValue({
      capture: { id: "cap1" },
      todos: [{ id: "t1", title: "buy milk" }],
    });
    const res = await post({ text: "buy milk" });
    expect(res.status).toBe(201);
    expect(mockRun).toHaveBeenCalledWith(user, expect.objectContaining({ text: "buy milk" }));
    const json = await res.json();
    expect(json.todos[0].id).toBe("t1");
    expect(json.capture.id).toBe("cap1");
  });

  it("rejects an empty capture (no text/image/note/email/blob) with 400", async () => {
    const res = await post({});
    expect(res.status).toBe(400);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockUser.mockRejectedValue(new Error("unauthorized"));
    const res = await post({ text: "x" });
    expect(res.status).toBe(401);
  });
});

const postPropose = (body: unknown) =>
  capturePropose(
    new Request("http://localhost/api/capture/propose", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const postCommit = (body: unknown) =>
  captureCommit(
    new Request("http://localhost/api/capture/commit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("POST /api/capture/propose", () => {
  it("runs proposeCapture and returns 200 { capture, proposals, failed }", async () => {
    mockPropose.mockResolvedValue({
      capture: { id: "cap1" },
      proposals: [{ title: "buy milk" }],
      failed: false,
    });
    const res = await postPropose({ text: "buy milk" });
    expect(res.status).toBe(200);
    expect(mockPropose).toHaveBeenCalledWith(user, expect.objectContaining({ text: "buy milk" }));
    const json = await res.json();
    expect(json.proposals[0].title).toBe("buy milk");
  });

  it("rejects an empty capture (no text/image/note/email/blob) with 400", async () => {
    const res = await postPropose({});
    expect(res.status).toBe(400);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockUser.mockRejectedValue(new Error("unauthorized"));
    const res = await postPropose({ text: "x" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/capture/commit", () => {
  it("runs commitCapture and returns 201 { todos }", async () => {
    mockCommit.mockResolvedValue({ todos: [{ id: "t1", title: "buy milk" }] });
    const res = await postCommit({ captureId: "cap1", todos: [{ title: "buy milk" }] });
    expect(res.status).toBe(201);
    expect(mockCommit).toHaveBeenCalledWith(
      user,
      expect.objectContaining({ captureId: "cap1" }),
    );
    const json = await res.json();
    expect(json.todos[0].id).toBe("t1");
  });

  it("rejects a missing captureId with 400", async () => {
    const res = await postCommit({ todos: [{ title: "x" }] });
    expect(res.status).toBe(400);
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it("rejects an empty todos[] with 400", async () => {
    const res = await postCommit({ captureId: "cap1", todos: [] });
    expect(res.status).toBe(400);
    expect(mockCommit).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockUser.mockRejectedValue(new Error("unauthorized"));
    const res = await postCommit({ captureId: "cap1", todos: [{ title: "x" }] });
    expect(res.status).toBe(401);
  });
});
