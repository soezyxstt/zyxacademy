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
      ["documents/page.tsx", "MaterialsTab"],
      ["quizzes/page.tsx", "QuizzesTab"],
      ["questions/page.tsx", "QuestionsTab"],
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
});
