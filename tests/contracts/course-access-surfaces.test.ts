import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

describe("student course access surface contract", () => {
  test("requires an authenticated session on every standard course entry point", () => {
    const overview = source("app/(student)/courses/[id]/page.tsx");
    const materialList = source("app/(student)/courses/[id]/material/page.tsx");
    const materialDetail = source("app/(student)/courses/[id]/material/[materialId]/page.tsx");
    const quizList = source("app/(student)/courses/[id]/quiz/page.tsx");
    const flashcards = source("app/(student)/courses/[id]/flashcard/page.tsx");

    expect(overview).toContain("redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}`)}`)");
    expect(materialList).toContain("redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/material`)}`)");
    expect(materialDetail).toContain("redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/material/${materialId}`)}`)");
    expect(materialDetail).toContain("accessTier={access?.tier}");
    expect(source("components/course/material-viewer.tsx")).toContain('accessTier !== "free" && ragEnabled');
    expect(quizList).toContain("redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/quiz`)}`)");
    expect(flashcards).toContain("redirect(`/sign-in?next=${encodeURIComponent(`/courses/${id}/flashcard`)}`)");
  });

  test("keeps legacy and canonical Diktat PDFs course-bound", () => {
    const utils = source("lib/course-utils.ts");
    const list = source("app/(student)/courses/[id]/material/page.tsx");
    const detail = source("app/(student)/courses/[id]/material/[materialId]/page.tsx");
    const route = source("app/api/courses/[id]/diktats/[diktatId]/pdf/route.ts");

    expect(utils).toContain('eq(diktats.status, "ready")');
    expect(utils).toContain("/api/courses/${encodeURIComponent(courseId)}/diktats/${encodeURIComponent(d.id)}/pdf");
    expect(utils).not.toContain("storage.getUrl(d.fileUrl)");
    expect(list).toContain('eq(diktats.status, "ready")');
    expect(list).toContain("/api/courses/${encodeURIComponent(id)}/diktats/${encodeURIComponent(d.id)}/pdf");
    expect(detail).toContain('eq(diktats.status, "ready")');
    expect(route).toContain('eq(diktats.status, "ready")');
    expect(route).toContain('eq(diktats.courseId, compatibilityCourseId)');
  });

  test("uses the same server-approved Free quiz IDs at the client boundary", () => {
    const list = source("app/(student)/courses/[id]/quiz/page.tsx");
    const client = source("app/(student)/courses/[id]/quiz/quiz-list-client.tsx");
    const detail = source("app/(student)/courses/[id]/quiz/[quizId]/page.tsx");

    expect(list).toContain("getStudentVisibleCourseQuizzes(id, studentId)");
    expect(list).toContain("freeEligibleTemplateIds");
    expect(client).toContain("freeEligibleTemplateIds");
    expect(client).toContain("freeEligibleIds.has(template.id)");
    expect(detail).toContain("isFreeQuizTemplate(template, access.freeChapterIds)");
    expect(detail).toContain("extractFreeQuizChapterScope(rules)");
    expect(detail).toContain("inArray(chapters.id, freeQuizChapterIds)");
    expect(detail).toContain("eq(aiQuestionBank.isStale, false)");
    expect(detail).toContain("knowledgeObjects.status} = 'active'");
    expect(detail).toContain("chapters.status} = 'published'");
  });

  test("binds quiz draft and attempt access to the central course policy", () => {
    const page = source("app/(student)/courses/[id]/quiz/[quizId]/page.tsx");
    const route = source("app/api/quiz/attempts/route.ts");

    expect(page).toContain("resolveCourseAccess");
    expect(page).toContain('courseId: course.canonicalId ?? course.id');
    expect(page).toContain('const isStaff = access.tier === "staff"');
    expect(page).not.toContain("hasAnyPeran");
    expect(page).not.toContain('role === "admin"');
    expect(page).not.toContain('role === "teacher"');
    expect(route).toContain("const isStaff = access.tier === 'staff'");
    expect(route).not.toContain("hasAnyPeran");
    expect(route).not.toContain("role === 'admin'");
    expect(route).not.toContain("role === 'teacher'");
  });

  test("does not serialize answer keys into an active quiz player", () => {
    const page = source("app/(student)/courses/[id]/quiz/[quizId]/page.tsx");
    const activeBlock = page.slice(page.indexOf("if (targetAttempt?.status === \"in_progress\")"), page.indexOf("// Unified State"));
    expect(activeBlock).toContain("questions: (targetAttemptSnapshot!.questionsSnapshot");
    expect(activeBlock).not.toContain("correct_indices");
    expect(activeBlock).not.toContain("correctIndex");
  });
});
