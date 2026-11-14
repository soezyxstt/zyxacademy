import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { demoStudentHref } from "@/lib/demo/routes";
const read = (path: string) => readFileSync(path, "utf8");
test("live student and demo routes use the same page renderers", () => {
 const surfaces = [
  ["app/(student)/dashboard/page.tsx", "components/demo/demo-dashboard.tsx", "StudentDashboardContent"],
  ["app/(student)/courses/page.tsx", "components/demo/demo-course-catalog.tsx", "StudentCourseCatalogView"],
  ["app/(student)/courses/[id]/page.tsx", "components/demo/demo-course-overview.tsx", "StudentCourseOverviewView"],
  ["app/(student)/courses/[id]/progress/page.tsx", "components/demo/demo-course-progress.tsx", "StudentCourseProgressView"],
  ["app/(student)/courses/[id]/material/page.tsx", "components/demo/demo-documents.tsx", "StudentDocumentsView"],
  ["app/(student)/courses/[id]/quiz/[quizId]/page.tsx", "components/demo/demo-quiz-list.tsx", "StudentQuizGateway"],
  ["app/(student)/courses/[id]/quiz/[quizId]/page.tsx", "components/demo/demo-quiz.tsx", "StudentQuizReview"],
  ["app/(student)/profile/page.tsx", "components/demo/demo-student-pages.tsx", "StudentProfileView"],
  ["app/(student)/leaderboard/page.tsx", "components/demo/demo-student-pages.tsx", "StudentLeaderboardView"],
 ];
 for (const [student, demo, renderer] of surfaces) {
  expect(read(student)).toContain(`<${renderer}`);
  expect(read(demo)).toContain(`<${renderer}`);
 }
 for (const file of ["app/(student)/layout.tsx", "components/demo/demo-shell.tsx"]) expect(read(file)).toContain("<StudentApplicationShell");
});
test("demo Zyra opens the actual student drawer with a local conversation transport", () => {
 expect(read("components/demo/demo-zyra.tsx")).toContain("useTutor");
 expect(read("components/course/tutor-drawer-view.tsx")).toContain("<StudentAccountBoundary");
 expect(read("components/course/tutor-drawer-view.tsx")).toContain("fictionalHistory");
});
test("shared profile and leaderboard render current gamification with isolated demo data", () => {
 const profile = read("components/student-profile-view.tsx");
 const liveProfile = read("app/(student)/profile/page.tsx");
 const demo = read("components/demo/demo-student-pages.tsx");
 const liveLeaderboard = read("components/gamification/leaderboard-list.tsx");
 expect(profile).toContain("<ProfileHero");
 expect(profile).toContain("<AchievementBoard");
 expect(liveProfile).toContain("followSection={<ProfileFollowList />}");
 expect(demo).not.toContain("<ProfileFollowList");
 expect(liveLeaderboard).toContain("<LeaderboardResults");
 expect(demo).toContain("<LeaderboardResults");
 expect(demo).toContain("page={{ entries: [], ownEntry: null, nextCursor: null }}");
 expect(demo).toContain("searchParams.get(\"academic\")");
 expect(demo).toContain("<StudentAcademicLeaderboardView");
 expect(demoStudentHref("en", "/leaderboard/academic", "course")).toBe("/en/demo/leaderboard?course=course&academic=1");
 expect(demoStudentHref("id", "/leaderboard", "course")).toBe("/id/demo/leaderboard?course=course");
});
