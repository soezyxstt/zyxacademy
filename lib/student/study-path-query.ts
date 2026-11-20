import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { requestJson } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";

export const studyPathStepSchema = z.object({
  stepId: z.string(), ideaId: z.string().nullable(), chapterId: z.string(),
  chapterTitle: z.string(), chapterOrder: z.number(), conceptName: z.string(),
  status: z.enum(["locked", "available", "in_progress", "mastered"]),
  actions: z.object({ moduleHref: z.string().optional(), quizTemplateId: z.string().optional(), flashcardCount: z.number().optional() }),
  estimatedMinutes: z.number().nonnegative(), prerequisites: z.array(z.string()),
  masteryScore: z.number().optional(), priorityReason: z.string(),
});
const studyDayPlanSchema = z.object({ day: z.number().int().positive(), steps: z.array(studyPathStepSchema), totalMinutes: z.number().nonnegative() });
export const studyPathSchema = z.object({ steps: z.array(studyPathStepSchema), dayPlan: z.array(studyDayPlanSchema).nullable() });
export type StudyPathStep = z.infer<typeof studyPathStepSchema>;
export type StudyDayPlan = z.infer<typeof studyDayPlanSchema>;

export function studyPathQuery(userId: string, courseId: string, days?: number) {
  return queryOptions({
    queryKey: queryKeys.student.studyPath(userId, courseId, days),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ courseId });
      if (days !== undefined) params.set("days", String(days));
      return requestJson(`/api/student/study-path?${params}`, studyPathSchema, { signal, headers: { "x-student-id": userId } });
    },
    enabled: !!userId && !!courseId,
    staleTime: 60_000,
    // The GET may compute and persist a missing study path.
    retry: false,
  });
}
