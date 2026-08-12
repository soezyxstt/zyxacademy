import { describe, expect, it } from "bun:test";
import { buildPedagogyContext } from "@/lib/zyra/pedagogy/context";
import { composeSafeTeachingResponse } from "@/lib/zyra/pedagogy/composer";
import { selectTeachingPlan } from "@/lib/zyra/pedagogy/state-machine";
import { validateTeachingResponse } from "@/lib/zyra/pedagogy/validators";
import type { PedagogySource } from "@/lib/zyra/pedagogy/contracts";

const questionSource: PedagogySource = {
  id: "v2:question:q-1:1",
  version: 1,
  kind: "practice_question",
  title: "Latihan konsep",
  content: "Question: Jelaskan prinsip dasar.\n\nJawaban: opsi B karena alasan tertentu.",
  href: "/courses/course-1/practice",
};

function activeContext() {
  return buildPedagogyContext({
    courseId: "course-1",
    chapterId: "chapter-1",
    question: "bantu soal ini",
    action: "new_topic",
    activityKind: "quiz",
    attemptState: "in_progress",
    answerReleaseState: "hidden",
    matchState: "exact",
    allowDirectAnswerReveal: false,
    assessmentReasonCode: "ACTIVE_ASSESSMENT_SOCRATIC_ONLY",
    evidenceSufficiency: "sufficient",
    learnerResponseShape: "short_answer",
  });
}

describe("Plan 007 assessment safety", () => {
  it("removes answer-bearing sections before prompt composition", async () => {
    const { buildPedagogyPromptInput } = await import("@/lib/zyra/pedagogy/prompt-input");
    const ctx = activeContext();
    const plan = selectTeachingPlan(ctx);
    const input = buildPedagogyPromptInput(ctx, plan, ctx.explicitTopic, [questionSource]);

    expect(input.evidence[0]?.content).not.toMatch(/jawaban|opsi b/i);
  });

  it("rejects a direct answer leak during an active attempt", () => {
    const ctx = activeContext();
    const plan = selectTeachingPlan(ctx);
    const response = composeSafeTeachingResponse(ctx, plan, [questionSource], "ACTIVE_ASSESSMENT_SOCRATIC_ONLY");
    const invalid = {
      ...response,
      learnerFacingText: "Jawaban akhir adalah opsi B.",
    };
    const result = validateTeachingResponse(invalid, ctx, plan, new Map([[questionSource.id, questionSource.version]]), {
      correctOptions: ["B"],
    });

    expect(result.valid).toBe(false);
    expect(result.violations.map((item) => item.code)).toContain("ACTIVE_ASSESSMENT_LEAK");
  });

  it("keeps assessment decision and reason code in the typed response", () => {
    const ctx = activeContext();
    const plan = selectTeachingPlan(ctx);
    const response = composeSafeTeachingResponse(ctx, plan, [questionSource], "ACTIVE_ASSESSMENT_SOCRATIC_ONLY");

    expect(response.assessmentSafety).toEqual({
      decision: "scaffold_only",
      reasonCode: "ACTIVE_ASSESSMENT_SOCRATIC_ONLY",
    });
    expect(response.nextAllowedAction).not.toBe("answer_checkpoint");
  });
});
