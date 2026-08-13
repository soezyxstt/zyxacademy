import { z } from "zod";

export const EVIDENCE_RUBRIC_VERSION = "1.0";
const WEIGHT_TOLERANCE = 0.000001;

export const evidenceKindSchema = z.enum(["mastery", "misconception"]);
export type EvidenceKind = z.infer<typeof evidenceKindSchema>;

export const evidenceContributionSchema = z.object({
  ideaId: z.string().min(1),
  contribution: z.number().finite().min(-1).max(1),
  weight: z.number().finite().positive().max(1),
  confidence: z.number().finite().min(0).max(1),
  evidenceSource: z.enum(["deterministic_rubric", "tutor_rubric", "reviewed_grade"]),
  kind: evidenceKindSchema,
  ambiguous: z.boolean().default(false),
  affectsMastery: z.boolean().default(true),
  misconceptionIdeaId: z.string().min(1).nullable().default(null),
});
export type EvidenceContribution = z.infer<typeof evidenceContributionSchema>;

export const evidenceOutcomeSchema = z.object({
  outcomeId: z.string().min(1),
  stableOptionIds: z.array(z.string().min(1)).min(1),
  contributions: z.array(evidenceContributionSchema).min(1),
});
export type EvidenceOutcome = z.infer<typeof evidenceOutcomeSchema>;

export const evidenceRubricSchema = z.object({
  version: z.string().min(1),
  questionId: z.string().min(1),
  questionType: z.enum(["multiple_choice", "multiple_choices", "short_answer", "essay"]),
  ideaWeights: z.record(z.string().min(1), z.number().finite().positive().max(1)),
  outcomes: z.array(evidenceOutcomeSchema).min(1),
  provenance: z.enum(["deterministic_rubric", "tutor_rubric", "reviewed_grade", "ai_proposal"]),
  reviewed: z.boolean(),
  reviewerId: z.string().min(1).nullable().default(null),
});
export type EvidenceRubric = z.infer<typeof evidenceRubricSchema>;

export interface EvidenceValidationResult {
  valid: boolean;
  errors: string[];
}

export interface AnswerEvidenceInput {
  rubric: EvidenceRubric;
  answer: string | readonly string[] | null | undefined;
  reviewedResult?: {
    outcomeId: string;
    reviewed: boolean;
  };
}

export interface DerivedAnswerEvidence {
  status: "derived" | "ambiguous" | "blocked" | "rejected";
  outcomeId: string | null;
  contributions: EvidenceContribution[];
  affectsMastery: boolean;
  reasonCode: string | null;
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= WEIGHT_TOLERANCE;
}

function normalizeAnswer(answer: AnswerEvidenceInput["answer"]): string[] {
  if (typeof answer === "string") return [answer];
  if (Array.isArray(answer)) return [...new Set(answer.map(String))].sort();
  return [];
}

/** Validates the published-question evidence contract without doing I/O. */
export function validateEvidenceRubric(input: unknown): EvidenceValidationResult {
  const parsed = evidenceRubricSchema.safeParse(input);
  if (!parsed.success) {
    return { valid: false, errors: parsed.error.issues.map((issue) => issue.message) };
  }

  const rubric = parsed.data;
  const ideaWeightTotal = Object.values(rubric.ideaWeights).reduce((sum, weight) => sum + weight, 0);
  const errors: string[] = [];
  if (!nearlyEqual(ideaWeightTotal, 1)) {
    errors.push(`Idea weights must sum to 1 within ${WEIGHT_TOLERANCE}`);
  }
  if (rubric.questionType === "multiple_choice" && rubric.outcomes.some((outcome) => outcome.stableOptionIds.length !== 1)) {
    errors.push("multiple_choice outcomes must map to exactly one stable option ID");
  }
  if (rubric.provenance === "ai_proposal" && rubric.reviewed) {
    errors.push("an AI proposal cannot be marked reviewed without a reviewed tutor or grade provenance");
  }
  if (rubric.questionType === "multiple_choice" || rubric.questionType === "multiple_choices") {
    if (rubric.provenance !== "deterministic_rubric") {
      errors.push("objective questions require a versioned deterministic rubric");
    }
  } else if (rubric.provenance !== "tutor_rubric" && rubric.provenance !== "reviewed_grade" && rubric.provenance !== "ai_proposal") {
    errors.push("free-response evidence requires a tutor rubric or reviewed grading result");
  }
  if (rubric.reviewed && !rubric.reviewerId) {
    errors.push("reviewed rubrics require reviewerId");
  }

  const seenOptionIds = new Set<string>();
  for (const outcome of rubric.outcomes) {
    for (const stableOptionId of outcome.stableOptionIds) {
      if (seenOptionIds.has(stableOptionId)) errors.push(`stable option ${stableOptionId} maps to multiple outcomes`);
      seenOptionIds.add(stableOptionId);
    }
    for (const contribution of outcome.contributions) {
      if (!Object.hasOwn(rubric.ideaWeights, contribution.ideaId)) {
        errors.push(`evidence contribution references unmapped Idea ${contribution.ideaId}`);
      }
      if (contribution.kind === "misconception" && contribution.affectsMastery) {
        errors.push("misconception evidence cannot affect mastery");
      }
      if (contribution.ambiguous && contribution.affectsMastery) {
        errors.push("ambiguous evidence cannot affect mastery");
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

export function deriveAnswerEvidence(input: AnswerEvidenceInput): DerivedAnswerEvidence {
  const validation = validateEvidenceRubric(input.rubric);
  if (!validation.valid) {
    return {
      status: "rejected",
      outcomeId: null,
      contributions: [],
      affectsMastery: false,
      reasonCode: "INVALID_RUBRIC",
    };
  }

  const rubric = evidenceRubricSchema.parse(input.rubric);
  if (rubric.questionType === "essay" || rubric.questionType === "short_answer") {
    if (rubric.provenance === "ai_proposal" || !rubric.reviewed || input.reviewedResult?.reviewed !== true) {
      return {
        status: "blocked",
        outcomeId: null,
        contributions: [],
        affectsMastery: false,
        reasonCode: "FREE_RESPONSE_REVIEW_REQUIRED",
      };
    }
  }

  const selected = normalizeAnswer(input.answer);
  const outcomeId = input.reviewedResult?.outcomeId;
  const outcome = outcomeId
    ? rubric.outcomes.find((candidate) => candidate.outcomeId === outcomeId)
    : rubric.outcomes.find((candidate) => JSON.stringify(candidate.stableOptionIds.slice().sort()) === JSON.stringify(selected));

  if (!outcome) {
    return {
      status: "ambiguous",
      outcomeId: null,
      contributions: [],
      affectsMastery: false,
      reasonCode: "NO_EXACT_RUBRIC_OUTCOME",
    };
  }

  const contributions = outcome.contributions.map((contribution) => ({
    ...contribution,
    affectsMastery: contribution.affectsMastery && !contribution.ambiguous && contribution.kind !== "misconception",
  }));
  return {
    status: "derived",
    outcomeId: outcome.outcomeId,
    contributions,
    affectsMastery: contributions.some((contribution) => contribution.affectsMastery),
    reasonCode: null,
  };
}

export function validateQuestionEvidence(input: unknown): EvidenceValidationResult {
  return validateEvidenceRubric(input);
}

export const derivePerIdeaEvidence = deriveAnswerEvidence;
