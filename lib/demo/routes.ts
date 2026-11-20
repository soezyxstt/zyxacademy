import type { Locale } from "@/lib/i18n/locale";
import { localizedPublicPath } from "@/lib/public-locale-routes";
export type DemoRouteView = "dashboard" | "courses" | "overview" | "documents" | "progress" | "history" | "article" | "diktat" | "flashcards" | "quiz" | "quiz-review" | "quiz-summary" | "quiz-list" | "quiz-start" | "tryout" | "tryout-review" | "tryout-list" | "zyra" | "schedule" | "groups" | "leaderboard" | "achievements" | "course-leaderboard" | "profile" | "profile-edit" | "feedback" | "reflections" | "settings" | "notifications" | "video" | "playground" | "path" | "mastery" | "results" | "live" | "pet" | "discussions" | "course-discussions";
export function demoRoute(locale: Locale, view: DemoRouteView, courseId: string): string {
  const path = view === "dashboard" ? "/demo" : `/demo/${view}`;
  const destination = localizedPublicPath(locale, path) ?? `/${locale}${path}`;
  return view === "schedule" ? destination : `${destination}?course=${encodeURIComponent(courseId)}`;
}

export function demoCoursePath(courseId: string): string { return `/courses/${encodeURIComponent(courseId)}`; }

const courseViews: Record<string, DemoRouteView> = {
  material: "documents", flashcard: "flashcards", quiz: "quiz-list", tryout: "tryout-list",
  progress: "progress", "my-results": "results", mastery: "mastery", path: "path",
  leaderboard: "course-leaderboard", video: "video", playground: "playground", live: "live", discussions: "course-discussions",
};
const detailViews: Record<string, DemoRouteView> = { material: "article", quiz: "quiz-start", tryout: "tryout" };
const accountViews: Record<string, DemoRouteView> = {
  "/dashboard": "dashboard", "/courses": "courses", "/dashboard/schedule": "schedule",
  "/dashboard/groups": "groups", "/leaderboard": "leaderboard", "/achievements": "achievements", "/profile": "profile",
  "/feedback": "feedback", "/profile/edit": "profile-edit", "/profile/reflections": "reflections",
  "/dashboard/discussions": "discussions", "/discussions": "discussions", "/pet": "pet",
  "/settings": "settings", "/settings/notifications": "notifications",
};

export function demoStudentHref(locale: Locale, studentPath: string, selectedCourseId: string): string {
  try {
  const url = new URL(studentPath, "https://demo.invalid");
  if (url.origin !== "https://demo.invalid") return demoRoute(locale, "dashboard", selectedCourseId);
  if (url.pathname === "/leaderboard/academic") {
    const destination = new URL(demoRoute(locale, "leaderboard", selectedCourseId), "https://demo.invalid");
    destination.searchParams.set("academic", "1");
    const course = url.searchParams.get("course");
    if (course) destination.searchParams.set("academicCourse", course);
    return `${destination.pathname}${destination.search}`;
  }
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
    if (view === "course-discussions") copyDiscussionParams(url, destination);
    const access = url.searchParams.get("access");
    if (access === "free" || access === "premium") destination.searchParams.set("access",access);
    return `${destination.pathname}${destination.search}`;
  }
  const view = accountViews[url.pathname];
  if (view) {
    const courseId = url.searchParams.get("course");
    const destination = new URL(demoRoute(locale, view, view === "leaderboard" || view === "achievements" ? selectedCourseId : courseId ?? selectedCourseId), "https://demo.invalid");
    if (view === "discussions") copyDiscussionParams(url, destination);
    if (view === "pet" && url.searchParams.has("tab")) destination.searchParams.set("tab", url.searchParams.get("tab")!);
    if (view === "schedule" && courseId) destination.searchParams.set("course", courseId);
    if (view === "achievements" || view === "leaderboard") {
      for (const key of view === "achievements" ? ["tab"] : ["tab", "period", "scope", "cursor"]) {
        const value = url.searchParams.get(key);
        if (value) destination.searchParams.set(key, value);
      }
      if (view === "leaderboard" && courseId) destination.searchParams.set("academicCourse", courseId);
    }
    return `${destination.pathname}${destination.search}`;
  }
  if (["/plans", "/sign-in"].includes(url.pathname)) return studentPath;
  return demoRoute(locale, "dashboard", selectedCourseId);
  } catch { return demoRoute(locale, "dashboard", selectedCourseId); }
}

function copyDiscussionParams(source: URL, destination: URL) {
  for (const key of ["channel", "thread", "message"]) {
    const value = source.searchParams.get(key);
    if (value) destination.searchParams.set(key, value);
  }
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
