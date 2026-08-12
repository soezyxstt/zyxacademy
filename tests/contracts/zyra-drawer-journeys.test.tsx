import { describe, expect, test } from "bun:test";
import { readyZyraAttachmentIds, selectZyraImageFiles } from "@/lib/zyra/images/composer";

describe("Zyra drawer journeys", () => {
  test("text draft stays independent from attachments", () => {
    const file = new File([new Uint8Array([1])], "diagram.png", { type: "image/png" });
    const selected = selectZyraImageFiles([], [file]).accepted;
    expect(selected).toHaveLength(1);
    expect(readyZyraAttachmentIds(selected)).toEqual([]);
  });
  test("ready attachment ids are the only ids dispatched", () => {
    const file = new File([new Uint8Array([1])], "diagram.png", { type: "image/png" });
    const selected = selectZyraImageFiles([], [file]).accepted;
    expect(readyZyraAttachmentIds([{ ...selected[0]!, status: "ready", attachmentId: "opaque-id" }])).toEqual(["opaque-id"]);
  });
});
