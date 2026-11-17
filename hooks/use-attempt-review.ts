"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryAccount } from "./use-query-account";
import { attemptReviewQuery, feedbackPollInterval } from "@/lib/quiz/review-query";

export function useAttemptReview(attemptId: string) {
  const userId = useQueryAccount();
  const [pollWindow, setPollWindow] = useState(() => ({ id: JSON.stringify([userId, attemptId]), startedAt: Date.now() }));
  const [timedOut, setTimedOut] = useState(false);
  const id = JSON.stringify([userId, attemptId]);
  useEffect(() => {
    if (pollWindow.id !== id) { setPollWindow({ id, startedAt: Date.now() }); setTimedOut(false); }
  }, [id, pollWindow.id]);
  useEffect(() => {
    const timeout = setTimeout(() => setTimedOut(true), Math.max(0, 30_000 - (Date.now() - pollWindow.startedAt)));
    return () => clearTimeout(timeout);
  }, [pollWindow]);
  const { data, error, refetch } = useQuery({
    ...attemptReviewQuery(userId, attemptId),
    refetchInterval: (query) => feedbackPollInterval(query.state.data, query.state.error, pollWindow.startedAt),
    refetchIntervalInBackground: false,
  });
  const retry = () => {
    setTimedOut(false);
    setPollWindow({ id, startedAt: Date.now() });
    return refetch();
  };
  return { attempt: error ? undefined : data, error, retry, timedOut };
}
