import { describe, expect, test } from "bun:test";
import { CanvasSpecSchema, LEARNING_CANVAS_CAPABILITIES } from "@/lib/zyra/canvas";

describe("Learning Canvas accessibility contract", () => {
  test("every capability declares a textual or tabular fallback", () => {
    expect(LEARNING_CANVAS_CAPABILITIES.length).toBe(9);
    expect(LEARNING_CANVAS_CAPABILITIES.every((capability) => capability.fallback === "table" || capability.fallback === "text")).toBe(true);
  });

  test("canvas specs require alt text and fallback rows", () => {
    const result = CanvasSpecSchema.safeParse({
      version: "zyra-learning-canvas-v1",
      type: "table",
      title: "Tabel konsep",
      purpose: "Membandingkan dua keadaan.",
      claimRefs: ["claim-1"],
      altText: "",
      fallback: { summary: "", columns: [], rows: [] },
      rows: [],
    });
    expect(result.success).toBe(false);
  });
});
