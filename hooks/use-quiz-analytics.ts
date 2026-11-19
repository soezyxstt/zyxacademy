"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { quizAnalyticsQuery, recomputeQuizAnalytics } from "@/lib/quiz/analytics-client";
import { isQueryAccountCurrent } from "@/lib/query/client";

export function useQuizAnalytics(userId: string, attemptId: string) {
  const client = useQueryClient();
  const options = quizAnalyticsQuery(userId, attemptId);
  const query = useQuery(options);
  const recompute = useMutation({
    mutationKey: [...options.queryKey, "recompute"],
    retry: false,
    networkMode: "always",
    mutationFn: () => {
      if (!isQueryAccountCurrent(client, userId)) throw new Error("Quiz account changed");
      return recomputeQuizAnalytics(attemptId);
    },
    onSuccess: async () => {
      if (!isQueryAccountCurrent(client, userId)) return;
      await client.invalidateQueries({ queryKey: options.queryKey, exact: true });
    },
  });
  return { query, recompute };
}
