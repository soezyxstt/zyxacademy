import { PKA_COURSE_ID } from "@/lib/pka-config";

export type StudentBottomNavTabId =
  | "home"
  | "courses"
  | "schedule"
  | "discuss"
  | "me";

export interface StudentCourseSummary {
  id: string;
  title: string;
}

let activeCourseContext: StudentCourseSummary | null = null;
const activeCourseListeners = new Set<() => void>();

export function setActiveCourseContext(course: StudentCourseSummary | null) {
  if (
    activeCourseContext?.id === course?.id &&
    activeCourseContext?.title === course?.title
  ) {
    return;
  }
  activeCourseContext = course;
  for (const listener of activeCourseListeners) {
    listener();
  }
}

export function getActiveCourseContext(): StudentCourseSummary | null {
  return activeCourseContext;
}

export function subscribeActiveCourseContext(listener: () => void): () => void {
  activeCourseListeners.add(listener);
  return () => {
    activeCourseListeners.delete(listener);
  };
}

export interface CourseMobileTabLabels {
  summary: string;
  documents: string;
  video: string;
  quiz: string;
  flashcard: string;
  tryout: string;
  schedule: string;
  playground: string;
  studyPath: string;
  mastery: string;
  progress: string;
  leaderboard: string;
  examResults: string;
  live: string;
  pkaSchedule: string;
  simulation: string;
  diagnosticReport: string;
  materials: string;
}

export interface CourseMobileTabDescriptor {
  id: string;
  href: string;
  label: string;
  exact?: boolean;
  isScheduleCourseTab?: boolean;
}

const STUDENT_ROOT_HUBS = new Set([
  "/dashboard",
  "/courses",
  "/dashboard/schedule",
  "/dashboard/discussions",
  "/profile",
]);

const ME_HUB_PREFIXES = [
  "/profile",
  "/achievements",
  "/leaderboard",
  "/dashboard/groups",
  "/pet",
  "/settings",
  "/feedback",
];

const COMMON_COURSE_SEGMENTS = new Set([
  "material",
  "quiz",
  "flashcard",
  "leaderboard",
  "progress",
  "discussions",
]);

