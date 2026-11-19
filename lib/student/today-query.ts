import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { requestJson } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";

export const todayDataSchema = z.object({
  streak: z.object({ current: z.number().int().nonnegative(), longest: z.number().int().nonnegative() }),
  enrollments: z.array(z.object({ id: z.string().min(1), title: z.string() })).optional(),
  weeklyActivity: z.array(z.boolean()).optional(),
  items: z.array(z.object({
    id: z.string().min(1),
    kind: z.enum(["flashcards", "quiz", "module"]),
    title: z.string(),
    count: z.number().int().nonnegative().optional(),
    href: z.string(),
    done: z.boolean(),
  })),
});

export type TodayData = z.infer<typeof todayDataSchema>;

export function fetchStudentToday(userId: string, signal?: AbortSignal): Promise<TodayData> {
  return requestJson("/api/student/today", todayDataSchema, { signal, headers: { "x-student-id": userId } });
}

export function completeTodayItem(userId: string, itemId: string, signal?: AbortSignal) {
  return requestJson("/api/student/today/complete", z.object({ ok: z.literal(true) }), {
    method: "POST",
    body: JSON.stringify({ itemId }),
    headers: { "Content-Type": "application/json", "x-student-id": userId },
    signal,
  });
}

export function studentTodayQuery(userId: string) {
  return queryOptions({
    queryKey: queryKeys.student.today(userId),
    queryFn: ({ signal }) => fetchStudentToday(userId, signal),
    enabled: !!userId,
    staleTime: 60_000,
    // This GET also updates the streak and builds recommendations.
    retry: false,
  });
}
