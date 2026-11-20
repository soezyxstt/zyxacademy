"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { submitQuizAttempt } from "@/lib/quiz/client";
import type { QuizSubmission } from "@/lib/quiz/player-state";
import { invalidateLearningQueries } from "@/lib/query/invalidation";
import { queryKeys } from "@/lib/query/keys";
import { isQueryAccountCurrent } from "@/lib/query/client";

export function useQuizSubmission(userId: string, attemptId: string, courseId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationKey: queryKeys.quizzes.submit(userId, attemptId),
    mutationFn: (payload: QuizSubmission) => {
      if (!isQueryAccountCurrent(client, userId)) throw new Error("Quiz account changed");
      return submitQuizAttempt(attemptId, payload);
    },
    // A deadline submission must fail visibly offline, not queue for an unknown session.
    networkMode: "always",
    retry: false,
    gcTime: 0,
    onSuccess: () => {
      void invalidateLearningQueries(client, userId, { courseId, attemptId });
    },
  });
}
