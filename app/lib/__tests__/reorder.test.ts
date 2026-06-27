import { describe, expect, it } from "vitest";
import { neighborsForDrop } from "../reorder";

describe("neighborsForDrop", () => {
  it("moving the first item to the end → neighbor above is the old last, none below", () => {
    expect(neighborsForDrop(["a", "b", "c"], 0, 2)).toEqual({
      beforeId: "c",
      afterId: null,
    });
  });

  it("moving the last item to the front → none above, neighbor below is the old first", () => {
    expect(neighborsForDrop(["a", "b", "c"], 2, 0)).toEqual({
      beforeId: null,
      afterId: "a",
    });
  });

  it("moving a middle item past another → neighbors are the surrounding ids", () => {
    expect(neighborsForDrop(["a", "b", "c", "d"], 1, 2)).toEqual({
      beforeId: "c",
      afterId: "d",
    });
  });

  it("clamps an out-of-range target to the end", () => {
    expect(neighborsForDrop(["a", "b"], 0, 9)).toEqual({
      beforeId: "b",
      afterId: null,
    });
  });
});
