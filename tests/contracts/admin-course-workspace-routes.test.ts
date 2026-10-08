import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(path, "utf8");
}

const courseRoot = "app/(admin)/admin/(academic)/courses/[slug]";

describe("admin course workspace routes", () => {
  test("renders Bab at the root without the former tab client", () => {
    const page = source(`${courseRoot}/page.tsx`);
    expect(page).toContain("<ChaptersTab");
    expect(page).not.toContain("CourseDetailClient");
    expect(page).not.toContain("<Tabs");
    expect(existsSync("components/admin/course-detail/course-detail-client.tsx")).toBe(false);
  });

  test("maps legacy tab queries to direct routes", () => {
    const page = source(`${courseRoot}/page.tsx`);
    expect(page).toContain('materials: "documents"');
    expect(page).toContain('quizzes: "quizzes"');
    expect(page).toContain('questions: "questions"');
    expect(page).toContain('analytics: "results"');
    expect(page).toContain('settings: "settings"');
  });

  test("provides all six direct management pages", () => {
    const pages = [
      ["page.tsx", "ChaptersTab"],
      ["documents/page.tsx", "DocumentListClient"],
      ["quizzes/page.tsx", "QuizzesTab"],
      ["questions/page.tsx", "QuestionsTab"],
      ["flashcards/page.tsx", "FlashcardsTab"],
      ["results/page.tsx", "AnalyticsTab"],
      ["settings/page.tsx", "SettingsTab"],
    ] as const;

    for (const [path, component] of pages) {
      const page = source(`${courseRoot}/${path}`);
      expect(page).toContain("assertAdmin");
      expect(page).toContain("getCourseDetailData");
      expect(page).toContain("notFound()");
      expect(page).toContain(`<${component}`);
      expect(page).toContain("CourseDetailHeader");
    }
  });

  test("keeps quiz create, edit, and insight links course-scoped", () => {
    const quizzes = source("components/admin/course-detail/quizzes-tab.tsx");
    const results = source("components/admin/course-detail/analytics-tab.tsx");
    const createPage = source(`${courseRoot}/quizzes/new/page.tsx`);
    const editPage = source(`${courseRoot}/quizzes/[id]/edit/page.tsx`);

    expect(quizzes).toContain("/analytics/${encodeURIComponent(quiz.id)}");
    expect(results).toContain("/analytics/${encodeURIComponent(quiz.id)}");
    expect(createPage).toContain("/${encodeURIComponent(slug)}/quizzes");
    expect(editPage).toContain("/${encodeURIComponent(slug)}/quizzes");
    expect(editPage).toContain("courseData.quizzes.some");
  });

  test("adds admin-only course-scoped tryout authoring", () => {
    const page = source(`${courseRoot}/tryouts/page.tsx`);

    expect(page).toContain("await assertAdmin()");
    expect(page).toContain("getCourseDetailData(slug)");
    expect(page).toContain("<TryoutsClient");
    expect(page).toContain("notFound()");
    expect(page).toContain('eq(exams.courseId, courseId)');
    expect(page).toContain('eq(exams.type, "tryout")');
    expect(page).toContain('eq(aiQuestionBank.reviewStatus, "published")');
  });

  test("adds the tryout route to the admin course navigation titles", () => {
    const sidebar = source("components/admin-sidebar.tsx");
    const mobileNavbar = source("components/mobile-navbar.tsx");

    expect(sidebar).toContain('id: "tryouts", label: "Tryout"');
    expect(mobileNavbar).toContain('if (subpath.startsWith("/tryouts")) return "Tryout";');
  });

  test("publishes essay attachments through the existing tryout answer flow", () => {
    const tryoutPage = source(`${courseRoot}/tryouts/page.tsx`);
    const importAction = source("app/actions/tutor-management.ts");
    const answerForm = source("components/course/tryout-form.tsx");

    expect(tryoutPage).toContain('eq(aiQuestionBank.reviewStatus, "published")');
    expect(importAction).toContain('acceptsFile: row.questionType === "essay"');
    expect(answerForm).toContain('placeholder="Ketik penjelasan runut, penjabaran matematika, atau esai Anda di sini..."');
    expect(answerForm).toContain('accept=".pdf,image/*"');
  });
});
