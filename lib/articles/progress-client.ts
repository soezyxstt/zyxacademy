import { mutationOptions } from "@tanstack/react-query";
import { z } from "zod";
import { queryKeys } from "@/lib/query/keys";
import { jsonBody, requestJson, requireAccount } from "@/lib/query/http";

export const sectionProgressSchema = z.object({
  success: z.literal(true), sectionId: z.string(), maxReadPercent: z.number().min(0).max(100),
  completed: z.boolean(), timeSpentSeconds: z.number().nonnegative(), completedAt: z.string().nullable(),
});
export type SavedSectionProgress = z.infer<typeof sectionProgressSchema>;
export type SectionProgress = Pick<z.infer<typeof sectionProgressSchema>, "maxReadPercent" | "completed" | "timeSpentSeconds">;
export type ProgressUpdate = { sectionId: string; percent: number; timeSpentSeconds: number; completed?: boolean };

export function mergeSectionProgress(previous: SectionProgress | undefined, next: SectionProgress): SectionProgress {
  return {
    maxReadPercent: Math.max(previous?.maxReadPercent ?? 0, next.maxReadPercent),
    completed: Boolean(previous?.completed || next.completed),
    timeSpentSeconds: Math.max(previous?.timeSpentSeconds ?? 0, next.timeSpentSeconds),
  };
}

export function articleProgressMutation(articleId: string, version: number, userId: string | null) {
  return mutationOptions({
    mutationKey: queryKeys.articleProgress(userId, articleId, version),
    scope: { id: JSON.stringify(queryKeys.articleProgress(userId, articleId, version)) },
    mutationFn: (update: ProgressUpdate) => {
      const body = jsonBody(update);
      return requestJson(
        `/api/student/articles/${encodeURIComponent(articleId)}/progress`,
        sectionProgressSchema.refine((data) => data.sectionId === update.sectionId),
        { method: "PUT", ...body, headers: { ...body.headers, "x-student-id": requireAccount(userId) }, keepalive: true },
      );
    },
    // The server adds elapsed time. Retrying an uncertain write would double-count it.
    retry: false, networkMode: "always", gcTime: 0,
  });
}
