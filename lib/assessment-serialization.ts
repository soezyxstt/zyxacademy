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
  tags?: string[];
  correct_indices?: number[];
  correctIndices?: number[];
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
    const clean: QuestionClientView = {
      id: String(q.id ?? ''),
      prompt: String(q.prompt ?? ''),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
    };

    if (q.difficulty) clean.difficulty = String(q.difficulty);
    if (Array.isArray(q.tags)) clean.tags = q.tags.map(String);

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
