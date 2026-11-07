import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

describe("Free dashboard and Zyra surface contract", () => {
  test("builds the no-enrollment dashboard from the first two Free chapters", () => {
    const page = source("app/(student)/dashboard/page.tsx");
    const sections = source("app/(student)/dashboard/dashboard-sections.tsx");
    expect(page).toContain("<DashboardOnboardingSection");
    const view = source("components/dashboard/student-onboarding-view.tsx");

    expect(sections).toContain("getCourseChapterOutline");
    expect(sections).toContain("getCourseMaterials(course.id, userId)");
    expect(sections).toContain("getCourseQuizzes(course.id, userId)");
    expect(sections).toContain("freeChapters: chapterOutline.map");
    expect(sections).toContain("firstIncompleteMaterialId");
    expect(sections).toContain("completedFreeMaterialCount: completedMaterialCount");
    expect(view).toContain('t("dashboard.firstChapterFree")');
    const dashboardMessages = JSON.parse(source("messages/id/student.json")).dashboard;
    expect(dashboardMessages.firstChapterFree).toBe("Bab pertama gratis di setiap mata kuliah.");
    expect(view).toContain("course.firstIncompleteMaterialId");
    expect(view).toContain('t("dashboard.startChapterOne")');
    expect(dashboardMessages.startChapterOne).toBe("Mulai bab 1");
    expect(view).toContain('t("dashboard.onboardingMaterialProgress", { complete: completedMaterials, total: totalMaterials })');
    expect(dashboardMessages.onboardingMaterialProgress).toBe("{complete}/{total} materi");
    const buttonLines = view.split("\n").filter((line) => line.includes("<Button"));
    expect(buttonLines.length).toBeGreaterThan(0);
    expect(buttonLines.every((line) => !line.includes("text-body-xs"))).toBe(true);
  });

  test("disables advanced Zyra modes only after Free access is confirmed", () => {
    const drawer = source("components/course/tutor-drawer-view.tsx");

    expect(drawer).toContain('const advancedModesEnabled = zyraAccessTier !== "free"');
    expect(drawer).toContain("caps.imageInput && activeMode === \"chat\" && advancedModesEnabled");
    expect(drawer).toContain("if (!advancedModesEnabled) return;");
    expect(drawer).toContain("advancedModesEnabled && caps.explain");
    expect(drawer).toContain("Paket Free hanya mendukung pertanyaan teks.");
    expect(drawer).toContain("Buka fitur lengkap");
  });

  test("preserves the original query when redirecting to sign in", () => {
    expect(source("proxy.ts")).toContain("request.nextUrl.search");
  });
});
