"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { quizAttemptQuery } from "@/lib/quiz/client";
import { needsQuizFeedback } from "@/lib/quiz/review";

export function useQuizAttempt(userId: string, attemptId: string) {
  const [pollExpired, setPollExpired] = useState(false);
  const [pollGeneration, setPollGeneration] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setPollExpired(true), 30_000);
    return () => window.clearTimeout(timer);
  }, [pollGeneration]);

  const query = useQuery({
    ...quizAttemptQuery(userId, attemptId),
    refetchInterval: (current) => !pollExpired && current.state.status !== "error" && needsQuizFeedback(current.state.data) ? 3000 : false,
  });
  const waiting = needsQuizFeedback(query.data);
  return {
    ...query,
    isFeedbackPending: waiting && !pollExpired && !query.error,
    isFeedbackTimeout: waiting && (pollExpired || Boolean(query.error)),
    retry: () => {
      setPollExpired(false);
      setPollGeneration((value) => value + 1);
      void query.refetch();
    },
  };
}
