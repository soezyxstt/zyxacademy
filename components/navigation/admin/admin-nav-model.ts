export type AdminBottomNavTabId = "home" | "courses" | "people" | "ops" | "more";

export type AdminSubTabContext = "course" | "people" | "ops" | null;

export interface AdminCourseSummary {
  id: string;
  title: string;
  slug?: string | null;
  category?: string | null;
}

let activeAdminCourseContext: AdminCourseSummary | null = null;
const activeAdminCourseListeners = new Set<() => void>();

export function setActiveAdminCourseContext(course: AdminCourseSummary | null) {
  if (
    activeAdminCourseContext?.id === course?.id &&
    activeAdminCourseContext?.title === course?.title &&
    activeAdminCourseContext?.slug === course?.slug &&
    activeAdminCourseContext?.category === course?.category
  ) {
    return;
  }
  activeAdminCourseContext = course;
  for (const listener of activeAdminCourseListeners) {
    listener();
  }
}

export function getActiveAdminCourseContext(): AdminCourseSummary | null {
  return activeAdminCourseContext;
}

export function subscribeActiveAdminCourseContext(
  listener: () => void
): () => void {
  activeAdminCourseListeners.add(listener);
  return () => {
    activeAdminCourseListeners.delete(listener);
  };
}

export type AdminCourseSubTabId =
  | "bab"
  | "documents"
  | "videos"
  | "quizzes"
  | "tryouts"
  | "questions"
  | "flashcards"
  | "results"
  | "leaderboard"
  | "analytics"
  | "review"
  | "settings";

export interface AdminCourseSubTabLabels {
  bab: string;
  documents: string;
  videos: string;
  quizzes: string;
  tryouts: string;
  questions: string;
  flashcards: string;
  results: string;
  leaderboard: string;
  analytics: string;
  review: string;
  settings: string;
}

export type AdminPeopleSubTabId =
  | "users"
  | "groups"
  | "tokens"
  | "pricing"
  | "notifications";

export interface AdminPeopleSubTabLabels {
  users: string;
  groups: string;
  tokens: string;
  pricing: string;
  notifications: string;
}

export type AdminOpsSubTabId =
  | "web"
  | "monitor"
  | "zyra"
  | "usage"
  | "tutor"
  | "models"
  | "keys";

export interface AdminOpsSubTabLabels {
  web: string;
  monitor: string;
  zyra: string;
  usage: string;
  tutor: string;
  models: string;
  keys: string;
}

export interface AdminSubTabDescriptor<TId extends string = string> {
  id: TId;
  href: string;
  label: string;
  exact?: boolean;
}

export type AdminMoreCategoryId =
  | "academic"
  | "people"
  | "publishing"
  | "ops"
  | "utilities";

export type AdminMoreIconId =
  | "dashboard"
  | "courses"
  | "questions"
  | "schedules"
  | "meet"
  | "discussions"
  | "jobs"
  | "distractors"
  | "users"
  | "groups"
  | "tokens"
  | "pricing"
  | "notifications"
  | "blog"
  | "forms"
  | "media"
  | "tautan"
  | "shortLinks"
  | "ops"
  | "tutorActivity"
  | "zyraAnalytics"
  | "featureUsage"
  | "webAnalytics"
  | "aiModels"
  | "apiKeys"
  | "docs"
  | "astInspector"
  | "pkaRegistrations"
  | "pkaAnnouncements"
  | "pkaSchedules"
  | "pkaQuizzes"
  | "pkaMaterials";

export interface AdminMoreShortcutDef {
  id: string;
  href: string;
  icon: AdminMoreIconId;
  labelKey: string;
  labelSource: "nav" | "routeTitles" | "mobile" | "discussion";
  exact?: boolean;
}

export interface AdminMoreCategoryDef {
  id: AdminMoreCategoryId;
  titleKey:
    | "academicTools"
    | "peopleAccess"
    | "publishingTools"
    | "analyticsSystem"
    | "utilitiesArchived";
  items: AdminMoreShortcutDef[];
  archivedItems?: AdminMoreShortcutDef[];
}

export const ADMIN_PINNED_STORAGE_KEY = "zyx_admin_sidebar_pinned_tabs";
export const ADMIN_PINNED_SYNC_EVENT = "zyx:admin-pinned-tabs-updated";

export function getAdminPinnedStorageKey(userId?: string | null): string {
  return userId
    ? `${ADMIN_PINNED_STORAGE_KEY}_${userId}`
    : ADMIN_PINNED_STORAGE_KEY;
}

