import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { queryKeys } from "@/lib/query/keys";
import { jsonBody, requestJson, requestVoid, requireAccount } from "@/lib/query/http";

export const todaySchema = z.object({
  streak: z.object({ current: z.number(), longest: z.number() }),
  enrollments: z.array(z.object({ id: z.string(), title: z.string() })).optional(),
  weeklyActivity: z.array(z.boolean()).optional(),
  items: z.array(z.object({
    id: z.string(), kind: z.enum(["flashcards", "quiz", "module"]), title: z.string(),
    count: z.number().optional(), href: z.string(), done: z.boolean(),
  })),
});
export type TodayData = z.infer<typeof todaySchema>;

export function studentTodayQuery(userId: string) {
  return queryOptions({
    queryKey: queryKeys.today(userId),
    enabled: Boolean(userId),
    queryFn: ({ signal }) => requestJson("/api/student/today", todaySchema, {
      signal, headers: { "x-student-id": requireAccount(userId) },
    }),
    staleTime: 60_000,
  });
}

export function completeTodayItem(userId: string, itemId: string, signal: AbortSignal) {
  const body = jsonBody({ itemId });
  return requestVoid("/api/student/today/complete", {
    ...body, method: "POST", signal,
    headers: { ...body.headers, "x-student-id": requireAccount(userId) },
  });
}
