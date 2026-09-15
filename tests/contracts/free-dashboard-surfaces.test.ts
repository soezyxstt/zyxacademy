import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

describe("Free dashboard and Zyra surface contract", () => {
  test("builds the no-enrollment dashboard from the first two Free chapters", () => {
    const page = source("app/(student)/dashboard/page.tsx");
    const view = source("components/dashboard/student-onboarding-view.tsx");

    expect(page).toContain("getCourseChapterOutline");
    expect(page).toContain("getCourseMaterials(course.id, user.id)");
    expect(page).toContain("getCourseQuizzes(course.id, user.id)");
    expect(page).toContain("freeChapters: chapterOutline.map");
    expect(page).toContain("firstIncompleteMaterialId");
    expect(view).toContain("Bab 1 dan Bab 2 gratis di setiap mata kuliah.");
    expect(view).toContain("course.firstIncompleteMaterialId");
    expect(view).toContain("Mulai Bab 1");
    expect(view).toContain("Progres tersimpan");
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
