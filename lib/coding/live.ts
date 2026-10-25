import { z } from "zod";
import { codingProblemPublicSchema, codingProblemPrivateSchema, codingEvaluationSchema, type CodingEvaluation, type CodingProblemPrivate } from "./contracts";

// Versioned extension. The existing choice socket protocol is unchanged.
export const liveCodingPolicySchema = z.object({
  maxAttempts: z.number().int().positive().max(100).nullable(),
  deadlineMs: z.number().int().positive(),
  assistance: z.enum(["disabled", "hints", "full"]),
  scoring: z.enum(["best", "latest"]),
}).strict();
export const liveCodingQuestionSchema = z.object({
  protocol: z.literal("live-coding.v1"),
  kind: z.literal("python"),
  sessionId: z.string().min(1),
  questionId: z.string().min(1),
  problem: codingProblemPublicSchema,
  policy: liveCodingPolicySchema,
}).strict();

/** Accept only server-loaded evaluations belonging to one learner/question.
 * Browser results and AI feedback are never leaderboard evidence.
 */
export function deriveLiveCodingScore(
  problem: CodingProblemPrivate,
  attempts: readonly CodingEvaluation[],
  scoring: "best" | "latest",
): number | null {
  const canonical = codingProblemPrivateSchema.parse(problem);
  const testIds = new Set([...canonical.publicTests, ...canonical.privateTests].map((test) => test.id));
  attempts = attempts.map((attempt) => codingEvaluationSchema.parse(attempt));
  if (attempts.some((item) => item.authority !== "trusted_server" || item.problem.problemId !== problem.problemId || item.problem.version !== problem.version)) {
    throw new Error("CODING_INVALID_SCORE_EVIDENCE");
  }
  const scores = attempts.filter((item) => item.verdict !== "ungradable").map((item) => {
    if (item.cases.length !== testIds.size || new Set(item.cases.map((test) => test.testId)).size !== testIds.size || item.cases.some((test) => !testIds.has(test.testId))) {
      throw new Error("CODING_INCOMPLETE_SCORE_EVIDENCE");
    }
    return item.cases.filter((test) => test.passed).length / item.cases.length;
  });
  return !scores.length ? null : scoring === "best" ? Math.max(...scores) : scores[scores.length - 1];
}
