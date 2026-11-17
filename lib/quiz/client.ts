import { mutationOptions } from "@tanstack/react-query";
import { z } from "zod";
import { jsonBody, requestVoid } from "@/lib/query/http";
import type { QuizPlayerProps } from "./player-types";

export const quizUploadSchema = z.object({
  success: z.literal(true), fileName: z.string(), fileSize: z.string(), key: z.string(),
});
export type QuizSubmission = { answers: Record<string, unknown>; durationSeconds: number };

export function submitQuiz(attemptId: string, submission: QuizSubmission) {
  return requestVoid(`/api/quiz/attempts/${encodeURIComponent(attemptId)}`, {
    method: "POST", ...jsonBody(submission),
  });
}
export function removeQuizAttachment(attemptId: string, fileKey: string) {
  return requestVoid("/api/quiz/attachments", { method: "DELETE", ...jsonBody({ attemptId, fileKey }) });
}
export function quizSubmissionMutation(attemptId: string, transport?: QuizPlayerProps["transport"]) {
  return mutationOptions({
    mutationKey: ["zyx", "v1", "quiz-submit", attemptId],
    mutationFn: (submission: QuizSubmission) => transport
      ? transport.submit(submission.answers, submission.durationSeconds)
      : submitQuiz(attemptId, submission),
    // Never queue a timed assessment for later or repeat a grade after an uncertain response.
    retry: false, networkMode: "always", gcTime: 0,
  });
}

/** Snapshot conversion is independent of React and never includes the answer key. */
export function formatQuizAnswers(answers: Record<string, unknown>, questions: QuizPlayerProps["exam"]["questions"]) {
  const formatted: Record<string, unknown> = {};
  for (const question of questions) {
    const value = answers[question.id];
    formatted[question.id] = value === undefined
      ? question.type === "short_answer" ? "" : question.type === "essay" ? { text: "", fileName: null, fileKey: null } : []
      : typeof value === "number" ? [value] : value;
  }
  return formatted;
}
