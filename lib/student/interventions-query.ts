import { mutationOptions, queryOptions, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { isQueryAccountCurrent } from "@/lib/query/client";
import { ApiError, requestJson } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";

const count = z.number().int().nonnegative();
// Historical payloads retain PostgreSQL COUNT values as integer strings.
const storedCount = z.union([count, z.string().regex(/^\d+$/).transform(Number)]).pipe(count);

export const interventionSchema = z.object({
  id: z.string().min(1),
  studentId: z.string().min(1),
  courseId: z.string().min(1),
  conceptName: z.string(),
  reason: z.string(),
  status: z.enum(["active", "dismissed", "resolved"]),
  payload: z.object({
    moduleHref: z.string(),
    quizTemplateIds: z.array(z.string().min(1)),
    flashcardCount: storedCount,
  }),
  createdAt: z.iso.datetime({ offset: true }),
});
export type Intervention = z.infer<typeof interventionSchema>;

export function studentInterventionsQuery(userId: string) {
  return queryOptions({
    queryKey: queryKeys.student.interventions(userId),
    queryFn: ({ signal }) => requestJson("/api/student/interventions", z.array(interventionSchema)
      .refine(rows => rows.every(row => row.studentId === userId), "Intervention account changed"), {
      signal, headers: { "x-student-id": userId },
    }),
    enabled: !!userId,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

export function dismissIntervention(userId: string, id: string) {
  return requestJson(`/api/student/interventions/${encodeURIComponent(id)}/dismiss`, z.object({ success: z.literal(true) }), {
    method: "POST",
    headers: { "x-student-id": userId },
  });
}

export function dismissInterventionMutation(client: QueryClient, userId: string) {
  const queryKey = queryKeys.student.interventions(userId);
  return mutationOptions({
    mutationKey: [...queryKey, "dismiss"],
    retry: false,
    networkMode: "always",
    mutationFn: (id: string) => {
      if (!userId || !isQueryAccountCurrent(client, userId)) throw new ApiError(409, "Account changed");
      return dismissIntervention(userId, id);
    },
    onSuccess: () => {
      if (!isQueryAccountCurrent(client, userId)) return;
      // Keep the current banner until its confirmed dismiss animation ends.
      return client.invalidateQueries({ queryKey, exact: true, refetchType: "none" });
    },
  });
}
