import { describe, expect, it } from "vitest";
import { imageFilesFrom } from "../capture-files";

function file(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe("imageFilesFrom", () => {
  it("collects image files from a drop's files list", () => {
    const dt = {
      files: [file("a.png", "image/png"), file("note.txt", "text/plain")],
    };
    const out = imageFilesFrom(dt);
    expect(out.map((f) => f.name)).toEqual(["a.png"]);
  });

  it("collects image files from clipboard items (paste)", () => {
    const png = file("paste.png", "image/png");
    const dt = {
      items: [
        { kind: "file", type: "image/png", getAsFile: () => png },
        { kind: "string", type: "text/plain", getAsFile: () => null },
      ],
    };
    expect(imageFilesFrom(dt)).toEqual([png]);
  });

  it("returns [] when there are no images", () => {
    expect(imageFilesFrom({ files: [file("a.txt", "text/plain")] })).toEqual([]);
    expect(imageFilesFrom({})).toEqual([]);
  });
});
