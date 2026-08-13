import { describe, expect, it } from "bun:test";
import { buildPedagogyContext } from "@/lib/zyra/pedagogy/context";
import { selectTeachingPlan } from "@/lib/zyra/pedagogy/state-machine";

function context(overrides: Partial<Parameters<typeof buildPedagogyContext>[0]> = {}) {
  return buildPedagogyContext({
    courseId: "course-1",
    chapterId: "chapter-1",
    question: "jelaskan turunan fungsi",
    action: "new_topic",
    activityKind: "study",
    attemptState: "none",
    answerReleaseState: "released",
    matchState: "none",
    allowDirectAnswerReveal: true,
    assessmentReasonCode: "STUDY_PRACTICE_ALLOWED",
    evidenceSufficiency: "sufficient",
    ...overrides,
  });
}

describe("Plan 007 deterministic pedagogical state machine", () => {
  it("covers orientation, explanation, diagnosis, clarification, teach-back, and check states", () => {
    expect(selectTeachingPlan(context()).state).toBe("orient");
    expect(selectTeachingPlan(context({ action: "follow_up" })).state).toBe("explain");
    expect(selectTeachingPlan(context({ misconceptionUncertain: true })).state).toBe("diagnose");
    expect(selectTeachingPlan(context({ evidenceSufficiency: "insufficient" })).state).toBe("clarify");
    expect(selectTeachingPlan(context({ action: "teach_back" })).state).toBe("teach_back");
    expect(selectTeachingPlan(context({ action: "check_response" })).state).toBe("check");
  });

  it("advances hints in order and never advances beyond hint four", () => {
    expect(selectTeachingPlan(context({ action: "hint_request" })).state).toBe("hint_1_concept");
    expect(selectTeachingPlan(context({ action: "hint_request", previousHintLevel: "hint_1_concept" })).state).toBe("hint_2_representation");
    expect(selectTeachingPlan(context({ action: "hint_request", previousHintLevel: "hint_2_representation" })).state).toBe("hint_3_analogous_example");
    expect(selectTeachingPlan(context({ action: "hint_request", previousHintLevel: "hint_3_analogous_example" })).state).toBe("hint_4_partial_step");
    expect(selectTeachingPlan(context({ action: "hint_request", previousHintLevel: "hint_4_partial_step" })).state).toBe("hint_4_partial_step");
  });

  it("caps active assessment turns at scaffolded hints", () => {
    const result = selectTeachingPlan(context({
      activityKind: "quiz",
      attemptState: "in_progress",
      answerReleaseState: "hidden",
      matchState: "exact",
      allowDirectAnswerReveal: false,
      assessmentReasonCode: "ACTIVE_ASSESSMENT_SOCRATIC_ONLY",
    }));

    expect(result.state).toBe("hint_1_concept");
    expect(result.hintLevel).toBe("hint_1_concept");
    expect(result.nextAllowedAction).toBe("continue_with_hint");
  });
});
