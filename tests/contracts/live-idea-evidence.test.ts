import { describe, expect, it } from "bun:test";
import {
  LEGACY_IDEA_EVIDENCE_RUBRIC_VERSION,
  buildLegacyGradingPolicySnapshot,
  buildLegacyResponseSnapshot,
  deriveLegacyAnswerEvidence,
  isCanonicalIdeaEvidenceEnabled,
  legacyAnswerEvidenceId,
  legacyAnswerId,
  mapLegacyQuizSnapshotToCanonicalIdeas,
  type CanonicalQuestionForLegacyEvidence,
  type LegacyQuizQuestionSnapshot,
} from "@/lib/asesmen/live-idea-evidence";

const question: LegacyQuizQuestionSnapshot = {
  id: "question-1",
  prompt: "Which option is correct?",
  options: ["A", "B"],
  question_type: "multiple_choice",
  stable_option_ids: ["option-question-1-0", "option-question-1-1"],
  correct_indices: [1],
};

const canonicalQuestion: CanonicalQuestionForLegacyEvidence = {
  id: "question-1",
  status: "published",
  version: 1,
  questionType: "multiple_choice",
  generationHash: "question-hash",
  ideaLinks: [
    {
      ideaId: "idea-1",
      weight: 1,
      role: "primary",
      ideaStatus: "published",
      ideaVersion: 1,
    },
  ],
};

describe("live assessment to Idea evidence adapter", () => {
  it("maps only an exact published question and published Idea link", () => {
    const plan = mapLegacyQuizSnapshotToCanonicalIdeas({ questions: [question], canonicalQuestions: [canonicalQuestion] });

    expect(plan.status).toBe("mapped");
    if (plan.status === "mapped") {
      expect(plan.mappings[0]?.ideaLinks[0]?.ideaId).toBe("idea-1");
    }
  });

  it("fails closed for missing or unreviewed mappings and preserves multi-Idea links", () => {
    const missing = mapLegacyQuizSnapshotToCanonicalIdeas({ questions: [question], canonicalQuestions: [] });
    expect(missing.status).toBe("blocked");
    if (missing.status === "blocked") expect(missing.issues[0]?.code).toBe("MISSING_CANONICAL_QUESTION");

    const unreviewed = mapLegacyQuizSnapshotToCanonicalIdeas({
      questions: [question],
      canonicalQuestions: [{ ...canonicalQuestion, ideaLinks: [{ ...canonicalQuestion.ideaLinks[0], ideaStatus: "needs_review" }] }],
    });
    expect(unreviewed.status).toBe("blocked");
    if (unreviewed.status === "blocked") expect(unreviewed.issues[0]?.code).toBe("CANONICAL_IDEA_NOT_PUBLISHED");

    const multiIdea = mapLegacyQuizSnapshotToCanonicalIdeas({
      questions: [question],
      canonicalQuestions: [
        {
          ...canonicalQuestion,
          ideaLinks: [
            { ...canonicalQuestion.ideaLinks[0], weight: 0.5 },
            { ...canonicalQuestion.ideaLinks[0], ideaId: "idea-2", weight: 0.5, role: "required" },
          ],
        },
      ],
    });
    expect(multiIdea.status).toBe("mapped");
    if (multiIdea.status === "mapped") expect(multiIdea.mappings[0]?.ideaLinks.map((link) => link.ideaId)).toEqual(["idea-1", "idea-2"]);
  });

  it("derives deterministic per-Idea evidence without inferring a second Idea", () => {
    const plan = mapLegacyQuizSnapshotToCanonicalIdeas({ questions: [question], canonicalQuestions: [canonicalQuestion] });
    expect(plan.status).toBe("mapped");
    if (plan.status !== "mapped") return;

    const correct = deriveLegacyAnswerEvidence({ question, mapping: plan.mappings[0], isCorrect: true });
    expect(correct.status).toBe("derived");
    if (correct.status === "derived") {
      expect(correct.contributions).toEqual([
        {
          ideaId: "idea-1",
          scoreContribution: 1,
          weight: 1,
          confidence: 100,
          evidenceSource: "deterministic_rubric",
          rubricVersion: LEGACY_IDEA_EVIDENCE_RUBRIC_VERSION,
          derivationStatus: "deterministic",
          ambiguous: false,
          affectsMastery: true,
        },
      ]);
    }

    const incorrect = deriveLegacyAnswerEvidence({ question, mapping: plan.mappings[0], isCorrect: false });
    expect(incorrect.status).toBe("derived");
    if (incorrect.status === "derived") expect(incorrect.contributions[0]?.scoreContribution).toBe(0);
  });

  it("derives weighted evidence for every exact Idea in a multi-Idea question", () => {
    const plan = mapLegacyQuizSnapshotToCanonicalIdeas({
      questions: [question],
      canonicalQuestions: [{
        ...canonicalQuestion,
        ideaLinks: [
          { ...canonicalQuestion.ideaLinks[0], weight: 0.5 },
          { ...canonicalQuestion.ideaLinks[0], ideaId: "idea-2", weight: 0.5, role: "required" },
        ],
      }],
    });
    expect(plan.status).toBe("mapped");
    if (plan.status !== "mapped") return;
    const result = deriveLegacyAnswerEvidence({ question, mapping: plan.mappings[0], isCorrect: true });
    expect(result.status).toBe("derived");
    if (result.status === "derived") {
      expect(result.contributions.map((contribution) => ({ ideaId: contribution.ideaId, weight: contribution.weight }))).toEqual([
        { ideaId: "idea-1", weight: 0.5 },
        { ideaId: "idea-2", weight: 0.5 },
      ]);
    }
  });

  it("blocks free-response evidence until a reviewed rubric exists", () => {
    const plan = mapLegacyQuizSnapshotToCanonicalIdeas({
      questions: [{ ...question, question_type: "essay", stable_option_ids: undefined, correct_indices: undefined }],
      canonicalQuestions: [{ ...canonicalQuestion, questionType: "essay" }],
    });
    expect(plan.status).toBe("mapped");
    if (plan.status !== "mapped") return;

    const result = deriveLegacyAnswerEvidence({ question: { ...question, question_type: "essay" }, mapping: plan.mappings[0], isCorrect: true });
    expect(result).toEqual({ status: "blocked", contributions: [], reasonCode: "UNREVIEWED_FREE_RESPONSE" });
  });

  it("keeps snapshots immutable and identities idempotent", () => {
    const rendered = buildLegacyGradingPolicySnapshot(question, {
      ...canonicalQuestion,
      questionId: canonicalQuestion.id,
      questionVersion: canonicalQuestion.version,
      generationHash: canonicalQuestion.generationHash,
      questionType: "multiple_choice",
      ideaLinks: [canonicalQuestion.ideaLinks[0]],
    });
    expect(rendered.correctStableOptionIds).toEqual(["option-question-1-1"]);
    expect(buildLegacyResponseSnapshot(question, [1]).stableOptionIds).toEqual(["option-question-1-1"]);
    expect(legacyAnswerId("attempt-1", "question-1")).toBe("answer-attempt-1_question-1");
    expect(legacyAnswerEvidenceId("answer-1", "idea-1")).toBe(legacyAnswerEvidenceId("answer-1", "idea-1"));
    expect(legacyAnswerEvidenceId("answer-1", "idea-1")).not.toBe(legacyAnswerEvidenceId("answer-1", "idea-2"));
  });

  it("keeps canonical Idea evidence active without a rollout flag", () => {
    expect(isCanonicalIdeaEvidenceEnabled()).toBe(true);
  });
});
