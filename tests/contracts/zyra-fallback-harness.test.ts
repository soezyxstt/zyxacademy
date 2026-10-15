import { describe, expect, it, spyOn } from "bun:test";
import { PromptExecutor } from "@/lib/prompt-executor";
import { buildPedagogyContext } from "@/lib/zyra/pedagogy/context";
import { runPedagogicalTurn } from "@/lib/zyra/pedagogy/harness";

describe("Zyra fallback through the harness", () => {
  it("preserves retry guidance when generation fails in an explanation state", async () => {
    const context = buildPedagogyContext({ courseId: "math", question: "Jelaskan garis", action: "follow_up", activityKind: "study", attemptState: "none", answerReleaseState: "released", matchState: "none", allowDirectAnswerReveal: true, assessmentReasonCode: "STUDY", evidenceSufficiency: "sufficient" });
    const run = spyOn(PromptExecutor, "run").mockResolvedValue({ success: false, outcome: "rejected", errors: [], violationCodes: ["INVALID_CITATION"], retryCount: 0 });
    try {
      const result = await runPedagogicalTurn({ userId: "local-fixture", learnerQuestion: context.explicitTopic, context, evidence: [{ id: "line", version: 1, kind: "material", title: "Garis lurus", content: "Murid sedang membaca. PANDUAN KONTEKS: HARUS merujuk materi ini.", href: "/courses/math/material" }] });
      expect(result.response.selectedState).toBe("clarify");
      expect(result.response.learnerFacingText).toContain("Coba lagi");
      expect(result.response.learnerFacingText).not.toContain("PANDUAN KONTEKS");
      expect(result.usedFallback).toBe(true);
      expect(result.violationCodes).toEqual(["INVALID_CITATION"]);
    } finally {
      run.mockRestore();
    }
  });
});
