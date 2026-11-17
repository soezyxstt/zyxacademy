import { describe, expect, test } from "bun:test";
import { selectZyraImageFiles, zyraImageFilesFromClipboard } from "@/lib/zyra/images";

describe("Zyra image composer contract", () => {
  test("keeps text composition independent from bounded image selection", () => {
    const first = new File([new Uint8Array([1])], "diagram.png", { type: "image/png", lastModified: 5 });
    const result = selectZyraImageFiles([], [first]);
    expect(result.accepted[0]?.name).toBe("diagram.png");
    expect(result.accepted[0]?.status).toBe("uploading");
  });

  test("accepts pasted image clipboard items and ignores pasted text", () => {
    const image = new File([new Uint8Array([1])], "clipboard.png", { type: "image/png" });
    const files = zyraImageFilesFromClipboard([
      { kind: "string", type: "text/plain", getAsFile: () => null },
      { kind: "file", type: "image/png", getAsFile: () => image },
    ]);
    expect(files).toEqual([image]);
  });

  test("does not duplicate a pasted file when clipboard items and FileList represent the same paste with different metadata", () => {
    const image = new File(["one"], "image.png", { type: "image/png", lastModified: 5 });
    const fileListCopy = new File(["one"], "screenshot.png", { type: "image/png", lastModified: 6 });
    expect(zyraImageFilesFromClipboard([
      { kind: "file", type: "image/png", getAsFile: () => image },
    ], [fileListCopy])).toEqual([image]);
  });

  test("falls back to FileList when clipboard items yield no files and keeps multiple distinct pasted items", () => {
    const first = new File(["one"], "first.png", { type: "image/png", lastModified: 5 });
    const duplicateFirst = new File(["one"], "first.png", { type: "image/png", lastModified: 7 });
    const second = new File(["two"], "second.png", { type: "image/png", lastModified: 6 });

    expect(zyraImageFilesFromClipboard([
      { kind: "file", type: "image/png", getAsFile: () => first },
      { kind: "file", type: "image/png", getAsFile: () => duplicateFirst },
      { kind: "file", type: "image/png", getAsFile: () => second },
    ])).toEqual([first, second]);

    expect(zyraImageFilesFromClipboard([
      { kind: "string", type: "text/plain", getAsFile: () => null },
      { kind: "file", type: "image/png", getAsFile: () => null },
    ], [first, second])).toEqual([first, second]);
  });

  test("successive selections reject a duplicate and retain distinct files within the limit", () => {
    const image = new File(["one"], "clipboard.png", { type: "image/png", lastModified: 5 });
    const other = new File(["two"], "other.png", { type: "image/png", lastModified: 6 });
    const first = selectZyraImageFiles([], [image]);
    const second = selectZyraImageFiles(first.accepted, [image, other]);
    expect(second.rejected).toEqual(["DUPLICATE_IMAGE"]);
    expect(second.accepted.map((item) => item.file)).toEqual([image, other]);
  });
});
