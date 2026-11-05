import type { Locale } from "@/lib/i18n/locale";
import { localizedPublicPath } from "@/lib/public-locale-routes";
export type DemoRouteView = "dashboard" | "courses" | "overview" | "documents" | "progress" | "history" | "article" | "diktat" | "flashcards" | "quiz" | "quiz-review" | "quiz-summary" | "quiz-list" | "quiz-start" | "tryout" | "tryout-review" | "tryout-list" | "zyra" | "schedule" | "groups" | "leaderboard" | "course-leaderboard" | "profile" | "profile-edit" | "feedback" | "reflections" | "settings" | "notifications" | "video" | "playground" | "path" | "mastery" | "results" | "live";
export function demoRoute(locale: Locale, view: DemoRouteView, courseId: string): string {
  const path = view === "dashboard" ? "/demo" : `/demo/${view}`;
  return `${localizedPublicPath(locale, path) ?? `/${locale}${path}`}?course=${encodeURIComponent(courseId)}`;
}

export function demoCoursePath(courseId: string): string { return `/courses/${encodeURIComponent(courseId)}`; }

const courseViews: Record<string, DemoRouteView> = {
  material: "documents", flashcard: "flashcards", quiz: "quiz-list", tryout: "tryout-list",
  progress: "progress", "my-results": "results", mastery: "mastery", path: "path",
  leaderboard: "course-leaderboard", video: "video", playground: "playground", live: "live",
};
const detailViews: Record<string, DemoRouteView> = { material: "article", quiz: "quiz-start", tryout: "tryout" };
const accountViews: Record<string, DemoRouteView> = {
  "/dashboard": "dashboard", "/courses": "courses", "/dashboard/schedule": "schedule",
  "/dashboard/groups": "groups", "/leaderboard": "leaderboard", "/profile": "profile",
  "/feedback": "feedback", "/profile/edit": "profile-edit", "/profile/reflections": "reflections",
  "/settings": "settings", "/settings/notifications": "notifications",
};

export function demoStudentHref(locale: Locale, studentPath: string, selectedCourseId: string): string {
  try {
  const url = new URL(studentPath, "https://demo.invalid");
  if (url.origin !== "https://demo.invalid") return demoRoute(locale, "dashboard", selectedCourseId);
  if (url.pathname.startsWith("/demo") || /^\/(?:en|id)\/demo(?:\/|$)/.test(url.pathname)) return studentPath;
  const summary = url.pathname.match(/^\/courses\/([^/]+)\/quiz\/[^/]+\/summary\/([^/]+)$/);
  if (summary) return `${demoRoute(locale, "quiz-summary", decodeURIComponent(summary[1]))}&attempt=${encodeURIComponent(decodeURIComponent(summary[2]))}`;
  const result = url.pathname.match(/^\/courses\/([^/]+)\/my-results\/([^/]+)(?:\/(summary))?$/);
  if (result) return `${demoRoute(locale, result[2] === "fictional-local-tryout" ? "tryout-review" : result[3] ? "quiz-summary" : "quiz-review", decodeURIComponent(result[1]))}&attempt=${encodeURIComponent(decodeURIComponent(result[2]))}`;
  const match = url.pathname.match(/^\/courses\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/);
  if (match) {
    const courseId = decodeURIComponent(match[1]);
    const view = match[2] ? courseViews[match[2]] : "overview";
    if (!view) return demoRoute(locale, "overview", courseId);
    const detail = match[2] === "quiz" && match[3] && url.searchParams.has("attemptId") ? "quiz-review" : match[3] ? detailViews[match[2]] : undefined;
    const destination = new URL(demoRoute(locale, detail ?? view, courseId), "https://demo.invalid");
    const attempt = url.searchParams.get("attemptId");
    if (attempt && detail === "quiz-review") destination.searchParams.set("attempt", attempt);
    const type = url.searchParams.get("type");
    if (type === "quiz" || type === "simulation") destination.searchParams.set("type", type);
    const access = url.searchParams.get("access");
    if (access === "free" || access === "premium") destination.searchParams.set("access",access);
    return `${destination.pathname}${destination.search}`;
  }
  const view = accountViews[url.pathname];
  if (view) return demoRoute(locale, view, url.searchParams.get("course") ?? selectedCourseId);
  if (["/plans", "/sign-in"].includes(url.pathname)) return studentPath;
  return demoRoute(locale, "dashboard", selectedCourseId);
  } catch { return demoRoute(locale, "dashboard", selectedCourseId); }
}

export function demoStudentPath(view: DemoRouteView, courseId: string): string {
  const base = demoCoursePath(courseId);
  if (view === "dashboard") return "/dashboard";
  if (view === "courses") return "/courses";
  const accountPath = Object.entries(accountViews).find(([, value]) => value === view)?.[0];
  if (accountPath) return accountPath;
  const courseSegment = Object.entries(courseViews).find(([, value]) => value === view)?.[0];
  if (courseSegment) return `${base}/${courseSegment}`;
  if (view === "article" || view === "diktat") return `${base}/material/reader`;
  if (view === "tryout-review") return `${base}/my-results/fictional-local-tryout`;
  if (view === "quiz-review" || view === "quiz-summary") return `${base}/quiz/assessment`;
  if (view === "quiz-start") return `${base}/quiz/assessment`;
  if (view === "quiz" || view === "tryout") return `${base}/${view}/assessment`;
  if (view === "history") return `${base}/my-results`;
  return base;
}
