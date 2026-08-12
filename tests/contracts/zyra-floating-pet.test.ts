import { describe, expect, it } from "bun:test";
import { clampZyraPetPosition } from "@/components/course/zyra-floating-pet";

describe("Zyra floating pet", () => {
  it("keeps a dragged pet inside the visible viewport", () => {
    expect(clampZyraPetPosition({ x: -200, y: -50 }, { width: 1200, height: 800 })).toEqual({ x: 16, y: 16 });
    expect(clampZyraPetPosition({ x: 2000, y: 900 }, { width: 1200, height: 800 })).toEqual({ x: 996, y: 704 });
  });
});
