import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
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
