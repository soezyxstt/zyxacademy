export type TutorBottomNavTabId = "home" | "schedule" | "discuss" | "classes";

export interface TutorCourseSummary {
  courseId: string;
  title: string;
  code?: string | null;
  legacyCourseId?: string | null;
}

let activeTutorCourseContext: TutorCourseSummary | null = null;
const activeTutorCourseListeners = new Set<() => void>();

export function setActiveTutorCourseContext(course: TutorCourseSummary | null) {
  if (
    activeTutorCourseContext?.courseId === course?.courseId &&
    activeTutorCourseContext?.title === course?.title &&
    activeTutorCourseContext?.code === course?.code &&
    activeTutorCourseContext?.legacyCourseId === course?.legacyCourseId
  ) {
    return;
  }
  activeTutorCourseContext = course;
  for (const listener of activeTutorCourseListeners) {
    listener();
  }
}

export function getActiveTutorCourseContext(): TutorCourseSummary | null {
  return activeTutorCourseContext;
}

export function subscribeActiveTutorCourseContext(
  listener: () => void
): () => void {
  activeTutorCourseListeners.add(listener);
  return () => {
    activeTutorCourseListeners.delete(listener);
  };
}

export type TutorCourseTabId =
  | "overview"
  | "quizzes"
  | "quizGrading"
  | "tryoutGrading"
  | "participants"
  | "discussions"
  | "live"
  | "materials"
  | "videos";

export interface TutorCourseMobileTabLabels {
  overview: string;
  quizzes: string;
  quizGrading: string;
  tryoutGrading: string;
  participants: string;
  discussions: string;
  live: string;
  materials: string;
  videos: string;
}

export interface TutorCourseMobileTabDescriptor {
  id: TutorCourseTabId;
  href: string;
  label: string;
  exact?: boolean;
  hasDiscussionBadge?: boolean;
}

const TUTOR_TOP_LEVEL_SEGMENTS = new Set(["schedule", "discussions", "docs"]);

const TUTOR_ROOT_HUBS = new Set([
  "/tutor",
  "/tutor/schedule",
  "/tutor/discussions",
  "/tutor/docs",
]);

const PRESERVABLE_COURSE_SEGMENTS = new Set([
  "quizzes",
  "grading",
  "participants",
  "discussions",
  "live",
  "materials",
  "videos",
]);

