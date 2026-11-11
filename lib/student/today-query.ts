import { queryOptions } from "@tanstack/react-query";

export interface TodayData {
  streak: { current: number; longest: number };
  enrollments?: Array<{ id: string; title: string }>;
  weeklyActivity?: boolean[];
  items: Array<{
    id: string;
    kind: "flashcards" | "quiz" | "module";
    title: string;
    count?: number;
    href: string;
    done: boolean;
  }>;
}

export function studentTodayQuery(userId: string) {
  return queryOptions({
    queryKey: ["student", "today", userId] as const,
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/student/today", {
        signal,
        cache: "no-store",
        headers: { "x-student-id": userId },
      });
      if (!response.ok) throw new Error("Activity request failed");
      return response.json() as Promise<TodayData>;
    },
    staleTime: 60_000,
  });
}
