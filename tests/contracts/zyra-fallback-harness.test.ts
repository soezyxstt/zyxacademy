import { describe, expect, it, mock, spyOn } from "bun:test";
import { readFileSync } from "node:fs";
mock.module("@/lib/prompt-executor", () => ({ PromptExecutor: { run: async () => { throw new Error("unexpected generation"); } } }));
const { PromptExecutor } = await import("@/lib/prompt-executor");
import { buildPedagogyContext } from "@/lib/zyra/pedagogy/context";
let recordedShadow: Record<string, unknown>;
mock.module("@/lib/ai/provenance", () => ({ hashEvidence: () => "hash", hashSanitizedInput: () => "hash", recordGenerationTrace: async (trace: Record<string, unknown>) => { recordedShadow = trace; return "trace"; } }));
const { recordPedagogyShadowComparison } = await import("@/lib/zyra/pedagogy/shadow");
const { runPedagogicalTurn } = await import("@/lib/zyra/pedagogy/harness");

describe("Zyra fallback through the harness", () => {
  it("does not present an uncertain conversation as a completed greeting", async () => {
    const source = readFileSync("lib/tutor-rag.ts", "utf8").replace(/\r\n/g, "\n");
    const start = source.indexOf('    let ansText = result.success && result.data');
    const branchEnd = source.indexOf('\n  }', start);
    expect(start).toBeGreaterThan(0); expect(branchEnd).toBeGreaterThan(start);
    const execute = new (Object.getPrototypeOf(async function() {}).constructor)("deps", `
      const { result, emitOperationalOutcome } = deps;
      const responseLanguage = 'en', policy = null;
      ${source.slice(start, branchEnd).replace(/ as const/g, "")}
    `);
    const outcomes: string[] = [];
    const result = await execute({ result: { success: false, outcome: 'uncertain' }, emitOperationalOutcome: (value: string) => outcomes.push(value) });
    expect(result.answer).toBe("");
    expect(result.failureCode).toBe("provider_unavailable");
    expect(outcomes).toEqual(["PROVIDER_OUTCOME_UNCERTAIN"]);
  });
  it("preserves uncertainty so the tutor caller cannot request a legacy generation", async () => {
    const context = buildPedagogyContext({ courseId: "math", question: "Jelaskan garis", action: "follow_up", activityKind: "study", attemptState: "none", answerReleaseState: "released", matchState: "none", allowDirectAnswerReveal: true, assessmentReasonCode: "STUDY", evidenceSufficiency: "sufficient" });
    const run = spyOn(PromptExecutor, "run").mockResolvedValue({ success: false, outcome: "uncertain", errors: [], violationCodes: ["PROVIDER_OUTCOME_UNCERTAIN"], retryCount: 0 });
    try {
      const result = await runPedagogicalTurn({ userId: "local-fixture", learnerQuestion: context.explicitTopic, context, evidence: [{ id: "line", version: 1, kind: "material", title: "Garis lurus", content: "Persamaan garis lurus.", href: "/courses/math/material" }] });
      expect(result.outcome).toBe("uncertain");
      expect(result.usedFallback).toBe(false);
      expect(run).toHaveBeenCalledTimes(1);
      const source = readFileSync("lib/tutor-rag.ts", "utf8").replace(/\r\n/g, "\n");
      const start = source.indexOf("const pedagogyResult = await runCandidate();");
      const end = source.indexOf("\n          }\n        } else {", start);
      expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
      const execute = new (Object.getPrototypeOf(async function() {}).constructor)("deps", `
        const { runCandidate, teachingResponseToTutorAnswer, PromptExecutor } = deps;
        const pedagogyEvidence = []; let result, pedagogyFallback, pedagogyCanvasSpec;
        ${source.slice(start,end)}
        return result;
      `);
      const caller = await execute({ runCandidate: async () => result, teachingResponseToTutorAnswer: () => ({}), PromptExecutor: { run: () => { throw new Error("second provider dispatch"); } } });
      expect(caller.success).toBe(false);
      expect(caller.outcome).toBe("uncertain");
      expect(run).toHaveBeenCalledTimes(1);
    } finally { run.mockRestore(); }
  });

  it("records uncertain baseline and candidate outcomes without claiming generated success", async () => {
    const comparison = await recordPedagogyShadowComparison({ runId: "test", caseId: "timeout", courseId: "private-course", baselineOutcome: "uncertain", candidateOutcome: "uncertain", selectedState: "explain", hintLevel: "none", candidateUsedFallback: false, candidateViolationCodes: ["PROVIDER_OUTCOME_UNCERTAIN"], evidenceIds: [], latencyMs: 1 });
    expect(comparison.baselineOutcome).toBe("uncertain");
    expect(comparison.candidateOutcome).toBe("uncertain");
    expect(recordedShadow.terminalOutcome).toBe("provider_failure");
    expect(recordedShadow.violationCodes).toEqual(["PROVIDER_OUTCOME_UNCERTAIN"]);
  });

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
