import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { queryKeys } from "./keys";
import { requestJson, requireAccount } from "./http";

export const studyPathStepSchema = z.object({
  stepId: z.string(), ideaId: z.string().nullable(), chapterId: z.string(), chapterTitle: z.string(),
  chapterOrder: z.number(), conceptName: z.string(), status: z.enum(["locked", "available", "in_progress", "mastered"]),
  actions: z.object({ moduleHref: z.string().optional(), quizTemplateId: z.string().optional(), flashcardCount: z.number().optional() }),
  estimatedMinutes: z.number(), prerequisites: z.array(z.string()), masteryScore: z.number().optional(), priorityReason: z.string(),
});
export const studyPathSchema = z.object({
  steps: z.array(studyPathStepSchema),
  dayPlan: z.array(z.object({ day: z.number(), steps: z.array(studyPathStepSchema), totalMinutes: z.number() })).nullable(),
});
export type StudyPathStep = z.infer<typeof studyPathStepSchema>;
export type StudyDayPlan = NonNullable<z.infer<typeof studyPathSchema>["dayPlan"]>[number];

export const studyPathQuery = (userId: string | null, courseId: string, days: number | null) => queryOptions({
  queryKey: queryKeys.studyPath(userId, courseId, days), enabled: Boolean(userId && courseId),
  queryFn: ({ signal }) => {
    requireAccount(userId);
    const params = new URLSearchParams({ courseId });
    if (days !== null) params.set("days", String(days));
    return requestJson(`/api/student/study-path?${params}`, studyPathSchema, { signal });
  },
  staleTime: 60_000,
  placeholderData: (previous, query) => JSON.stringify(query?.queryKey.slice(0, -1)) === JSON.stringify(queryKeys.studyPaths(userId, courseId)) ? previous : undefined,
});

export function planDemoStudyDays(steps: StudyPathStep[], days: number | null): StudyDayPlan[] | null {
  if (!days) return null;
  return Array.from({ length: Math.min(days, steps.length) }, (_, index) => {
    const daily = steps.filter((_, stepIndex) => stepIndex % days === index);
    return { day: index + 1, steps: daily, totalMinutes: daily.reduce((total, step) => total + step.estimatedMinutes, 0) };
  });
}
