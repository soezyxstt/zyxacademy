import { describe, expect, test } from "bun:test";
import { isZyraSelectionAskEnabled, normalizeZyraSelection } from "@/lib/zyra/murid";

describe("Zyra selection-to-ask boundary", () => {
  test("is independently flaggable", () => {
    expect(isZyraSelectionAskEnabled("1")).toBe(true);
    expect(isZyraSelectionAskEnabled("0")).toBe(false);
  });
  test("keeps only selected bounded text", () => {
    expect(normalizeZyraSelection("<script>alert(1)</script>")).toBe("<script>alert(1)</script>");
  });
});
