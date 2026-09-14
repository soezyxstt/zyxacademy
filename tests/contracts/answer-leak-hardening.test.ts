import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const source = (path: string) => readFileSync(path, "utf8");

describe("assessment answer leak hardening", () => {
  test("redacts option objects and answer-bearing fields at the quiz API boundary", () => {
    const route = source("app/api/quiz/attempts/route.ts");
    const clientStart = route.indexOf("const clientQuestions");
    const clientEnd = route.indexOf("return NextResponse.json(", clientStart);
    const clientBlock = route.slice(clientStart, clientEnd);

    expect(clientBlock).toContain("options: publicOptionTexts(q.options)");
    expect(clientBlock).not.toContain("options: q.options");
    expect(route).toContain("const serializedAttempts = serializeStudentQuizAttemptList(visibleAttempts)");
    expect(route).toContain("serializedAttempts.map(stripAnswerMarkers)");
  });

  test("keeps answer keys out of active quiz and tryout client props", () => {
    const quizPage = source("app/(student)/courses/[id]/quiz/[quizId]/page.tsx");
    const activeStart = quizPage.indexOf("if (targetAttempt?.status === \"in_progress\")");
    const activeEnd = quizPage.indexOf("// Unified State", activeStart);
    const activeBlock = quizPage.slice(activeStart, activeEnd);
    expect(activeBlock).toContain("options: publicOptionTexts(q.options)");
    expect(activeBlock).not.toContain("correctIndex");
    expect(activeBlock).not.toContain("correct_indices");
    expect(activeBlock).not.toContain("acceptableAnswers");

    const tryoutPage = source("app/(student)/courses/[id]/tryout/[tryoutId]/page.tsx");
    const tryoutStart = tryoutPage.indexOf("exam = {");
    const tryoutEnd = tryoutPage.indexOf("if (!exam", tryoutStart);
    const tryoutBlock = tryoutPage.slice(tryoutStart, tryoutEnd);
    expect(tryoutBlock).toContain("options: publicOptionTexts(content.options)");
    expect(tryoutBlock).not.toContain("correctIndex");
    expect(tryoutBlock).not.toContain("correctIndices");
    expect(tryoutBlock).not.toContain("acceptableAnswers");
  });

  test("requires an owned completed attempt containing the analyzed question", () => {
    const tutor = source("app/actions/tutor.ts");
    const start = tutor.indexOf("export async function analyzeMistakeAction");
    const end = tutor.indexOf("export async function buildStudyPlanAction", start);
    const action = tutor.slice(start, end);

    expect(action).toContain("eq(studentQuizAttempts.studentId, user.id)");
    expect(action).toContain('eq(studentQuizAttempts.status, "completed")');
    expect(action).toContain("snapshotQuestions(attempt.questionsSnapshot).some");
    expect(action).toContain("if (!matchingAttempt) throw new Error(MISTAKE_ATTEMPT_REQUIRED)");
  });

  test("normalizes both course identities before active-attempt protection", () => {
    const tutor = source("app/actions/tutor.ts");
    const start = tutor.indexOf("const courseIdentity = await resolveCourseIdentity(courseId)");
    const end = tutor.indexOf("const activeAttempt = await db", start);
    const guard = tutor.slice(start, end);

    expect(guard).toContain("courseIdentity.primaryId");
    expect(guard).toContain("courseIdentity.canonicalId");
    expect(guard).toContain("courseIdentity.legacyId");
    expect(guard).toContain("...(courseIdentity.allIds ?? [])");
    expect(guard).toContain("inArray(quizTemplates.courseId, courseScopeIds)");
  });
});
