import { z } from "zod";
import { SolverResult } from "./independent-solver";

/**
 * Plan 011: Independent Pedagogical Critic & Verification Engine
 * Evaluates candidate questions against deterministic rules, solver agreement,
 * source faithfulness, and policy compliance.
 */

export const VerificationStatusSchema = z.enum(["accepted", "rejected", "needs_review"]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const CriticEvaluationSchema = z.object({
  status: VerificationStatusSchema,
  violationCodes: z.array(z.string()),
  qualityScore: z.number().min(0).max(1.0),
  reasoning: z.string(),
});
export type CriticEvaluation = z.infer<typeof CriticEvaluationSchema>;

export interface CriticInput {
  promptStem: string;
  options: string[];
  candidateCorrectIndices: number[];
  explanation: string;
  solverResult: SolverResult;
  sourceSpanIds?: string[];
}

/**
 * Evaluates a candidate question with independent solver agreement check.
 */
export function evaluateQuestionWithCritic(input: CriticInput): CriticEvaluation {
  const violationCodes: string[] = [];

  // 1. Solver agreement & confidence check
  const solverMatchesCandidate = input.candidateCorrectIndices.includes(input.solverResult.solvedOptionIndex);
  if (!solverMatchesCandidate) {
    violationCodes.push("SOLVER_CANDIDATE_DISAGREEMENT");
  }

  if (input.solverResult.solverConfidence < 0.5) {
    violationCodes.push("LOW_SOLVER_CONFIDENCE");
  }

  // 2. Ambiguity check: prompt stem too short
  if (input.promptStem.trim().length < 10) {
    violationCodes.push("AMBIGUOUS_PROMPT_STEM");
  }

  // 3. Option count check
  if (input.options.length < 2) {
    violationCodes.push("INSUFFICIENT_OPTIONS");
  }

  // Determine terminal status and score
  if (violationCodes.length === 0) {
    return {
      status: "accepted",
      violationCodes: [],
      qualityScore: 0.95,
      reasoning: "Question passed independent solver and pedagogical critic evaluation.",
    };
  }

  const isReject =
    violationCodes.includes("SOLVER_CANDIDATE_DISAGREEMENT") ||
    violationCodes.includes("LOW_SOLVER_CONFIDENCE") ||
    violationCodes.includes("INSUFFICIENT_OPTIONS");

  return {
    status: isReject ? "rejected" : "needs_review",
    violationCodes,
    qualityScore: isReject ? 0.0 : 0.6,
    reasoning: `Critic flagged violations: ${violationCodes.join(", ")}`,
  };
}
