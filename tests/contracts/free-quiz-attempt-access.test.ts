import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/quiz/attempts/route.ts", "utf8");

test("Free quiz attempts stay published and first-two-chapter scoped", () => {
  expect(route).toContain("courseId: z.string().trim().min(1)");
  expect(route).toContain("const { courseId, templateId } = parsed.data");
  expect(route).toContain("resolveCourseIdentity(courseId)");
  expect(route).toContain("matchesCourseIdentity(template.courseId, courseIdentity)");
  expect(route).toContain("Template does not belong to this course");

  const templateLookup = route.indexOf(".where(eq(quizTemplates.id, templateId))");
  const courseBinding = route.indexOf("const courseIdentity = await resolveCourseIdentity(courseId)");
  const attemptGuard = route.indexOf("// Enforce max attempts");
  expect(templateLookup).toBeGreaterThanOrEqual(0);
  expect(courseBinding).toBeGreaterThan(templateLookup);
  expect(courseBinding).toBeLessThan(attemptGuard);

  expect(route).toContain("resolveCourseAccess");
  expect(route).toContain("const access = await resolveCourseAccess({");
  expect(route).toContain("courseId: courseIdentity.primaryId");
  expect(route).toContain("const isStaff = access.tier === 'staff'");
  expect(route).toContain("canAccessCourseContent(access, 'quiz', chapterIds)");
  expect(route).toContain("if (access.tier === 'enrolled' || access.tier === 'staff')");
  expect(route).toContain("if (!isStaff)");
  expect(route).toContain("template.status !== 'published'");
  expect(route).toContain("FREE_QUIZ_CATEGORIES");
  expect(route).toContain("template.visibility !== 'free'");
  expect(route).toContain("assessmentTypes.some((value) => value !== 'quiz')");
  expect(route).toContain("extractChapterScope(rules)");
  expect(route).toContain("refs.length < 1 || refs.length > 2");
  expect(route).toContain("expandFreeChapterScope(access, chapterIds)");
  expect(route).toContain("chapter.canonicalId, chapter.legacyId");
  expect(route).toContain("eq(aiQuestionBank.status, 'active')");
  expect(route).toContain("eq(aiQuestionBank.isStale, false)");
  expect(route).toContain("eq(knowledgeObjects.status, 'active')");
  expect(route).toContain("eq(chapters.status, 'published')");
  expect(route).toContain("inArray(chapters.id, [...chapterIds])");
  expect(route).toContain("freeQuestionCondition");
  expect(route).toContain("freeQuestionStateCondition");
  expect(route).toContain("selected = selected.filter((question) => allowedQuestionIds.has(question.id))");
  expect(route).toContain("const declaredFixedQuestionIds = Array.isArray(rawFixedQuestionIds)");
  expect(route).toContain("const hasMalformedFixedQuestionIds = rawFixedQuestionIds !== undefined");
  expect(route).toContain("Daftar soal tetap kuis tidak valid.");
  expect(route).toContain("fixedQuestionIds.length > 0 && selected.length !== fixedQuestionIds.length");
  expect(route).toContain("Sebagian soal tetap kuis sudah tidak tersedia.");
  expect(route).toContain("eq(studentQuizAttempts.studentId, session.user.id)");
  expect(route).toContain("const visibleAttempts = attempts.filter");
  expect(route).toContain("visibleAttempts.map((attempt) => serializeStudentQuizAttempt(attempt");
  expect(route).toContain("canViewAttemptDiscussion(templateById.get(attempt.templateId), attempt.status) ? 'released' : 'hidden'");
  expect(route).toContain("questions WITHOUT correct_indices");
});

test("quiz staff access is assignment-bound, not a raw session-role bypass", () => {
  expect(route).not.toContain("hasAnyPeran");
  expect(route).not.toContain("role === 'admin'");
  expect(route).not.toContain("role === 'teacher'");
  expect(route).toContain("courseId: template.courseId");
  expect(route).toContain("policy?.allowed === true");
});
