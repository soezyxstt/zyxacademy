import { describe, expect, it } from "bun:test";
import { buildPedagogyContext } from "@/lib/zyra/pedagogy/context";
import { composeSafeTeachingResponse } from "@/lib/zyra/pedagogy/composer";
import { selectTeachingPlan } from "@/lib/zyra/pedagogy/state-machine";
import { validateTeachingResponse } from "@/lib/zyra/pedagogy/validators";
import type { PedagogySource } from "@/lib/zyra/pedagogy/contracts";

const source: PedagogySource = {
  id: "v2:idea:idea-1:2",
  version: 2,
  kind: "ko",
  title: "Turunan fungsi",
  content: "Turunan mengukur perubahan suatu fungsi terhadap variabelnya.",
  href: "/courses/course-1/material",
};

function context() {
  return buildPedagogyContext({
    courseId: "course-1",
    chapterId: "chapter-1",
    question: "jelaskan turunan fungsi",
    action: "follow_up",
    activityKind: "study",
    attemptState: "none",
    answerReleaseState: "released",
    matchState: "none",
    allowDirectAnswerReveal: true,
    assessmentReasonCode: "STUDY_PRACTICE_ALLOWED",
    evidenceSufficiency: "sufficient",
  });
}

describe("Plan 007 typed teaching response", () => {
  it("reports failed generation without presenting page instructions as an explanation", () => {
    const ctx = context();
    const response = composeSafeTeachingResponse(ctx, selectTeachingPlan(ctx), [{
      ...source,
      content: 'Murid sedang membaca materi kuliah. PANDUAN KONTEKS: Jawaban HARUS merujuk pada materi ini.',
    }], "MODEL_OUTPUT_REJECTED");
    expect(response.selectedState).toBe("clarify");
    expect(response.learnerFacingText).toContain("Coba lagi");
    expect(response.learnerFacingText).not.toMatch(/Murid sedang membaca|PANDUAN KONTEKS|Tujuan kita/);
    expect(response.citations).toHaveLength(0);
  });

  it("does not copy synthetic page instructions even during deterministic composition", () => {
    const ctx = context();
    const response = composeSafeTeachingResponse(ctx, selectTeachingPlan(ctx), [{
      ...source, content: 'PANDUAN KONTEKS: Jawaban harus merujuk materi ini.',
    }], "DETERMINISTIC_COMPOSITION");
    expect(response.selectedState).toBe("clarify");
    expect(response.learnerFacingText).not.toContain("PANDUAN KONTEKS");
  });

  it("preserves canonical Markdown paragraphs and display math without restating the request", () => {
    const ctx = context();
    const content = '## Turunan\n\nPerubahan fungsi:\n\n$$\nf\'(x) = 2x\n$$';
    const response = composeSafeTeachingResponse(ctx, selectTeachingPlan(ctx), [{ ...source, content }], "TEST_COMPOSITION");
    expect(response.learnerFacingText).toContain(content);
    expect(response.learnerFacingText).not.toContain("Tujuan kita");
    expect(response.learnerFacingText).not.toContain(ctx.explicitTopic);
  });

  it("composes a valid grounded response with one checkpoint and canonical citation", () => {
    const ctx = context();
    const plan = selectTeachingPlan(ctx);
    const response = composeSafeTeachingResponse(ctx, plan, [source], "TEST_COMPOSITION");
    const result = validateTeachingResponse(response, ctx, plan, new Map([[source.id, source.version]]));

    expect(result.valid).toBe(true);
    expect(response.citations).toHaveLength(1);
    expect(response.checkForUnderstanding).not.toBeNull();
    expect(response.learnerFacingText).not.toMatch(/pipeline|retriev|vector|cache/i);
  });

  it("rejects stale citations, missing checkpoints, and pipeline language", () => {
    const ctx = context();
    const plan = selectTeachingPlan(ctx);
    const response = composeSafeTeachingResponse(ctx, plan, [source], "TEST_COMPOSITION");
    const invalid = {
      ...response,
      learnerFacingText: "Ini hasil retrieval dari pipeline cache.",
      citations: [{ ...response.citations[0], sourceVersion: 99 }],
      checkForUnderstanding: null,
    };
    const result = validateTeachingResponse(invalid, ctx, plan, new Map([[source.id, source.version]]));

    expect(result.valid).toBe(false);
    expect(result.violations.map((item) => item.code)).toEqual(expect.arrayContaining([
      "PIPELINE_LANGUAGE_LEAK",
      "INVALID_CITATION",
      "MISSING_CHECKPOINT",
    ]));
  });

  it("rejects visual claims that cite an unavailable source", () => {
    const ctx = context();
    const plan = selectTeachingPlan(ctx);
    const response = composeSafeTeachingResponse(ctx, plan, [source], "TEST_COMPOSITION");
    const invalid = {
      ...response,
      visualSpec: {
        type: "graph" as const,
        title: "Konsep",
        semanticLabels: ["A", "B"],
        values: {},
        relationships: [{ sourceNode: "A", targetNode: "B" }],
        sourceClaimIds: ["v2:idea:missing:1"],
        altDescription: "Relasi konsep",
      },
    };
    const result = validateTeachingResponse(invalid, ctx, plan, new Map([[source.id, source.version]]));

    expect(result.valid).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain("INVALID_VISUAL_CLAIM");
  });
});