export function readAdminPinnedTabs(
  storage: Pick<Storage, "getItem"> | null | undefined,
  userId?: string | null
): string[] {
  if (!storage) return [];
  try {
    const scopedKey = getAdminPinnedStorageKey(userId);
    let raw = storage.getItem(scopedKey);
    if (raw === null && userId) {
      raw = storage.getItem(ADMIN_PINNED_STORAGE_KEY);
    }
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export function writeAdminPinnedTabs(
  storage: Pick<Storage, "setItem"> | null | undefined,
  userId: string | null | undefined,
  tabs: string[]
): void {
  if (!storage) return;
  try {
    storage.setItem(getAdminPinnedStorageKey(userId), JSON.stringify(tabs));
  } catch {
    // Ignore storage write errors in restricted contexts.
  }
}

export const ADMIN_MORE_CATEGORIES: AdminMoreCategoryDef[] = [
  {
    id: "academic",
    titleKey: "academicTools",
    items: [
      {
        id: "bank-soal",
        href: "/admin/questions",
        icon: "questions",
        labelKey: "questionBank",
        labelSource: "nav",
      },
      {
        id: "schedules",
        href: "/admin/schedules",
        icon: "schedules",
        labelKey: "schedules",
        labelSource: "nav",
      },
      {
        id: "meet",
        href: "/admin/meet",
        icon: "meet",
        labelKey: "meet",
        labelSource: "nav",
      },
      {
        id: "discussions",
        href: "/admin/discussions",
        icon: "discussions",
        labelKey: "discussion",
        labelSource: "discussion",
      },
      {
        id: "jobs",
        href: "/admin/jobs",
        icon: "jobs",
        labelKey: "jobs",
        labelSource: "routeTitles",
      },
      {
        id: "distractors",
        href: "/admin/distractors",
        icon: "distractors",
        labelKey: "distractors",
        labelSource: "routeTitles",
      },
    ],
  },
  {
    id: "people",
    titleKey: "peopleAccess",
    items: [
      {
        id: "groups",
        href: "/admin/groups",
        icon: "groups",
        labelKey: "groups",
        labelSource: "nav",
      },
      {
        id: "tokens",
        href: "/admin/tokens",
        icon: "tokens",
        labelKey: "tokens",
        labelSource: "nav",
      },
      {
        id: "pricing",
        href: "/admin/pricing",
        icon: "pricing",
        labelKey: "pricing",
        labelSource: "nav",
      },
      {
        id: "notifications",
        href: "/admin/notifications",
        icon: "notifications",
        labelKey: "notifications",
        labelSource: "nav",
      },
    ],
  },
  {
    id: "publishing",
    titleKey: "publishingTools",
    items: [
      {
        id: "blog",
        href: "/admin/blog",
        icon: "blog",
        labelKey: "blog",
        labelSource: "nav",
      },
      {
        id: "forms",
        href: "/admin/forms",
        icon: "forms",
        labelKey: "forms",
        labelSource: "nav",
      },
      {
        id: "media",
        href: "/admin/media",
        icon: "media",
        labelKey: "media",
        labelSource: "nav",
      },
      {
        id: "tautan",
        href: "/admin/tautan",
        icon: "tautan",
        labelKey: "publicLinks",
        labelSource: "nav",
      },
      {
        id: "short-links",
        href: "/admin/ops/short-links",
        icon: "shortLinks",
        labelKey: "shortLinks",
        labelSource: "nav",
      },
    ],
  },
  {
    id: "ops",
    titleKey: "analyticsSystem",
    items: [
      {
        id: "web-analytics",
        href: "/admin/ops/web-analytics",
        icon: "webAnalytics",
        labelKey: "webAnalytics",
        labelSource: "nav",
      },
      {
        id: "ai-analytics",
        href: "/admin/ops/analytics",
        icon: "zyraAnalytics",
        labelKey: "zyraAnalytics",
        labelSource: "nav",
      },
      {
        id: "feature-usage",
        href: "/admin/ops/feature-usage",
        icon: "featureUsage",
        labelKey: "featureUsage",
        labelSource: "nav",
      },
      {
        id: "tutor-activity",
        href: "/admin/ops/tutor-activity",
        icon: "tutorActivity",
        labelKey: "tutorActivity",
        labelSource: "nav",
      },
      {
        id: "ai-models",
        href: "/admin/ops/models",
        icon: "aiModels",
        labelKey: "aiModels",
        labelSource: "nav",
      },
      {
        id: "api-keys",
        href: "/admin/ops/keys",
        icon: "apiKeys",
        labelKey: "apiKeys",
        labelSource: "nav",
      },
    ],
  },
  {
    id: "utilities",
    titleKey: "utilitiesArchived",
    items: [
      {
        id: "docs",
        href: "/admin/docs",
        icon: "docs",
        labelKey: "docs",
        labelSource: "nav",
      },
      {
        id: "ast-inspector",
        href: "/admin/ast-inspector",
        icon: "astInspector",
        labelKey: "astInspector",
        labelSource: "mobile",
      },
    ],
    archivedItems: [
      {
        id: "pka-registrations",
        href: "/admin/tutorial-pka/registrations",
        icon: "pkaRegistrations",
        labelKey: "pkaRegistrations",
        labelSource: "nav",
      },
      {
        id: "pka-announcements",
        href: "/admin/tutorial-pka/announcements",
        icon: "pkaAnnouncements",
        labelKey: "pkaAnnouncements",
        labelSource: "nav",
      },
      {
        id: "pka-schedules",
        href: "/admin/tutorial-pka/schedules",
        icon: "pkaSchedules",
        labelKey: "pkaSchedules",
        labelSource: "nav",
      },
      {
        id: "pka-quizzes",
        href: "/admin/courses/tutorial-pka/quizzes",
        icon: "pkaQuizzes",
        labelKey: "pkaQuizzes",
        labelSource: "nav",
      },
      {
        id: "pka-materials",
        href: "/admin/courses/tutorial-pka/documents",
        icon: "pkaMaterials",
        labelKey: "pkaMaterials",
        labelSource: "nav",
      },
    ],
  },
];

const EXTRA_ROOT_SHORTCUTS: AdminMoreShortcutDef[] = [
  {
    id: "dashboard",
    href: "/admin",
    icon: "dashboard",
    labelKey: "dashboard",
    labelSource: "nav",
    exact: true,
  },
  {
    id: "courses",
    href: "/admin/courses",
    icon: "courses",
    labelKey: "courses",
    labelSource: "nav",
  },
  {
    id: "users",
    href: "/admin/users",
    icon: "users",
    labelKey: "users",
    labelSource: "nav",
  },
  {
    id: "ops-monitor",
    href: "/admin/ops",
    icon: "ops",
    labelKey: "opsMonitor",
    labelSource: "nav",
    exact: true,
  },
];

export const ADMIN_SHORTCUT_BY_ID: Record<string, AdminMoreShortcutDef> =
  Object.fromEntries(
    [
      ...EXTRA_ROOT_SHORTCUTS,
      ...ADMIN_MORE_CATEGORIES.flatMap((category) => [
        ...category.items,
        ...(category.archivedItems ?? []),
      ]),
    ].map((item) => [item.id, item])
  );

const COURSES_HUB_PREFIXES = [
  "/admin/courses",
  "/admin/questions",
  "/admin/jobs",
  "/admin/distractors",
  "/admin/schedules",
  "/admin/meet",
  "/admin/discussions",
];

const PEOPLE_HUB_PREFIXES = [
  "/admin/users",
  "/admin/groups",
  "/admin/tokens",
  "/admin/pricing",
  "/admin/notifications",
];

const MORE_HUB_PREFIXES = [
  "/admin/blog",
  "/admin/forms",
  "/admin/media",
  "/admin/tautan",
  "/admin/ops/short-links",
  "/admin/docs",
  "/admin/tutorial-pka",
  "/admin/ast-inspector",
];

const PRESERVABLE_COURSE_SUBPAGES = new Set([
  "documents",
  "videos",
  "quizzes",
  "tryouts",
  "questions",
  "flashcards",
  "results",
  "leaderboard",
  "analytics",
  "review",
  "settings",
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

export function parseAdminCourseSlugFromPathname(
  pathname: string
): string | null {
  const normalized = normalizePath(pathname);
  if (!normalized.startsWith("/admin/courses/")) return null;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length >= 3 && parts[0] === "admin" && parts[1] === "courses" && parts[2]) {
    try {
      return decodeURIComponent(parts[2]);
    } catch {
      return null;
    }
  }
  return null;
}

export function resolveAdminCourseSwitchHref(
  pathname: string,
  targetSlug: string
): string {
  const normalized = normalizePath(pathname);
  const encodedTarget = encodeURIComponent(targetSlug);
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length >= 4 && parts[0] === "admin" && parts[1] === "courses") {
    const subpage = parts[3];
    if (subpage && PRESERVABLE_COURSE_SUBPAGES.has(subpage)) {
      return `/admin/courses/${encodedTarget}/${subpage}`;
    }
  }
  return `/admin/courses/${encodedTarget}`;
}

export function isAdminFocusEditorRoute(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  if (/^\/admin\/courses\/[^/]+\/quizzes\/new$/.test(normalized)) return true;
  if (/^\/admin\/courses\/[^/]+\/quizzes\/[^/]+\/edit$/.test(normalized)) {
    return true;
  }
  if (/^\/admin\/courses\/[^/]+\/documents\/[^/]+$/.test(normalized)) {
    return true;
  }
  if (/^\/admin\/courses\/[^/]+\/review\/(?:idea|product)\/.+$/.test(normalized)) {
    return true;
  }
  if (normalized === "/admin/blog/new") return true;
  if (/^\/admin\/blog\/[^/]+\/edit$/.test(normalized)) return true;
  return false;
}

export function isAdminDeepDetailRoute(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  if (isAdminFocusEditorRoute(normalized)) return true;
  if (/^\/admin\/courses\/[^/]+\/analytics\/[^/]+$/.test(normalized)) {
    return true;
  }
  if (/^\/admin\/forms\/[^/]+$/.test(normalized)) return true;
  if (/^\/admin\/meet\/[^/]+$/.test(normalized)) return true;
  if (/^\/admin\/docs\/.+$/.test(normalized)) return true;
  return false;
}

export function isAdminPeopleHubRoute(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  return PEOPLE_HUB_PREFIXES.some((prefix) =>
    matchesPrefix(normalized, prefix)
  );
}

export function isAdminOpsHubRoute(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  if (matchesPrefix(normalized, "/admin/ops/short-links")) {
    return false;
  }
  return matchesPrefix(normalized, "/admin/ops");
}

export function getActiveAdminBottomTab(
  pathname: string
): AdminBottomNavTabId | null {
  const normalized = normalizePath(pathname);

  if (normalized === "/admin") {
    return "home";
  }

  if (MORE_HUB_PREFIXES.some((prefix) => matchesPrefix(normalized, prefix))) {
    return "more";
  }

  if (isAdminPeopleHubRoute(normalized)) {
    return "people";
  }

  if (isAdminOpsHubRoute(normalized)) {
    return "ops";
  }

  if (COURSES_HUB_PREFIXES.some((prefix) => matchesPrefix(normalized, prefix))) {
    return "courses";
  }

  if (matchesPrefix(normalized, "/admin")) {
    return "more";
  }

  return null;
}

export function isAdminRootHub(pathname: string): boolean {
  const normalized = normalizePath(pathname);
  if (parseAdminCourseSlugFromPathname(normalized)) return false;
  if (isAdminDeepDetailRoute(normalized)) return false;
  return matchesPrefix(normalized, "/admin");
}

export function getAdminMobileBackHref(pathname: string): string {
  const normalized = normalizePath(pathname);
  const courseSlug = parseAdminCourseSlugFromPathname(normalized);

  if (courseSlug) {
    const encodedSlug = encodeURIComponent(courseSlug);
    if (/^\/admin\/courses\/[^/]+\/quizzes\/(?:new|[^/]+\/edit)$/.test(normalized)) {
      return `/admin/courses/${encodedSlug}/quizzes`;
    }
    if (/^\/admin\/courses\/[^/]+\/documents\/[^/]+$/.test(normalized)) {
      return `/admin/courses/${encodedSlug}/documents`;
    }
    if (/^\/admin\/courses\/[^/]+\/review\/(?:idea|product)\/.+$/.test(normalized)) {
      return `/admin/courses/${encodedSlug}/review`;
    }
    if (/^\/admin\/courses\/[^/]+\/analytics\/[^/]+$/.test(normalized)) {
      return `/admin/courses/${encodedSlug}/analytics`;
    }
    return "/admin/courses";
  }

  if (normalized === "/admin/blog/new" || /^\/admin\/blog\/[^/]+\/edit$/.test(normalized)) {
    return "/admin/blog";
  }
  if (/^\/admin\/forms\/[^/]+$/.test(normalized)) {
    return "/admin/forms";
  }
  if (/^\/admin\/meet\/[^/]+$/.test(normalized)) {
    return "/admin/meet";
  }
  if (/^\/admin\/docs\/.+$/.test(normalized)) {
    return "/admin/docs";
  }

  return "/admin";
}

export type AdminDetailTitleKey =
  | "newQuiz"
  | "editQuiz"
  | "editDocument"
  | "ideaReview"
  | "productReview"
  | "newPost"
  | "editPost"
  | "quizAnalytics";

export function getAdminDetailTitleKey(
  pathname: string
): AdminDetailTitleKey | null {
  const normalized = normalizePath(pathname);
  if (/^\/admin\/courses\/[^/]+\/quizzes\/new$/.test(normalized)) {
    return "newQuiz";
  }
  if (/^\/admin\/courses\/[^/]+\/quizzes\/[^/]+\/edit$/.test(normalized)) {
    return "editQuiz";
  }
  if (/^\/admin\/courses\/[^/]+\/documents\/[^/]+$/.test(normalized)) {
    return "editDocument";
  }
  if (/^\/admin\/courses\/[^/]+\/review\/idea\/.+$/.test(normalized)) {
    return "ideaReview";
  }
  if (/^\/admin\/courses\/[^/]+\/review\/product\/.+$/.test(normalized)) {
    return "productReview";
  }
  if (/^\/admin\/courses\/[^/]+\/analytics\/[^/]+$/.test(normalized)) {
    return "quizAnalytics";
  }
  if (normalized === "/admin/blog/new") {
    return "newPost";
  }
  if (/^\/admin\/blog\/[^/]+\/edit$/.test(normalized)) {
    return "editPost";
  }
  return null;
}

export function getAdminSubTabContext(pathname: string): AdminSubTabContext {
  const normalized = normalizePath(pathname);
  if (isAdminFocusEditorRoute(normalized) || isAdminDeepDetailRoute(normalized)) {
    return null;
  }
  if (parseAdminCourseSlugFromPathname(normalized)) {
    return "course";
  }
  if (isAdminPeopleHubRoute(normalized)) {
    return "people";
  }
  if (isAdminOpsHubRoute(normalized)) {
    return "ops";
  }
  return null;
}

export function buildAdminCourseSubTabs({
  slug,
  labels,
}: {
  slug: string;
  labels: AdminCourseSubTabLabels;
}): AdminSubTabDescriptor<AdminCourseSubTabId>[] {
  const base = `/admin/courses/${encodeURIComponent(slug)}`;
  return [
    { id: "bab", href: base, label: labels.bab, exact: true },
    { id: "documents", href: `${base}/documents`, label: labels.documents },
    { id: "videos", href: `${base}/videos`, label: labels.videos },
    { id: "quizzes", href: `${base}/quizzes`, label: labels.quizzes },
    { id: "tryouts", href: `${base}/tryouts`, label: labels.tryouts },
    { id: "questions", href: `${base}/questions`, label: labels.questions },
    { id: "flashcards", href: `${base}/flashcards`, label: labels.flashcards },
    { id: "results", href: `${base}/results`, label: labels.results },
    {
      id: "leaderboard",
      href: `${base}/leaderboard`,
      label: labels.leaderboard,
    },
    { id: "analytics", href: `${base}/analytics`, label: labels.analytics },
    { id: "review", href: `${base}/review`, label: labels.review },
    { id: "settings", href: `${base}/settings`, label: labels.settings },
  ];
}

export function buildAdminPeopleSubTabs(
  labels: AdminPeopleSubTabLabels
): AdminSubTabDescriptor<AdminPeopleSubTabId>[] {
  return [
    { id: "users", href: "/admin/users", label: labels.users },
    { id: "groups", href: "/admin/groups", label: labels.groups },
    { id: "tokens", href: "/admin/tokens", label: labels.tokens },
    { id: "pricing", href: "/admin/pricing", label: labels.pricing },
    {
      id: "notifications",
      href: "/admin/notifications",
      label: labels.notifications,
    },
  ];
}

export function buildAdminOpsSubTabs(
  labels: AdminOpsSubTabLabels
): AdminSubTabDescriptor<AdminOpsSubTabId>[] {
  return [
    { id: "web", href: "/admin/ops/web-analytics", label: labels.web },
    { id: "monitor", href: "/admin/ops", label: labels.monitor, exact: true },
    { id: "zyra", href: "/admin/ops/analytics", label: labels.zyra },
    {
      id: "usage",
      href: "/admin/ops/feature-usage",
      label: labels.usage,
    },
    {
      id: "tutor",
      href: "/admin/ops/tutor-activity",
      label: labels.tutor,
    },
    { id: "models", href: "/admin/ops/models", label: labels.models },
    { id: "keys", href: "/admin/ops/keys", label: labels.keys },
  ];
}

export function isAdminSubTabActive(
  tab: Pick<AdminSubTabDescriptor, "href" | "exact">,
  pathname: string
): boolean {
  const normalized = normalizePath(pathname);
  const target = normalizePath(tab.href);
  if (tab.exact) {
    return normalized === target;
  }
  return matchesPrefix(normalized, target);
}
