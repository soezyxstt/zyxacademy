import { createHash } from "node:crypto";
import { answerToStableOptionIds } from "@/lib/asesmen/attempt";

export const LEGACY_IDEA_EVIDENCE_RUBRIC_VERSION = "legacy-quiz-idea.v1";

const REQUIRED_CANONICAL_FLAGS = [
  "FEATURE_ARSITEKTUR_IDE_V1",
  "FEATURE_DUAL_WRITE_IDE",
  "FEATURE_ASESMEN_IDE_V1",
  "FEATURE_PEMAHAMAN_IDE_V1",
] as const;

export type LegacyQuizQuestionType =
  | "multiple_choice"
  | "multiple_choices"
  | "short_answer"
  | "essay";

export type LegacyQuizQuestionSnapshot = {
  id: string;
  prompt?: string;
  options?: unknown[];
  question_type?: string;
  questionType?: string;
  stable_option_ids?: string[];
  correct_indices?: number[];
  acceptable_answers?: string[];
};

export type CanonicalIdeaLinkForLegacyQuestion = {
  ideaId: string;
  weight: number;
  role: "primary" | "supporting" | "required";
  ideaStatus: string;
  ideaVersion: number;
};

export type CanonicalQuestionForLegacyEvidence = {
  id: string;
  status: string;
  version: number;
  questionType: string;
  generationHash: string;
  ideaLinks: readonly CanonicalIdeaLinkForLegacyQuestion[];
};

export type LegacyMappingIssueCode =
  | "EMPTY_SNAPSHOT"
  | "DUPLICATE_SNAPSHOT_QUESTION"
  | "MISSING_CANONICAL_QUESTION"
  | "CANONICAL_QUESTION_NOT_PUBLISHED"
  | "QUESTION_TYPE_MISMATCH"
  | "MISSING_CANONICAL_IDEA_LINK"
  | "AMBIGUOUS_CANONICAL_IDEA_LINKS"
  | "CANONICAL_IDEA_WEIGHTS_INVALID"
  | "CANONICAL_IDEA_NOT_PUBLISHED";

export type LegacyMappingIssue = {
  questionId: string;
  code: LegacyMappingIssueCode;
};

export type MappedLegacyQuestion = {
  questionId: string;
  questionVersion: number;
  generationHash: string;
  questionType: LegacyQuizQuestionType;
  ideaLinks: readonly CanonicalIdeaLinkForLegacyQuestion[];
};

export type LegacyQuizIdeaMappingPlan =
  | {
      status: "mapped";
      mappings: readonly MappedLegacyQuestion[];
      issues: readonly [];
    }
  | {
      status: "blocked";
      mappings: readonly MappedLegacyQuestion[];
      issues: readonly LegacyMappingIssue[];
    };

export type LegacyAnswerEvidenceContribution = {
  ideaId: string;
  scoreContribution: 0 | 1;
  weight: number;
  confidence: 100;
  evidenceSource: "deterministic_rubric";
  rubricVersion: typeof LEGACY_IDEA_EVIDENCE_RUBRIC_VERSION;
  derivationStatus: "deterministic";
  ambiguous: false;
  affectsMastery: true;
};

export type LegacyAnswerEvidenceResult =
  | {
      status: "derived";
      contributions: readonly LegacyAnswerEvidenceContribution[];
      reasonCode: null;
    }
  | {
      status: "blocked";
      contributions: readonly [];
      reasonCode:
        | "UNREVIEWED_FREE_RESPONSE"
        | "MISSING_STABLE_OPTION_IDS"
        | "INVALID_DETERMINISTIC_GRADING"
        | "AMBIGUOUS_IDEA_MAPPING";
    };

export type LegacyFeatureEnvironment = Partial<Record<(typeof REQUIRED_CANONICAL_FLAGS)[number], string | undefined>>;

export function isCanonicalIdeaEvidenceEnabled(environment: LegacyFeatureEnvironment): boolean {
  return REQUIRED_CANONICAL_FLAGS.every((flag) => environment[flag] === "1");
}

