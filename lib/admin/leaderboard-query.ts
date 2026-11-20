import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { requestJson } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";

const count = z.number().int().nonnegative();
const score = z.number().nonnegative();
const timestamp = z.iso.datetime({ offset: true }).nullable();

const rankedStudentSchema = z.object({
  rank: z.number().int().positive(),
  studentId: z.string(),
  studentName: z.string(),
  studentEmail: z.string(),
  studentImage: z.string().nullable(),
  attemptCount: count,
  avgScore: score,
  bestScore: score,
  totalScore: score,
  avgDuration: z.number().nonnegative(),
  lastAttemptAt: timestamp,
  courseNames: z.array(z.string()),
  attempts: z.array(z.object({
    id: z.string(),
    title: z.string(),
    category: z.string(),
    courseId: z.string(),
    courseTitle: z.string(),
    score,
    durationSeconds: z.number().nonnegative(),
    submittedAt: timestamp,
  })),
});

const sharedFields = {
  courses: z.array(z.object({ id: z.string(), title: z.string() })),
  summary: z.object({
    totalStudents: count,
    totalAttempts: count,
    avgOverallScore: score,
    highestScore: score,
  }),
};

export const adminLeaderboardSchema = z.discriminatedUnion("mode", [
  z.object({
    ...sharedFields,
    mode: z.literal("overview"),
    courseInsights: z.array(z.object({
      courseId: z.string(),
      courseTitle: z.string(),
      participatingStudents: count,
      attemptCount: count,
      averageScore: score,
      highestScore: score,
    })),
  }),
  z.object({ ...sharedFields, mode: z.literal("course"), students: z.array(rankedStudentSchema) }),
]);

export type RankedStudent = z.infer<typeof rankedStudentSchema>;
export type AdminLeaderboardFilters = Readonly<{ courseId: string; type: string; search: string }>;

function normalizeFilters(filters: AdminLeaderboardFilters): AdminLeaderboardFilters {
  return {
    courseId: filters.courseId === "all" ? "" : filters.courseId,
    type: filters.type === "all" ? "" : filters.type,
    search: filters.search.trim().toLowerCase(),
  };
}

export function fetchAdminLeaderboard(filters: AdminLeaderboardFilters, signal?: AbortSignal) {
  const normalized = normalizeFilters(filters);
  const params = new URLSearchParams();
  if (normalized.courseId) params.set("courseId", normalized.courseId);
  if (normalized.type) params.set("type", normalized.type);
  if (normalized.search) params.set("search", normalized.search);
  return requestJson(`/api/admin/leaderboard?${params}`, adminLeaderboardSchema, { signal });
}

export function adminLeaderboardQuery(userId: string, filters: AdminLeaderboardFilters) {
  const normalized = normalizeFilters(filters);
  return queryOptions({
    queryKey: queryKeys.admin.leaderboard(userId, normalized),
    queryFn: ({ signal }) => fetchAdminLeaderboard(normalized, signal),
    enabled: Boolean(userId),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
