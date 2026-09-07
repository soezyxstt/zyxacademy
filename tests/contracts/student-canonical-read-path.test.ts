import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

function source(path: string) {
  return readFileSync(path, "utf8");
}

describe("student canonical read path", () => {
  test("course and enrollment reads prefer the canonical academic tables", () => {
    const catalog = source("lib/student/course-catalog.ts");
    expect(catalog).toContain(".from(mataKuliah)");
    expect(catalog).toContain(".from(pendaftaranMurid)");
    expect(catalog).toContain("if (canonicalEnrollment) return true");
  });

  test("published products are visible without the authoring rollout flag", () => {
    const repository = source("lib/articles/structured-repository.ts");
    const progressRoute = source("app/api/student/articles/[articleId]/progress/route.ts");
    expect(repository).not.toContain("isStructuredArticleReaderEnabled");
    expect(progressRoute).not.toContain("isStructuredArticleReaderEnabled");
    expect(repository).toContain("eq(artikel.status, \"published\")");
    expect(repository).toContain("eq(diktatMateri.status, \"published\")");
  });

  test("student learning surfaces consume canonical products and Idea state", () => {
    expect(source("lib/course-utils.ts")).toContain("getCanonicalPublishedArticlesForCourse");
    expect(source("lib/flashcard-actions.ts")).toContain("kemajuanFlashcardMurid");
    expect(source("lib/mastery-store.ts")).toContain("pemahamanIde");
    expect(source("lib/study-path-service.ts")).toContain("computeCanonicalStudyPath");
    expect(source("lib/concept-explorer-service.ts")).toContain("canonicalIdeas.length > 0");
  });

  test("the retired murid preview redirects to the primary dashboard", () => {
    expect(source("app/(murid)/murid/page.tsx")).toContain('redirect("/dashboard")');
  });

  test("quiz and tryout readers retain explicit compatibility resolution", () => {
    expect(source("lib/course-utils.ts")).toContain("course?.legacyId ?? courseId");
    expect(source("app/(student)/courses/[id]/quiz/page.tsx")).toContain("getStudentVisibleCourseQuizzes(id)");
    expect(source("app/(student)/courses/[id]/tryout/page.tsx")).toContain("course.legacyId ?? id");
  });
});
