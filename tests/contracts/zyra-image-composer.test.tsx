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
});