export function questionTypeOf(question: LegacyQuizQuestionSnapshot): LegacyQuizQuestionType | null {
  const value = question.question_type ?? question.questionType;
  if (value === "multiple_choice" || value === "multiple_choices" || value === "short_answer" || value === "essay") {
    return value;
  }
  return null;
}

function issue(questionId: string, code: LegacyMappingIssueCode): LegacyMappingIssue {
  return { questionId, code };
}

export function mapLegacyQuizSnapshotToCanonicalIdeas(input: {
  questions: readonly LegacyQuizQuestionSnapshot[];
  canonicalQuestions: readonly CanonicalQuestionForLegacyEvidence[];
}): LegacyQuizIdeaMappingPlan {
  if (input.questions.length === 0) {
    return { status: "blocked", mappings: [], issues: [issue("", "EMPTY_SNAPSHOT")] };
  }

  const canonicalById = new Map(input.canonicalQuestions.map((question) => [question.id, question]));
  const seenQuestionIds = new Set<string>();
  const mappings: MappedLegacyQuestion[] = [];
  const issues: LegacyMappingIssue[] = [];

  for (const question of input.questions) {
    if (seenQuestionIds.has(question.id)) {
      issues.push(issue(question.id, "DUPLICATE_SNAPSHOT_QUESTION"));
      continue;
    }
    seenQuestionIds.add(question.id);

    const questionType = questionTypeOf(question);
    const canonical = canonicalById.get(question.id);
    if (!canonical) {
      issues.push(issue(question.id, "MISSING_CANONICAL_QUESTION"));
      continue;
    }
    if (canonical.status !== "published") {
      issues.push(issue(question.id, "CANONICAL_QUESTION_NOT_PUBLISHED"));
      continue;
    }
    if (!questionType || canonical.questionType !== questionType) {
      issues.push(issue(question.id, "QUESTION_TYPE_MISMATCH"));
      continue;
    }
    if (canonical.ideaLinks.length === 0) {
      issues.push(issue(question.id, "MISSING_CANONICAL_IDEA_LINK"));
      continue;
    }

    const uniqueIdeaIds = new Set(canonical.ideaLinks.map((link) => link.ideaId));
    if (uniqueIdeaIds.size !== canonical.ideaLinks.length) {
      issues.push(issue(question.id, "AMBIGUOUS_CANONICAL_IDEA_LINKS"));
      continue;
    }
    const weightSum = canonical.ideaLinks.reduce((sum, link) => sum + link.weight, 0);
    if (canonical.ideaLinks.some((link) => !Number.isFinite(link.weight) || link.weight <= 0) || Math.abs(weightSum - 1) > 0.000001) {
      issues.push(issue(question.id, "CANONICAL_IDEA_WEIGHTS_INVALID"));
      continue;
    }
    if (canonical.ideaLinks.some((link) => link.ideaStatus !== "published")) {
      issues.push(issue(question.id, "CANONICAL_IDEA_NOT_PUBLISHED"));
      continue;
    }

    mappings.push({
      questionId: canonical.id,
      questionVersion: canonical.version,
      generationHash: canonical.generationHash,
      questionType,
      ideaLinks: canonical.ideaLinks,
    });
  }

  return issues.length > 0
    ? { status: "blocked", mappings, issues }
    : { status: "mapped", mappings, issues: [] };
}

function deterministicGradingIsValid(question: LegacyQuizQuestionSnapshot, questionType: LegacyQuizQuestionType): boolean {
  const stableOptionIds = question.stable_option_ids;
  const correctIndices = question.correct_indices;
  if (!stableOptionIds || stableOptionIds.length === 0 || new Set(stableOptionIds).size !== stableOptionIds.length) return false;
  if (!correctIndices || correctIndices.length === 0 || new Set(correctIndices).size !== correctIndices.length) return false;
  if (correctIndices.some((index) => !Number.isInteger(index) || index < 0 || index >= stableOptionIds.length)) return false;
  return questionType === "multiple_choice" ? correctIndices.length === 1 : true;
}

