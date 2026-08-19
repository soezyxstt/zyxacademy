import { describe, expect, test } from "bun:test";
import { isZyraSelectionAskEnabled, normalizeZyraSelection } from "@/lib/zyra/murid";

describe("Zyra selection-to-ask boundary", () => {
  test("is enabled by default", () => {
    expect(isZyraSelectionAskEnabled()).toBe(true);
  });
  test("keeps only selected bounded text", () => {
    expect(normalizeZyraSelection("<script>alert(1)</script>")).toBe("<script>alert(1)</script>");
  });
});
