import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  assessmentActors, createAssessmentFixtureGateway, defaultQuiz, targetVersion,
  type AssessmentCommand, type AssessmentContext, type AssessmentResult,
} from "./index";

const tutor: AssessmentContext = {
  actor: assessmentActors.tutor, scope: { kind: "tutor", courseId: "academic-course-1" }, scenario: "populated",
};
const admin: AssessmentContext = {
  actor: assessmentActors.admin, scope: { kind: "admin", slug: "biologi-dasar" }, scenario: "populated",
};
const testCourse = (courseId: string): AssessmentContext => ({ ...tutor, scope: { kind: "tutor", courseId } });

function value<T>(result: AssessmentResult<T>): T {
  if (!result.ok) assert.fail(result.message);
  return result.value;
}

function code(result: AssessmentResult<unknown>) {
  if (result.ok) assert.fail("Expected an assessment failure");
  return result.code;
}

test("assembles signed staff views and rejects unassigned, mismatched and cross-course access", async () => {
  const gateway = createAssessmentFixtureGateway();
  const tutorRead = value(await gateway.listQuizzes(tutor));
  const adminRead = value(await gateway.listQuizzes(admin));
  assert.equal(tutorRead.course.id, adminRead.course.id);
  assert.equal(tutorRead.quizzes.length, 3);

  const empty = testCourse("academic-course-2");
  assert.deepEqual(value(await gateway.listQuizzes(empty)).quizzes, []);
  assert.equal(code(await gateway.listQuizAttempts(empty, "academic-quiz-1")), "not_found");
  assert.equal(code(await gateway.loadGradingAttempt(empty, "academic-quiz-attempt-1")), "not_found");
  assert.equal(code(await gateway.listQuizzes(testCourse("academic-course-3"))), "forbidden");
  assert.equal(code(await gateway.listQuizzes(testCourse("biologi-dasar"))), "not_found");
  assert.equal(code(await gateway.listQuizzes({ ...admin, actor: tutor.actor })), "forbidden");
  assert.equal(code(await gateway.listQuizzes({ ...tutor, actor: { id: "academic-tutor", role: "student" } })), "forbidden");
  assert.equal(code(await gateway.pendingGrading(admin)), "forbidden");
  assert.equal(code(await gateway.listTryouts(tutor)), "forbidden");

  const historical = tutorRead.bank.find((row) => row.origin === "itb_example")!;
  assert.equal(code(await gateway.mutate(tutor, "delete-historical", {
    kind: "bank.delete", target: targetVersion(historical),
  })), "forbidden");
  const simulation = tutorRead.quizzes.find((row) => row.category === "simulation")!;
  assert.equal(code(await gateway.mutate(tutor, "change-simulation", {
    kind: "quiz.save", target: targetVersion(simulation), input: { ...simulation, category: "weekly" },
  })), "forbidden");
  assert.equal(code(await gateway.mutate(tutor, "publish-simulation", {
    kind: "quiz.status", target: targetVersion(simulation), status: "draft",
  })), "forbidden");
});

test("validates edit, preserves untouched draft, detects stale revision and saves after reload", async () => {
  const gateway = createAssessmentFixtureGateway();
  const original = value(await gateway.listQuizzes(admin)).quizzes[0];
  const unsaved = { ...original, title: "Judul yang dibatalkan" };
  assert.notEqual(value(await gateway.listQuizzes(admin)).quizzes[0].title, unsaved.title);
  assert.equal(code(await gateway.mutate(admin, "bad-title", {
    kind: "quiz.save", target: targetVersion(original), input: { ...original, title: " " },
  })), "invalid");
  const last = { ...original, title: "Kuis struktur sel revisi" };
  const saved = await gateway.mutate(admin, "save-title", { kind: "quiz.save", target: targetVersion(original), input: last });
  assert.equal(value(saved).id, original.id);
  assert.equal(code(await gateway.mutate(tutor, "stale-title", {
    kind: "quiz.save", target: targetVersion(original), input: { ...original, title: "Judul lama" },
  })), "conflict");
  const fresh = value(await gateway.listQuizzes(tutor)).quizzes[0];
  assert.equal(fresh.revision, original.revision + 1);
  assert.equal(fresh.title, last.title);
  const title = "Kuis struktur dan fungsi sel";
  value(await gateway.mutate(tutor, "retry-title", { kind: "quiz.save", target: targetVersion(fresh), input: { ...fresh, title } }));
  assert.equal(value(await gateway.listQuizzes(admin)).quizzes[0].title, title);
  assert.equal(value(await gateway.listQuizAttempts(tutor, original.id)).attempts.length, 3);
});

