import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

describe("student learning access boundaries", () => {
  test("tutor learning actions return only active, published assets", () => {
    const actions = source("app/actions/tutor-extra.ts");
    expect(actions).not.toContain("f-mock-");
    expect(actions).not.toContain("q-mock-");
    expect(actions).toContain('eq(flashcards.status, "active")');
    expect(actions).toContain('eq(flashcardSets.status, "published")');
    expect(actions).toContain("eq(flashcardSets.isStale, false)");
    expect(actions).toContain('eq(aiQuestionBank.reviewStatus, "published")');
    expect(actions).toContain("eq(aiQuestionBank.isStale, false)");
    expect(actions).not.toContain("correctIndices");
    expect(actions).not.toContain("sourceReferenceId");
  });

  test("legacy flashcard writes validate publication and learner scope", () => {
    const actions = source("lib/flashcard-actions.ts");
    expect(actions).toContain("assertReviewInput(grade, responseTimeMs)");
    expect(actions).toContain("eq(flashcardSets.isStale, false)");
    expect(actions).toContain('if (set.status !== "published" || set.isStale)');
    expect(actions).toContain('throw new Error("FLASHCARD_ACCESS_DENIED")');
    const route = source("app/api/student/flashcards/route.ts");
    expect(route).not.toContain("...item.card");
    expect(route).toContain('error?.message === "FLASHCARD_INPUT_INVALID"');
  });

  test("material progress is limited to an exact published website material", () => {
    const repository = source("lib/material-progress.repository.ts");
    expect(repository).toContain("getStudentMaterialAccess");
    expect(repository).toContain('eq(websiteMaterials.status, "published")');
    expect(repository).toContain("eq(websiteMaterials.isStale, false)");
    expect(repository).toContain('throw new Error("MATERIAL_ACCESS_DENIED")');
    expect(repository).toContain('throw new Error("MATERIAL_UPGRADE_REQUIRED")');
  });

  test("daily quiz exposes no answer key and grades server-resolved rows", () => {
    const route = source("app/api/quiz/daily/route.ts");
    expect(route).toContain('eq(quizTemplates.status, "published")');
    expect(route).toContain('eq(aiQuestionBank.reviewStatus, "published")');
    expect(route).toContain('eq(aiQuestionBank.isStale, false)');
    expect(route).toContain('const conditions: SQL<unknown>[] = [');
    expect(route).toContain("const serverQuestions = await selectDailyQuestions");
    expect(route).toContain("isAnswerCorrect(question, answers[question.id])");
    expect(route).toContain("publicOptions(question.options)");
    expect(route).toContain("issueDailyQuestionSetToken");
    expect(route).toContain("verifyDailyQuestionSetToken");
    expect(route).toContain("sameQuestionSet(payload.questionIds, expected.questionIds)");
    expect(route).toContain("questionSetToken");
    expect(route).toContain("eq(bab.mataKuliahId, access.canonicalCourseId)");
    const clientStart = route.indexOf("function clientQuestion");
    const clientEnd = route.indexOf("function submittedText", clientStart);
    expect(route.slice(clientStart, clientEnd)).not.toContain("correctIndices");

    const quizPage = source("app/(student)/courses/[id]/quiz/[quizId]/page.tsx");
    expect(quizPage).toContain("fixedQuestionCondition");
    expect(quizPage).toContain("const fixedQuestionCondition = fixedQuestionIds.length > 0");
    expect(quizPage).toContain("const loadQuestionsCount = async () =>");
    expect(quizPage).toContain("return hasMalformedFixedQuestionIds");
    expect(quizPage).toContain("inArray(aiQuestionBank.id, fixedQuestionIds)");
    expect(quizPage).toContain("availableQuestionCount === fixedQuestionIds.length");
  });

  test("thumbnail reads bind material to the requested course without DB repair", () => {
    const route = source("app/api/courses/[id]/material/[materialId]/thumbnail/route.ts");
    expect(route).toContain("and(eq(courseMaterials.id, materialId), inArray(courseMaterials.courseId, lookupIds))");
    expect(route).toContain("eq(diktats.id, materialId)");
    expect(route).toContain("inArray(diktats.courseId, lookupIds)");
    expect(route).toContain('eq(diktats.status, "ready")');
    expect(route).toContain("manualAliases.length > 1 || compiledAliases.length > 1");
    expect(route).toContain("if (resolvedManual && resolvedCompiled)");
    expect(route).toContain("expectedThumbnailKeys.has(storedThumbnailKey)");
    expect(route).not.toContain("db.update");
  });
});
