"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { studentTodayQuery } from "@/lib/student/today-query";
import { studentCourseQuery, studentEnrollmentsQuery } from "@/lib/student/navigation-query";
import { createActivityRefresh } from "@/lib/student/activity-refresh";
import { ZYX_ACTIVITY_UPDATED_EVENT, type ActivityDetail } from "@/lib/activity-signal";
import { queryKeys } from "@/lib/query/keys";

const EMPTY_COURSES: Array<{ id: string; title: string }> = [];

export function useStudentSidebarData({ userId, activeCourseId, pathname, enabled }: {
  userId?: string; activeCourseId?: string; pathname: string; enabled: boolean;
}) {
  const client = useQueryClient();
  const live = enabled && !!userId;
  const today = useQuery({ ...studentTodayQuery(userId ?? ""), enabled: live });
  const fallback = useQuery({ ...studentEnrollmentsQuery(userId ?? ""), enabled: live && today.isError });
  const { refetch: refreshFallback } = fallback;
  // A failed activity read must not revive enrollment data from an older scope.
  useEffect(() => {
    if (live && today.isError) void refreshFallback({ cancelRefetch: false });
  }, [live, today.isError, today.errorUpdatedAt, pathname, activeCourseId, refreshFallback]);
  const courses = today.isError
    ? (!fallback.isError && !fallback.isFetching && fallback.dataUpdatedAt >= today.errorUpdatedAt ? fallback.data ?? EMPTY_COURSES : EMPTY_COURSES)
    : today.data?.enrollments ?? EMPTY_COURSES;
  const enrolled = courses.find(course => course.id === activeCourseId);
  const course = useQuery({
    ...studentCourseQuery(userId ?? "", activeCourseId ?? ""),
    enabled: live && !!activeCourseId && !enrolled,
  });

  useEffect(() => {
    if (!live || !userId) return;
    const options = studentTodayQuery(userId);
    const activity = createActivityRefresh(async signal => {
      await client.invalidateQueries({ queryKey: options.queryKey, exact: true, refetchType: "none" });
      if (!signal.aborted && client.isMutating({ mutationKey: queryKeys.student.completeToday(userId), exact: true }) === 0) await client.query(options);
    });
    const onFocus = () => { void activity.refresh(); };
    const onVisibility = () => { if (document.visibilityState === "visible") onFocus(); };
    const onActivity = (event: Event) => {
      if (!(event as CustomEvent<ActivityDetail>).detail?.queryCacheUpdated) {
        void activity.refresh(true);
        void client.invalidateQueries({ queryKey: queryKeys.student.studyPaths(userId) });
      }
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(ZYX_ACTIVITY_UPDATED_EVENT, onActivity);
    return () => {
      activity.dispose();
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(ZYX_ACTIVITY_UPDATED_EVENT, onActivity);
    };
  }, [live, userId, client]);

  return {
    courses,
    activeCourse: enrolled ?? course.data ?? undefined,
    streak: today.data?.streak.current ?? null,
    weeklyActivity: today.data?.weeklyActivity ?? [],
  };
}
