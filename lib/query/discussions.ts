import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { queryKeys } from "./keys";
import { requestJson, requireAccount } from "./http";

const countSchema = z.object({ unreadThreads: z.number().nonnegative(), activeThreads: z.number().nonnegative() });
export const discussionCountsSchema = z.object({ total: countSchema, course: countSchema.nullable() });
export const discussionCountsQuery = (userId: string | null, courseId?: string) => queryOptions({
  queryKey: queryKeys.discussionCounts(userId, courseId), enabled: Boolean(userId),
  queryFn: ({ signal }) => {
    requireAccount(userId);
    return requestJson(`/api/discussions/counts${courseId ? `?courseId=${encodeURIComponent(courseId)}` : ""}`, discussionCountsSchema, { signal });
  },
  staleTime: 60_000, refetchInterval: 120_000,
});
