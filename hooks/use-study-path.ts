"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { studyPathQuery, type StudyDayPlan, type StudyPathStep } from "@/lib/student/study-path-query";

export type StudyPathState = {
  steps: StudyPathStep[];
  dayPlan: StudyDayPlan[] | null;
  loading: boolean;
  planning: boolean;
  error: boolean;
  plan: (days: number) => void;
  showRoadmap: () => void;
  retry: () => void;
};

export function useStudyPath(userId: string, courseId: string): StudyPathState {
  const [days, setDays] = useState<number>();
  const query = useQuery({ ...studyPathQuery(userId, courseId, days), placeholderData: keepPreviousData });
  return {
    steps: query.data?.steps ?? [], dayPlan: query.data?.dayPlan ?? null,
    loading: query.isPending, planning: days !== undefined && query.isFetching,
    error: query.isError,
    plan: nextDays => {
      if (!Number.isInteger(nextDays) || nextDays < 1 || nextDays > 60) return;
      if (nextDays === days) void query.refetch(); else setDays(nextDays);
    },
    showRoadmap: () => setDays(undefined),
    retry: () => { void query.refetch(); },
  };
}

/** Public demo plans stay local and never enter private server caches. */
export function useLocalStudyPath(steps: StudyPathStep[]): StudyPathState {
  const [days, setDays] = useState<number>();
  const dayPlan = days === undefined ? null : Array.from({ length: Math.min(days, steps.length) }, (_, index) => {
    const daily = steps.filter((_, stepIndex) => stepIndex % days === index);
    return { day: index + 1, steps: daily, totalMinutes: daily.reduce((total, step) => total + step.estimatedMinutes, 0) };
  });
  return {
    steps, dayPlan, loading: false, planning: false, error: false,
    plan: value => { if (Number.isInteger(value) && value > 0 && value <= 60) setDays(value); },
    showRoadmap: () => setDays(undefined), retry: () => {},
  };
}