test("retries the same identity after failure and returns one saved mutation", async () => {
  const gateway = createAssessmentFixtureGateway();
  const context = { ...admin, scenario: "error" } as const;
  assert.equal(code(await gateway.listQuizzes(context)), "unavailable");
  const loaded = value(await gateway.listQuizzes(context));
  const command: AssessmentCommand = {
    kind: "quiz.save", target: null, input: { ...defaultQuiz("admin"), title: "Kuis baru" },
  };
  assert.equal(code(await gateway.mutate(context, "same-identity", command)), "unavailable");
  assert.equal(value(await gateway.listQuizzes(context)).quizzes.length, loaded.quizzes.length);
  const saved = await gateway.mutate(context, "same-identity", command);
  assert.deepEqual(await gateway.mutate(context, "same-identity", command), saved);
  assert.equal(value(await gateway.listQuizzes(context)).quizzes.at(-1)?.id, value(saved).id);
  assert.equal(value(await gateway.listQuizzes(context)).quizzes.length, loaded.quizzes.length + 1);
  assert.equal(code(await gateway.mutate(context, "same-identity", {
    ...command, input: { ...command.input, title: "Kuis lain" },
  })), "conflict");
  assert.equal(value(await gateway.listQuizzes(admin)).quizzes.length, loaded.quizzes.length);
});

test("grades free responses with revisions, saves partial review and exposes finalized score in results", async () => {
  const gateway = createAssessmentFixtureGateway();
  const [summary] = value(await gateway.pendingGrading(tutor));
  const { id: attemptId, answers: [choice, essay, short] } = value(await gateway.loadGradingAttempt(tutor, summary.id));
  const item = (questionId: string, score: number, expectedRevision = 0) =>
    ({ questionId, score, expectedRevision, reviewNotes: "Umpan balik" });

  const save = (requestId: string, items: ReturnType<typeof item>[], finalize: boolean) =>
    gateway.mutate(tutor, requestId, { kind: "grading.save", attemptId, items, finalize });

  assert.equal(code(await save("locked", [item(choice.questionId, 90)], false)), "forbidden");
  assert.equal(code(await save("grade-invalid", [item(essay.questionId, 101)], false)), "invalid");
  assert.equal(code(await save("incomplete", [item(short.questionId, 100)], true)), "invalid");
  assert.equal(value(await save("partial", [item(short.questionId, 80)], false)).gradingStatus, "pending");
  assert.equal(code(await save("stale", [item(short.questionId, 100)], false)), "conflict");
  assert.equal(value(await save("finish", [item(essay.questionId, 90)], true)).gradingStatus, "graded");
  assert.deepEqual(value(await gateway.pendingGrading(tutor)), []);
  const { attempts } = value(await gateway.listQuizAttempts(tutor, summary.templateId));
  assert.equal(attempts.find((tryout) => tryout.id === attemptId)?.score, 90);
  assert.equal(value(await gateway.loadGradingAttempt(tutor, attemptId)).answers[1].reviewNotes, "Umpan balik");
});

test("imports course bank questions in order, skips duplicate provenance and applies admin-only changes", async () => {
  const gateway = createAssessmentFixtureGateway();
  const { tryouts: [exam], bank } = value(await gateway.listTryouts(admin));
  const command: AssessmentCommand = {
    kind: "tryout.question.import", exam: targetVersion(exam), bankIds: [bank[0].id, bank[2].id, bank[1].id, bank[1].id],
  };
  assert.equal(code(await gateway.mutate(tutor, "import-unauthorized", command)), "forbidden");
  const result = value(await gateway.mutate(admin, "import", command));
  assert.equal(result.imported, 2);
  assert.equal(result.skipped, 1);
  const fresh = value(await gateway.listTryouts(admin)).tryouts[0];
  assert.deepEqual(fresh.questions.map((question) => question.bankQuestionId), [bank[0].id, bank[2].id, bank[1].id]);
  assert.equal(code(await gateway.mutate(admin, "stale-delete", { kind: "tryout.delete", target: targetVersion(exam) })), "conflict");
  value(await gateway.mutate(admin, "fresh-delete", { kind: "tryout.delete", target: targetVersion(fresh) }));
  assert.deepEqual(value(await gateway.listTryouts(admin)).tryouts, []);
});