function normalizePath(pathname: string): string {
  const withoutQuery = pathname.split("?")[0]?.split("#")[0] ?? "/";
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery || "/";
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function isTutorRootHub(pathname: string): boolean {
  return TUTOR_ROOT_HUBS.has(normalizePath(pathname));
}

export function getActiveTutorCourseIdFromPathname(
  pathname: string
): string | undefined {
  const normalized = normalizePath(pathname);
  const parts = normalized.split("/").filter(Boolean);
  if (parts[0] !== "tutor" || !parts[1]) {
    return undefined;
  }
  if (TUTOR_TOP_LEVEL_SEGMENTS.has(parts[1])) {
    return undefined;
  }
  return parts[1];
}

export function findAssignedTutorCourse<T extends TutorCourseSummary>(
  courses: readonly T[],
  courseId: string | undefined
): T | undefined {
  if (!courseId) return undefined;
  return courses.find(
    (course) =>
      course.courseId === courseId || course.legacyCourseId === courseId
  );
}

export function isTutorQuizFormOrDetailRoute(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  return /^\/tutor\/[^/]+\/quizzes\/(?:new(?:\/|$)|[^/]+\/(?:edit|attempts)(?:\/|$))/.test(
    normalized
  );
}

export function isTutorDetailOrFormRoute(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  if (normalized.startsWith("/tutor/docs/")) {
    return true;
  }
  return isTutorQuizFormOrDetailRoute(normalized);
}

export function shouldHideTutorCourseTabs(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  if (!getActiveTutorCourseIdFromPathname(normalized)) {
    return true;
  }
  return isTutorQuizFormOrDetailRoute(normalized);
}

export function getActiveTutorBottomTab(
  pathname: string
): TutorBottomNavTabId | null {
  const normalized = normalizePath(pathname);

  if (normalized === "/tutor") {
    return "home";
  }

  if (matchesPrefix(normalized, "/tutor/schedule")) {
    return "schedule";
  }

  if (matchesPrefix(normalized, "/tutor/discussions")) {
    return "discuss";
  }

  if (getActiveTutorCourseIdFromPathname(normalized)) {
    return "classes";
  }

  return null;
}

export function getTutorMobileBackHref(pathname: string): string {
  const normalized = normalizePath(pathname);

  if (normalized.startsWith("/tutor/docs/")) {
    return "/tutor/docs";
  }

  const courseId = getActiveTutorCourseIdFromPathname(normalized);
  if (courseId) {
    if (isTutorQuizFormOrDetailRoute(normalized)) {
      return `/tutor/${courseId}/quizzes`;
    }
    return `/tutor/${courseId}`;
  }

  return "/tutor";
}

export function getTutorDetailRouteTitleKey(
  pathname: string
): "createQuiz" | "editQuiz" | "studentAttempts" | "docs" | null {
  const normalized = normalizePath(pathname);
  if (normalized.startsWith("/tutor/docs/")) {
    return "docs";
  }
  if (/^\/tutor\/[^/]+\/quizzes\/new(?:\/|$)/.test(normalized)) {
    return "createQuiz";
  }
  if (/^\/tutor\/[^/]+\/quizzes\/[^/]+\/edit(?:\/|$)/.test(normalized)) {
    return "editQuiz";
  }
  if (/^\/tutor\/[^/]+\/quizzes\/[^/]+\/attempts(?:\/|$)/.test(normalized)) {
    return "studentAttempts";
  }
  return null;
}

export function resolveTutorCourseSwitchHref(
  pathname: string,
  currentCourseId: string | undefined,
  targetCourseId: string
): string {
  const normalized = normalizePath(pathname);

  if (currentCourseId) {
    const currentBase = `/tutor/${currentCourseId}`;
    if (matchesPrefix(normalized, currentBase)) {
      const rest = normalized.slice(currentBase.length);
      const segments = rest.split("/").filter(Boolean);
      if (segments[0] === "quizzes" && segments[1] === "grading") {
        return `/tutor/${targetCourseId}/quizzes/grading`;
      }
      const firstSegment = segments[0];
      if (firstSegment && PRESERVABLE_COURSE_SEGMENTS.has(firstSegment)) {
        return `/tutor/${targetCourseId}/${firstSegment}`;
      }
    }
  }

  return `/tutor/${targetCourseId}`;
}

export function buildTutorCourseMobileTabs({
  courseId,
  labels,
}: {
  courseId: string;
  labels: TutorCourseMobileTabLabels;
}): TutorCourseMobileTabDescriptor[] {
  const base = `/tutor/${courseId}`;

  return [
    { id: "overview", href: base, label: labels.overview, exact: true },
    { id: "quizzes", href: `${base}/quizzes`, label: labels.quizzes },
    {
      id: "quizGrading",
      href: `${base}/quizzes/grading`,
      label: labels.quizGrading,
    },
    {
      id: "tryoutGrading",
      href: `${base}/grading`,
      label: labels.tryoutGrading,
    },
    {
      id: "participants",
      href: `${base}/participants`,
      label: labels.participants,
    },
    {
      id: "discussions",
      href: `${base}/discussions`,
      label: labels.discussions,
      hasDiscussionBadge: true,
    },
    { id: "live", href: `${base}/live`, label: labels.live },
    { id: "materials", href: `${base}/materials`, label: labels.materials },
    { id: "videos", href: `${base}/videos`, label: labels.videos },
  ];
}

export function isTutorCourseTabActive(
  tab: TutorCourseMobileTabDescriptor,
  pathname: string,
  courseId: string
): boolean {
  const normalized = normalizePath(pathname);
  const target = normalizePath(tab.href);

  if (tab.exact) {
    return normalized === target;
  }

  if (tab.id === "quizzes") {
    const quizGradingPath = `/tutor/${courseId}/quizzes/grading`;
    return (
      matchesPrefix(normalized, target) &&
      !matchesPrefix(normalized, quizGradingPath)
    );
  }

  return matchesPrefix(normalized, target);
}
