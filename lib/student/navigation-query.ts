import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { requestJson } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";

const courseSummarySchema = z.object({ id: z.string().min(1), title: z.string() });

export function studentEnrollmentsQuery(userId: string) {
  return queryOptions({
    queryKey: queryKeys.student.enrollments(userId),
    queryFn: ({ signal }) => requestJson("/api/student/navigation", z.array(courseSummarySchema), {
      signal, headers: { "x-student-id": userId },
    }),
    enabled: !!userId,
    staleTime: 0,
  });
}

export function studentCourseQuery(userId: string, courseId: string) {
  return queryOptions({
    queryKey: queryKeys.student.course(userId, courseId),
    queryFn: ({ signal }) => requestJson(`/api/student/navigation?${new URLSearchParams({ courseId })}`, courseSummarySchema.nullable(), {
      signal, headers: { "x-student-id": userId },
    }),
    enabled: !!userId && !!courseId,
    staleTime: 5 * 60_000,
  });
}