const NORMAL_ONLY_COURSE_SEGMENTS = new Set([
  "video",
  "playground",
  "tryout",
  "path",
  "mastery",
  "my-results",
  "live",
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

export function isStudentRootHub(pathname: string): boolean {
  return STUDENT_ROOT_HUBS.has(normalizePath(pathname));
}

export function getActiveCourseIdFromPathname(pathname: string): string | undefined {
  const normalized = normalizePath(pathname);
  if (!normalized.startsWith("/courses/")) return undefined;
  const segment = normalized.split("/")[2];
  return segment || undefined;
}

export function getActiveStudentBottomTab(
  pathname: string
): StudentBottomNavTabId | null {
  const normalized = normalizePath(pathname);

  if (/(?:^|\/)discussions(?:\/|$)/.test(normalized)) {
    return "discuss";
  }

  if (
    matchesPrefix(normalized, "/dashboard/schedule") ||
    matchesPrefix(normalized, "/calendar")
  ) {
    return "schedule";
  }

  if (ME_HUB_PREFIXES.some((prefix) => matchesPrefix(normalized, prefix))) {
    return "me";
  }

  if (matchesPrefix(normalized, "/courses")) {
    return "courses";
  }

  if (normalized === "/dashboard") {
    return "home";
  }

  return null;
}

export function getStudentMobileBackHref(pathname: string): string {
  const normalized = normalizePath(pathname);
  const courseId = getActiveCourseIdFromPathname(normalized);

  if (courseId) {
    if (normalized === `/courses/${courseId}`) {
      return "/courses";
    }
    return `/courses/${courseId}`;
  }

  if (matchesPrefix(normalized, "/calendar")) {
    return "/dashboard/schedule";
  }

  if (
    normalized !== "/profile" &&
    ME_HUB_PREFIXES.some((prefix) => matchesPrefix(normalized, prefix))
  ) {
    return "/profile";
  }

  return "/dashboard";
}

export function resolveCourseSwitchHref(
  pathname: string,
  currentCourseId: string | undefined,
  targetCourseId: string
): string {
  const normalized = normalizePath(pathname);

  if (normalized === "/dashboard/schedule") {
    return `/dashboard/schedule?course=${targetCourseId}`;
  }

  if (currentCourseId) {
    const currentBase = `/courses/${currentCourseId}`;
    if (matchesPrefix(normalized, currentBase)) {
      const rest = normalized.slice(currentBase.length);
      const segment = rest.split("/").filter(Boolean)[0];
      if (
        segment &&
        (COMMON_COURSE_SEGMENTS.has(segment) ||
          (targetCourseId !== PKA_COURSE_ID &&
            NORMAL_ONLY_COURSE_SEGMENTS.has(segment)))
      ) {
        return `/courses/${targetCourseId}/${segment}`;
      }
    }
  }

  return `/courses/${targetCourseId}`;
}

export function buildCourseMobileTabs({
  courseId,
  isPka,
  showStudyPath = true,
  showMastery = true,
  showLive = false,
  labels,
}: {
  courseId: string;
  isPka: boolean;
  showStudyPath?: boolean;
  showMastery?: boolean;
  showLive?: boolean;
  labels: CourseMobileTabLabels;
}): CourseMobileTabDescriptor[] {
  const base = `/courses/${courseId}`;

  if (isPka) {
    return [
      { id: "summary", href: base, label: labels.summary, exact: true },
      { id: "pkaSchedule", href: `${base}/jadwal`, label: labels.pkaSchedule },
      { id: "simulation", href: `${base}/simulasi`, label: labels.simulation },
      {
        id: "diagnosticReport",
        href: `${base}/laporan`,
        label: labels.diagnosticReport,
      },
      { id: "flashcard", href: `${base}/flashcard`, label: labels.flashcard },
      { id: "quiz", href: `${base}/quiz`, label: labels.quiz },
      {
        id: "leaderboard",
        href: `${base}/leaderboard`,
        label: labels.leaderboard,
      },
      { id: "materials", href: `${base}/material`, label: labels.materials },
    ];
  }

  const tabs: CourseMobileTabDescriptor[] = [
    { id: "summary", href: base, label: labels.summary, exact: true },
    { id: "documents", href: `${base}/material`, label: labels.documents },
    { id: "video", href: `${base}/video`, label: labels.video },
    { id: "quiz", href: `${base}/quiz`, label: labels.quiz },
    { id: "flashcard", href: `${base}/flashcard`, label: labels.flashcard },
    { id: "tryout", href: `${base}/tryout`, label: labels.tryout },
    {
      id: "schedule",
      href: `/dashboard/schedule?course=${courseId}`,
      label: labels.schedule,
      isScheduleCourseTab: true,
    },
    { id: "playground", href: `${base}/playground`, label: labels.playground },
  ];

  if (showStudyPath) {
    tabs.push({
      id: "studyPath",
      href: `${base}/path`,
      label: labels.studyPath,
    });
  }

  if (showMastery) {
    tabs.push({
      id: "mastery",
      href: `${base}/mastery`,
      label: labels.mastery,
    });
  }

  tabs.push(
    { id: "progress", href: `${base}/progress`, label: labels.progress },
    {
      id: "leaderboard",
      href: `${base}/leaderboard`,
      label: labels.leaderboard,
    },
    {
      id: "examResults",
      href: `${base}/my-results`,
      label: labels.examResults,
    }
  );

  if (showLive) {
    tabs.push({ id: "live", href: `${base}/live`, label: labels.live });
  }

  return tabs;
}

export function isCourseTabActive(
  tab: CourseMobileTabDescriptor,
  pathname: string,
  courseId: string,
  scheduleCourseId?: string
): boolean {
  const normalized = normalizePath(pathname);

  if (tab.isScheduleCourseTab) {
    return (
      normalized === "/dashboard/schedule" && scheduleCourseId === courseId
    );
  }

  const target = normalizePath(tab.href);
  if (tab.exact) {
    return normalized === target;
  }

  return normalized === target || normalized.startsWith(`${target}/`);
}
