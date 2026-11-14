type SidebarCourse = { id: string; title: string };

export type SidebarCourseScope = {
  userId: string;
  pathname: string;
  activeCourseId: string | undefined;
  errorUpdateCount: number;
};

export type SidebarFallbackCourses = SidebarCourseScope & { courses: SidebarCourse[] };

export function selectSidebarCourses(
  scope: SidebarCourseScope | undefined,
  isError: boolean,
  todayCourses: SidebarCourse[] | undefined,
  fallback: SidebarFallbackCourses | undefined,
): SidebarCourse[] {
  if (!scope) return [];

  const scopedFallback = fallback
    && fallback.userId === scope.userId
    && fallback.pathname === scope.pathname
    && fallback.activeCourseId === scope.activeCourseId
    && fallback.errorUpdateCount === scope.errorUpdateCount
    ? fallback.courses
    : undefined;

  return (isError ? scopedFallback : todayCourses ?? scopedFallback) ?? [];
}
