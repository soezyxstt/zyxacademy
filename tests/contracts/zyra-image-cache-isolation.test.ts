import { describe, expect, test } from "bun:test";
import { readyZyraAttachmentIds, selectZyraImageFiles } from "@/lib/zyra/images";

function file(name: string, type = "image/png") {
  return new File([new Uint8Array([1, 2, 3])], name, { type, lastModified: 1 });
}

describe("Zyra image cache isolation", () => {
  test("four image selection remains bounded and produces only ready ids", () => {
    const selection = selectZyraImageFiles([], [file("a.png"), file("b.png"), file("c.png"), file("d.png"), file("e.png")]);
    expect(selection.accepted).toHaveLength(4);
    expect(selection.rejected).toContain("IMAGE_COUNT_LIMIT");
    expect(readyZyraAttachmentIds(selection.accepted)).toEqual([]);
  });

  test("unsupported and duplicate files never become upload candidates", () => {
    const first = selectZyraImageFiles([], [file("a.png")]);
    const second = selectZyraImageFiles(first.accepted, [file("a.png"), file("b.svg", "image/svg+xml")]);
    expect(second.accepted).toHaveLength(1);
    expect(second.rejected).toEqual(["DUPLICATE_IMAGE", "UNSUPPORTED_MIME"]);
  });
});
