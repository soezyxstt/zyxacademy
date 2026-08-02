/**
 * Assessment Serialization and Redaction Layer.
 * Guarantees active attempts never leak correct_indices, stored explanations, or grading feedback.
 */

import { AnswerReleaseState } from './assessment-assistance-policy';

export interface QuestionClientView {
  id: string;
  prompt: string;
  options: string[];
  difficulty?: string;
  question_type?: string;
  questionType?: string;
  tags?: string[];
  stable_option_ids?: string[];
  correct_indices?: number[];
  correctIndices?: number[];
  acceptable_answers?: string[];
  acceptableAnswers?: string[];
  explanation?: string;
}

export interface SerializeAttemptOptions {
  releaseState?: AnswerReleaseState;
}

/**
 * Sanitizes a question snapshot array based on attempt status and release policy.
 */
export function sanitizeQuestionsSnapshot(
  questions: Record<string, any>[] | null | undefined,
  attemptStatus: string,
  releaseState: AnswerReleaseState = 'released'
): QuestionClientView[] {
  if (!Array.isArray(questions)) return [];

  const isInProgress = attemptStatus === 'in_progress' || attemptStatus === 'submitted';

  return questions.map((q) => {
    const qType = q.question_type || q.questionType;
    const clean: QuestionClientView = {
      id: String(q.id ?? ''),
      prompt: String(q.prompt ?? ''),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
    };

    if (qType) {
      clean.question_type = String(qType);
      clean.questionType = String(qType);
    }
    if (q.difficulty) clean.difficulty = String(q.difficulty);
    if (Array.isArray(q.tags)) clean.tags = q.tags.map(String);
    if (Array.isArray(q.stable_option_ids)) clean.stable_option_ids = q.stable_option_ids.map(String);
    if (Array.isArray(q.stableOptionIds)) clean.stable_option_ids = q.stableOptionIds.map(String);

    if (isInProgress) {
      // In-progress or submitted attempts MUST NEVER reveal answers or explanations
      return clean;
    }

    // Completed attempts respect release state
    if (releaseState === 'hidden') {
      return clean;
    }

    if (releaseState === 'rationale_only') {
      if (q.explanation) clean.explanation = String(q.explanation);
      return clean;
    }

    // Released: include full solution details
    if (Array.isArray(q.correct_indices)) clean.correct_indices = q.correct_indices;
    if (Array.isArray(q.correctIndices)) clean.correctIndices = q.correctIndices;
    if (Array.isArray(q.acceptable_answers)) clean.acceptable_answers = q.acceptable_answers;
    if (Array.isArray(q.acceptableAnswers)) clean.acceptableAnswers = q.acceptableAnswers;
    if (q.explanation) clean.explanation = String(q.explanation);

    return clean;
  });
}

/**
 * Serializes a single student quiz attempt object, stripping protected fields for active attempts.
 */
export function serializeStudentQuizAttempt(
  attempt: Record<string, any>,
  options?: SerializeAttemptOptions
): Record<string, any> {
  if (!attempt || typeof attempt !== 'object') return {};

  const status = String(attempt.status ?? 'in_progress');
  const isInProgress = status === 'in_progress' || status === 'submitted';
  const releaseState: AnswerReleaseState = options?.releaseState ?? (isInProgress ? 'hidden' : 'released');

  const sanitizedQuestions = sanitizeQuestionsSnapshot(
    attempt.questionsSnapshot as Record<string, any>[],
    status,
    releaseState
  );

  if (isInProgress) {
    return {
      id: attempt.id,
      studentId: attempt.studentId,
      templateId: attempt.templateId,
      status: attempt.status,
      startedAt: attempt.startedAt,
      submittedAt: null,
      score: null,
      durationSeconds: attempt.durationSeconds ?? null,
      questionsSnapshot: sanitizedQuestions,
      answersSnapshot: attempt.answersSnapshot ?? null,
      masteryBefore: attempt.masteryBefore ?? null,
      strongAreas: null,
      weakAreas: null,
      recommendedNextSteps: null,
      feedback: [],
      remediation: null,
    };
  }

  // Completed attempt
  return {
    ...attempt,
    questionsSnapshot: sanitizedQuestions,
    feedback: releaseState === 'hidden' ? [] : (attempt.feedback ?? []),
    remediation: releaseState === 'hidden' ? null : (attempt.remediation ?? null),
  };
}

/**
 * Serializes an array of student quiz attempts.
 */
export function serializeStudentQuizAttemptList(
  attempts: Record<string, any>[],
  options?: SerializeAttemptOptions
): Record<string, any>[] {
  if (!Array.isArray(attempts)) return [];
  return attempts.map((att) => serializeStudentQuizAttempt(att, options));
}

const PROTECTED_ASSESSMENT_KEYS = new Set([
  "correct_indices",
  "correctIndices",
  "acceptable_answers",
  "acceptableAnswers",
  "explanation",
  "gradingRubric",
  "gradingPolicy",
  "correctStableOptionIds",
  "correct_stable_option_ids",
  "evidenceMappings",
  "evidence_mapping",
  "holdoutContent",
  "holdout_content",
]);

export function findAssessmentLeakKeys(value: unknown, path = "root"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findAssessmentLeakKeys(item, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];

  const findings: string[] = [];
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = `${path}.${key}`;
    if (PROTECTED_ASSESSMENT_KEYS.has(key)) findings.push(nextPath);
    findings.push(...findAssessmentLeakKeys(nested, nextPath));
  }
  return findings;
}
