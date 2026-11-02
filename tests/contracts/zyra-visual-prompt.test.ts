import { describe, expect, test } from "bun:test";
import { ZYRA_PEDAGOGY_V3_CONTRACT } from "@/prompts/zyra/pedagogy-v3";

describe("Zyra visual guidance", () => {
  test("encourages grounded limit plots and follow-up context without revealing protected answers", () => {
    const prompt = ZYRA_PEDAGOGY_V3_CONTRACT.systemInstruction;
    expect(prompt).toContain("prefer a function_plot");
    expect(prompt).toContain("recent conversation");
    expect(prompt).toContain("ground the visual in the supplied evidence");
    expect(prompt).toContain("excludedX");
    expect(prompt).toContain("protected assessment answer");
  });
});
