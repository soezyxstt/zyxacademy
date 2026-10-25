import { codingSubmissionRequestSchema, type CodingEvaluation, type CodingSubmissionRequest } from "./contracts";

export interface CodingAttempt {
  id: string;
  learnerId: string;
  courseId: string;
  surface: "article" | "live_quiz";
  surfaceId: string;
  ordinal: number;
  request: CodingSubmissionRequest;
  evaluation: CodingEvaluation | null;
}

/** Persistence adapter must reserve atomically, with a unique key on
 * (learnerId, surface, surfaceId, requestId). Same key + different payload is a conflict.
 * It must enforce maxAttempts and deadline against server time inside that transaction.
 * A repeated request returns the original immutable snapshot, never regrades it.
 */
export interface CodingAttemptRepository {
  reserve(input: {
    learnerId: string;
    courseId: string;
    surface: CodingAttempt["surface"];
    surfaceId: string;
    request: CodingSubmissionRequest;
    maxAttempts: number | null;
    deadlineMs: number | null;
  }): Promise<{ created: boolean; attempt: CodingAttempt }>;
  complete(attemptId: string, evaluation: CodingEvaluation): Promise<CodingAttempt>;
}

export async function submitCodingAttempt(
  repository: CodingAttemptRepository,
  input: Parameters<CodingAttemptRepository["reserve"]>[0],
  evaluate: (request: CodingSubmissionRequest) => Promise<CodingEvaluation>,
): Promise<CodingAttempt> {
  const request = codingSubmissionRequestSchema.parse(input.request);
  const reserved = await repository.reserve({ ...input, request });
  if (!reserved.created) return reserved.attempt;
  const evaluation = await evaluate(request);
  if (evaluation.authority !== "trusted_server") throw new Error("CODING_TRUSTED_EVALUATION_REQUIRED");
  if (evaluation.problem.problemId !== request.problem.problemId || evaluation.problem.version !== request.problem.version) {
    throw new Error("CODING_PROBLEM_VERSION_MISMATCH");
  }
  return repository.complete(reserved.attempt.id, evaluation);
}
