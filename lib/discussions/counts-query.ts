import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { requestJson } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";

const countSchema = z.object({ unreadThreads: z.number().int().nonnegative(), activeThreads: z.number().int().nonnegative() });
export const discussionCountsSchema = z.object({ total: countSchema, course: countSchema.nullable() });

export function discussionCountsQuery(userId: string, courseId?: string) {
  return queryOptions({
    queryKey: queryKeys.discussions.counts(userId, courseId),
    queryFn: ({ signal }) => requestJson(`/api/discussions/counts${courseId ? `?${new URLSearchParams({ courseId })}` : ""}`, discussionCountsSchema, {
      signal, headers: { "x-student-id": userId },
    }),
    enabled: !!userId,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchIntervalInBackground: false,
  });
}
