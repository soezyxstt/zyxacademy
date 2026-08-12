import { describe, expect, test } from "bun:test";
import { validateTeachingResponse } from "@/lib/zyra/pedagogy/validators";
import { selectTeachingPlan } from "@/lib/zyra/pedagogy/state-machine";
import type { PedagogyContext, ZyraTeachingResponse } from "@/lib/zyra/pedagogy/contracts";

const context: PedagogyContext = {
  courseId: "course-a",
  chapterId: null,
  action: "new_topic",
  evidenceSufficiency: "sufficient",
  activeAssessment: true,
  allowDirectAnswerReveal: false,
  assessmentReasonCode: "ACTIVE_ATTEMPT",
  learnerResponseShape: "free_text",
  previousHintLevel: "none",
  misconceptionUncertain: false,
  responseModifiers: [],
  explicitTopic: "gaya normal",
};

const response: ZyraTeachingResponse = {
  learningGoal: "Memahami gaya normal.",
  observedFacts: ["Garis pada gambar terlihat miring."],
  diagnosisHypotheses: [],
  selectedState: "hint_1_concept",
  teachingMove: "identify_principle",
  hintLevel: "hint_1_concept",
  explanationBlocks: [{ kind: "concept", text: "Perhatikan arah gaya terhadap bidang." }],
  citations: [{ sourceId: "source-1", sourceVersion: 1, claim: "Arah gaya" }],
  visualSpec: null,
  canvasSpec: null,
  imageObservations: [{ observation: "Satu panah mengarah ke atas.", confidence: "medium" }],
  uncertainties: ["Nilai sudut tidak terbaca."],
  unreadableRegions: ["Label kecil di sisi kanan."],
  checkForUnderstanding: { question: "Apa arah gaya yang perlu diperhatikan?", expectedResponseShape: "free_text" },
  nextAllowedAction: "continue_with_hint",
  assessmentSafety: { decision: "scaffold_only", reasonCode: "ACTIVE_ATTEMPT" },
  learnerFacingText: "Perhatikan arah gaya terhadap bidang, lalu jelaskan mengapa arah itu penting.",
};

describe("Zyra image assessment boundary", () => {
  test("keeps visible observations separate from uncertainty during an assessment", () => {
    const result = validateTeachingResponse(response, context, selectTeachingPlan(context), new Map([["source-1", 1]]));
    expect(result.violations.map((item) => item.code)).not.toContain("ACTIVE_ASSESSMENT_LEAK");
    expect(result.valid).toBe(true);
  });

  test("rejects a direct answer hidden inside image-derived learner text", () => {
    const result = validateTeachingResponse({ ...response, learnerFacingText: "Jawaban akhir adalah opsi B." }, context, selectTeachingPlan(context), new Map([["source-1", 1]]));
    expect(result.violations.map((item) => item.code)).toContain("ACTIVE_ASSESSMENT_LEAK");
  });
});
