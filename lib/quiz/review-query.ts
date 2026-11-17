import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { queryKeys } from "@/lib/query/keys";
import { requestJson, requireAccount } from "@/lib/query/http";
import { isShortAnswerCorrect } from "./short-answer";

const questionSchema = z.object({
  id: z.string(), prompt: z.string(), options: z.array(z.string()),
  correct_indices: z.array(z.number()).optional(), correctIndices: z.array(z.number()).optional(),
  acceptable_answers: z.array(z.string()).optional(), acceptableAnswers: z.array(z.string()).optional(),
  type: z.string().optional(), question_type: z.string().optional(), questionType: z.string().optional(),
  origin: z.enum(["zyx_original", "historical_reference", "itb_example"]).optional(),
  sourceEventName: z.string().nullable().optional(), sourceReferenceId: z.string().nullable().optional(),
}).passthrough();
const mastery = z.object({ conceptName: z.string(), mastery: z.number() });
export const attemptReviewSchema = z.object({
  id: z.string(), studentId: z.string(), templateId: z.string(), score: z.number().nullable(),
  durationSeconds: z.number().nullable(), status: z.string(), submittedAt: z.string().nullable(),
  questionsSnapshot: z.array(questionSchema),
  answersSnapshot: z.record(z.string(), z.unknown()).nullable(),
  strongAreas: z.array(z.string()).nullable(), weakAreas: z.array(z.string()).nullable(),
  recommendedNextSteps: z.array(z.object({ id: z.string(), kind: z.enum(["flashcards", "quiz", "module"]), title: z.string(), count: z.number().optional(), href: z.string() })).nullable(),
  feedback: z.array(z.object({ questionIndex: z.number(), payload: z.object({ whyWrong: z.string(), misconceptionName: z.string().nullable().optional(), correctApproach: z.array(z.string()), reviewHref: z.string() }) })),
  remediation: z.object({
    concepts: z.array(z.object({ conceptName: z.string(), before: z.number(), after: z.number(), delta: z.number() })),
    rootCauses: z.array(mastery.extend({ blockedBy: z.array(mastery) })),
    misconceptions: z.array(z.object({ misconceptionName: z.string(), whyWrong: z.string(), reviewHref: z.string() })), estimatedMinutes: z.number(),
  }).nullable().optional(),
});
export type AttemptData = z.infer<typeof attemptReviewSchema>;

/** Determines whether a submitted student answer is correct during review. */
export function checkReviewAnswerCorrectness(q: z.infer<typeof questionSchema>, submitted: unknown): boolean {
  if (!q) return false;
  const qType = q.question_type || q.questionType || q.type;
  if (qType === "short_answer" || (Array.isArray(q.acceptable_answers) && q.acceptable_answers.length > 0) || (Array.isArray(q.acceptableAnswers) && q.acceptableAnswers.length > 0)) {
    const acceptable = Array.isArray(q.acceptable_answers) ? q.acceptable_answers : Array.isArray(q.acceptableAnswers) ? q.acceptableAnswers : [];
    return isShortAnswerCorrect(submitted, acceptable);
  }
  if (qType === "essay") {
    const text = typeof submitted === "string" ? submitted : Array.isArray(submitted) ? String(submitted[0] ?? "") : "";
    return text.trim().length > 0;
  }
  const indices = Array.isArray(submitted) ? submitted : [];
  const correct = Array.isArray(q.correct_indices) ? q.correct_indices : Array.isArray(q.correctIndices) ? q.correctIndices : [];
  if (correct.length === 0) return false;
  const isMultiple = qType === "multiple_choices" || correct.length > 1;
  if (!isMultiple && (qType === "multiple_choice" || !qType)) {
    const firstIdx = indices[0];
    return firstIdx !== undefined && correct.includes(firstIdx);
  }
  return indices.length === correct.length && indices.every((i: number) => correct.includes(i));
}

export function hasPendingFeedback(attempt: AttemptData): boolean {
  return attempt.questionsSnapshot.some((question, index) => {
    // Hidden reviews deliberately omit answer keys. Do not poll for feedback the server cannot release.
    const hasKey = Boolean(question.correct_indices?.length || question.correctIndices?.length || question.acceptable_answers?.length || question.acceptableAnswers?.length);
    return hasKey && !checkReviewAnswerCorrectness(question, attempt.answersSnapshot?.[question.id])
      && !attempt.feedback.some((feedback) => feedback.questionIndex === index);
  });
}

export function feedbackPollInterval(attempt: AttemptData | undefined, error: unknown, startedAt: number, now = Date.now()): number | false {
  if (error || now - startedAt >= 30_000) return false;
  return !attempt || hasPendingFeedback(attempt) ? 3_000 : false;
}

export function attemptReviewQuery(userId: string | null, attemptId: string) {
  return queryOptions({
    queryKey: queryKeys.attempt(userId, attemptId), enabled: Boolean(userId && attemptId),
    queryFn: ({ signal }) => {
      const owner = requireAccount(userId);
      return requestJson(`/api/quiz/attempts/${encodeURIComponent(attemptId)}`,
        attemptReviewSchema.refine((data) => data.id === attemptId && data.studentId === owner), { signal });
    },
    staleTime: 0,
    // Always re-check release/entitlement on mount. Do not persist answer keys in a browser cache.
    gcTime: 0,
    retry: false,
  });
}
