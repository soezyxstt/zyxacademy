import { getStudentMobileRouteTitle } from "./student/student-nav-model";

export function getRouteTitle(
  pathname: string,
  surface?: "admin" | "student" | "tutor",
  translate?: (key: string) => string
): string {
  const roleTitle = (namespace: "admin" | "tutor", key: string, fallback: string) =>
    translate?.(`${namespace}.routeTitles.${key}`) ?? fallback;
  if (/^\/(?:admin\/discussions|dashboard\/discussions|discussions|tutor\/discussions|tutor\/[^/]+\/discussions|courses\/[^/]+\/discussions)(?:\/|$)/.test(pathname)) {
    return translate?.("tutor.schedule.discussion") ?? "Diskusi";
  }
  if (pathname === "/pet") return "Pet";
  if (pathname === "/admin") return roleTitle("admin", "dashboard", "Admin dashboard");
  if (pathname === "/admin/docs" || pathname.startsWith("/admin/docs/")) return roleTitle("admin", "docs", "Documentation");
  if (pathname.startsWith("/admin/blog")) return roleTitle("admin", "blog", "Manage blog");
  if (pathname.startsWith("/admin/courses/")) {
    const match = pathname.match(/^\/admin\/courses\/([^/]+)(.*)$/);
    if (match && match[1]) {
      const subpath = match[2] || "";
      if (subpath.startsWith("/documents")) return roleTitle("admin", "documents", "Documents");
      if (subpath.startsWith("/videos")) return roleTitle("admin", "videos", "Videos");
      if (subpath.startsWith("/quizzes")) return roleTitle("admin", "quizzes", "Quizzes");
      if (subpath.startsWith("/tryouts")) return roleTitle("admin", "tryouts", "Tryouts");
      if (subpath.startsWith("/questions")) return roleTitle("admin", "questions", "Questions");
      if (subpath.startsWith("/flashcards")) return roleTitle("admin", "flashcards", "Flashcards");
      if (subpath.startsWith("/results")) return roleTitle("admin", "results", "Results");
      if (subpath.startsWith("/leaderboard")) return roleTitle("admin", "leaderboard", "Leaderboard");
      if (subpath.startsWith("/analytics")) return roleTitle("admin", "analytics", "Analytics");
      if (subpath.startsWith("/review")) return roleTitle("admin", "review", "Material review");
      if (subpath.startsWith("/settings")) return roleTitle("admin", "settings", "Settings");
      if (subpath === "" || subpath === "/") return roleTitle("admin", "chapters", "Chapters");
      return roleTitle("admin", "courses", "Courses");
    }
  }
  if (pathname.startsWith("/admin/courses")) return roleTitle("admin", "courses", "Courses");
  if (pathname.startsWith("/admin/schedules")) return roleTitle("admin", "schedules", "Shared schedule");
  if (pathname.startsWith("/admin/materials/review")) return roleTitle("admin", "review", "Material review");
  if (pathname.startsWith("/admin/materials")) return roleTitle("admin", "materials", "Course materials");
  if (pathname.startsWith("/admin/questions")) return roleTitle("admin", "questions", "Questions");
  if (pathname.startsWith("/admin/quizzes")) return roleTitle("admin", "quizzes", "Quizzes");
  if (pathname.startsWith("/admin/leaderboard")) return roleTitle("admin", "leaderboard", "Leaderboard");
  if (pathname.startsWith("/admin/quiz-insights")) return roleTitle("admin", "quizInsights", "Quiz insights");
  if (pathname.startsWith("/admin/jobs")) return roleTitle("admin", "jobs", "Question generation");
  if (pathname.startsWith("/admin/distractors")) return roleTitle("admin", "distractors", "Distractors");
  if (pathname.startsWith("/admin/pricing")) return roleTitle("admin", "pricing", "Pricing calculator");
  if (pathname.startsWith("/admin/forms")) return roleTitle("admin", "forms", "Form Studio");
  if (pathname.startsWith("/admin/meet")) return roleTitle("admin", "meet", "Meet");
  if (pathname.startsWith("/admin/media")) return roleTitle("admin", "media", "Media library");
  if (pathname.startsWith("/admin/tautan")) return roleTitle("admin", "links", "Public links");
  if (pathname.startsWith("/admin/users")) return roleTitle("admin", "users", "Users");
  if (pathname.startsWith("/admin/groups")) return roleTitle("admin", "groups", "Study groups");
  if (pathname.startsWith("/admin/tokens")) return roleTitle("admin", "tokens", "Activation tokens");
  if (pathname.startsWith("/admin/notifications")) return roleTitle("admin", "notifications", "Notifications");
  if (pathname.startsWith("/admin/ops/models")) return roleTitle("admin", "aiModels", "AI models");
  if (pathname.startsWith("/admin/ops/analytics")) return roleTitle("admin", "zyraAnalytics", "Zyra analytics");
  if (pathname.startsWith("/admin/ops/feature-usage")) return roleTitle("admin", "featureUsage", "Feature usage");
  if (pathname.startsWith("/admin/ops/keys")) return roleTitle("admin", "apiKeys", "API keys");
  if (pathname.startsWith("/admin/ops/short-links")) return roleTitle("admin", "shortLinks", "Short links");
  if (pathname.startsWith("/admin/ops/tutor-activity")) return roleTitle("admin", "tutorActivity", "Tutor activity");
  if (pathname.startsWith("/admin/ops/web-analytics")) return roleTitle("admin", "webAnalytics", "Web analytics");
  if (pathname.startsWith("/admin/ops")) return roleTitle("admin", "ops", "Ops monitor");
  if (pathname.startsWith("/admin/tutorial-pka/registrations")) return roleTitle("admin", "pkaRegistrations", "PKA registrations");
  if (pathname.startsWith("/admin/tutorial-pka/announcements")) return roleTitle("admin", "pkaAnnouncements", "PKA announcements");
  if (pathname.startsWith("/admin/tutorial-pka/schedules")) return roleTitle("admin", "pkaSchedules", "PKA live schedule");
  if (pathname.startsWith("/admin/tutorial-pka")) return roleTitle("admin", "pka", "PKA tutorials");
  if (pathname.startsWith("/admin/bundles/idea")) return roleTitle("admin", "ideaBundles", "Idea Bundles");
  if (pathname.startsWith("/admin/bundles/product")) return roleTitle("admin", "productBundles", "Product Bundles");

  if (pathname === "/tutor") return roleTitle("tutor", "dashboardTitle", "Tutor dashboard");
  if (pathname === "/tutor/docs" || pathname.startsWith("/tutor/docs/")) return roleTitle("tutor", "docs", "Documentation");
  if (pathname.startsWith("/tutor/schedule")) return roleTitle("tutor", "scheduleTitle", "Teaching schedule");
  if (pathname.startsWith("/tutor")) {
    if (pathname.includes("/videos")) return roleTitle("tutor", "videos", "Videos");
    if (pathname.includes("/materials")) return roleTitle("tutor", "documents", "Documents");
    if (pathname.includes("/participants")) return roleTitle("tutor", "participants", "Participants and groups");
    if (pathname.includes("/quizzes")) return roleTitle("tutor", "quizzes", "Quizzes");
    if (pathname.includes("/live")) return roleTitle("tutor", "liveQuiz", "Live quiz");
    if (pathname.includes("/grading")) return roleTitle("tutor", "tryoutGrading", "Tryout grading");
    return roleTitle("tutor", "overview", "Overview");
  }

  const studentTitle = getStudentMobileRouteTitle(pathname, translate);
  if (studentTitle !== undefined) return studentTitle;
  if (surface === "admin") return "Panel Admin";
  if (surface === "tutor") return "Panel Pengajar";
  return translate?.("routeTitles.dashboard") ?? "Dashboard Siswa";
}