export function deriveLegacyAnswerEvidence(input: {
  question: LegacyQuizQuestionSnapshot;
  mapping: MappedLegacyQuestion;
  isCorrect: boolean;
}): LegacyAnswerEvidenceResult {
  if (input.mapping.ideaLinks.length === 0) {
    return { status: "blocked", contributions: [], reasonCode: "AMBIGUOUS_IDEA_MAPPING" };
  }
  if (input.mapping.questionType === "short_answer" || input.mapping.questionType === "essay") {
    return { status: "blocked", contributions: [], reasonCode: "UNREVIEWED_FREE_RESPONSE" };
  }
  if (!deterministicGradingIsValid(input.question, input.mapping.questionType)) {
    return { status: "blocked", contributions: [], reasonCode: "INVALID_DETERMINISTIC_GRADING" };
  }

  return {
    status: "derived",
    reasonCode: null,
    contributions: input.mapping.ideaLinks.map((link) => ({
        ideaId: link.ideaId,
        scoreContribution: input.isCorrect ? 1 : 0,
        weight: link.weight,
        confidence: 100,
        evidenceSource: "deterministic_rubric",
        rubricVersion: LEGACY_IDEA_EVIDENCE_RUBRIC_VERSION,
        derivationStatus: "deterministic",
        ambiguous: false,
        affectsMastery: true,
      })),
  };
}

export function buildLegacyRenderedQuestionSnapshot(question: LegacyQuizQuestionSnapshot): Record<string, unknown> {
  return {
    id: question.id,
    prompt: question.prompt ?? "",
    question_type: questionTypeOf(question),
    options: Array.isArray(question.options) ? question.options : [],
    stable_option_ids: question.stable_option_ids ?? [],
  };
}

export function buildLegacyGradingPolicySnapshot(
  question: LegacyQuizQuestionSnapshot,
  mapping: MappedLegacyQuestion,
): Record<string, unknown> {
  const stableOptionIds = question.stable_option_ids ?? [];
  const correctIndices = question.correct_indices ?? [];
  const correctStableOptionIds = correctIndices
    .filter((index) => Number.isInteger(index) && index >= 0 && index < stableOptionIds.length)
    .map((index) => stableOptionIds[index]);

  return {
    source: "legacy_exact_canonical_idea_link",
    version: LEGACY_IDEA_EVIDENCE_RUBRIC_VERSION,
    questionId: mapping.questionId,
    questionType: mapping.questionType,
    stableOptionIds,
    correctStableOptionIds,
    ideaLinks: mapping.ideaLinks.map((link) => ({ ideaId: link.ideaId, weight: link.weight, role: link.role })),
    freeResponseReviewRequired: mapping.questionType === "short_answer" || mapping.questionType === "essay",
  };
}

export function buildLegacyResponseSnapshot(question: LegacyQuizQuestionSnapshot, answer: unknown): Record<string, unknown> {
  return {
    value: answer ?? null,
    stableOptionIds: answerToStableOptionIds(question.stable_option_ids ?? [], answer),
  };
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 40);
}

function stableLegacyId(prefix: string, sourceId: string): string {
  const normalized = sourceId.replace(/[^A-Za-z0-9._-]/g, "_");
  if (normalized.length <= 48) return `${prefix}-${normalized}`;
  return `${prefix}-${createHash("sha256").update(`${prefix}:${sourceId}`).digest("hex").slice(0, 24)}`;
}

export function legacyItemId(assessmentId: string, questionId: string): string {
  return stableLegacyId("item", `${assessmentId}:${questionId}`);
}

export function legacyAnswerId(attemptId: string, questionId: string): string {
  return stableLegacyId("answer", `${attemptId}:${questionId}`);
}

export function legacyAnswerEvidenceId(answerId: string, ideaId: string): string {
  return `bukti-${digest(`${answerId}|${ideaId}|${LEGACY_IDEA_EVIDENCE_RUBRIC_VERSION}`)}`;
}
