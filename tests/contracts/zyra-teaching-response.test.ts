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
