import { describe, expect, test } from "bun:test";
import { normalizeZyraSelection, ZYRA_MURID_EXPERIENCE_VERSION } from "@/lib/zyra/murid";

describe("Zyra murid client contract", () => {
  test("uses a versioned contract", () => expect(ZYRA_MURID_EXPERIENCE_VERSION).toBe("zyra-murid-experience-v1"));
  test("bounds and normalizes selected lesson text", () => {
    const value = normalizeZyraSelection("  gaya   normal\nterhadap bidang  ");
    expect(value).toBe("gaya normal terhadap bidang");
    expect(normalizeZyraSelection("x".repeat(2000))).toHaveLength(1200);
  });
});
