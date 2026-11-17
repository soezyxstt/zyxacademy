"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { planDemoStudyDays, studyPathQuery, type StudyPathStep } from "@/lib/query/study-path";

const emptySteps: StudyPathStep[] = [];
export function useStudyPath(userId: string | null, courseId: string, initialSteps?: StudyPathStep[]) {
  const [daysInput, setDaysInput] = useState("");
  const [days, setDays] = useState<number | null>(null);
  const { data, isPending, isFetching, isError, refetch } = useQuery({
    ...studyPathQuery(userId, courseId, days), enabled: initialSteps === undefined && Boolean(userId),
  });
  const fetchStudyPath = (requestedDays?: number) => {
    const next = requestedDays === undefined ? null : Math.min(60, Math.max(1, requestedDays));
    if (!Number.isFinite(next ?? 0)) return;
    if (next === days && initialSteps === undefined) void refetch();
    setDays(next);
  };
  return {
    daysInput, setDaysInput, fetchStudyPath,
    steps: initialSteps ?? (isError ? emptySteps : data?.steps ?? emptySteps),
    dayPlan: initialSteps ? planDemoStudyDays(initialSteps, days) : days !== null ? data?.dayPlan ?? null : null,
    clearPlan: () => setDays(null),
    loading: initialSteps === undefined && isPending,
    planning: initialSteps === undefined && days !== null && isFetching,
    failed: initialSteps === undefined && isError,
  };
}
