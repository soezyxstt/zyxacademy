import { afterAll, expect, mock, test } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "../../db/schema";

const { client, testDb } = await createPostgresTestDb();
mock.module("@/db", () => ({ db: testDb }));
const { computeSnapshotPayload, cohortSnapshotAnswerCorrectness } = await import("../../lib/cohort-analytics");
afterAll(async () => { mock.restore(); await client.close(); });

test("PostgreSQL snapshot grades current short-answer text and legacy option arrays without losing the course", async () => {
  const id = "cohort-answer-fixture";
  await testDb.insert(schema.user).values({ id, name: "Fixture", email: "cohort@example.invalid" });
  await testDb.insert(schema.courses).values({ id, title: "Fixture", category: "Matematika" });
  await testDb.insert(schema.quizTemplates).values({ id, courseId: id, title: "Fixture", category: "chapter", selectionRules: {} });
  const questions = [
    { id: "mc", question_type: "multiple_choice", correct_indices: [0] },
    { id: "short", question_type: "short_answer", correct_indices: [0], acceptable_answers: ["5"] },
    { id: "legacy", questionType: "multiple_choice", correctIndices: [1] },
    { id: "essay", question_type: "essay", correct_indices: [] },
  ];
  for (const question of questions) await testDb.insert(schema.aiQuestionBank).values({
    id: question.id, courseId: id, prompt: question.id, options: ["5", "6"], correctIndices: [0], explanation: "Fixture",
    reviewStatus: "published", quizEligible: false,
  });
  for (let index = 0; index < 5; index++) await testDb.insert(schema.studentQuizAttempts).values({
    id: `attempt-${index}`, studentId: id, templateId: id, status: "completed", questionsSnapshot: questions,
    answersSnapshot: { mc: [0], short: "5", legacy: [1], essay: { text: "An essay requires a rubric." } },
  });
  // An unsupported answer shape must not become an extra incorrect MC sample.
  await testDb.insert(schema.studentQuizAttempts).values({
    id: "malformed-answer", studentId: id, templateId: id, status: "completed",
    questionsSnapshot: [questions[0]], answersSnapshot: { mc: { text: "unsupported option shape" } },
  });
  const payload = await computeSnapshotPayload(id);
  const results = Object.fromEntries(payload.mostMissed._unknown.map(question => [question.id, question]));
  expect(Object.keys(results).sort()).toEqual(["legacy", "mc", "short"]);
  for (const question of Object.values(results)) {
    expect(question.attemptCount).toBe(5);
    expect(question.correctRate).toBe(1);
  }
  const snapshots = await testDb.select().from(schema.courseAnalyticsSnapshots);
  expect(snapshots).toHaveLength(1);
  expect(snapshots[0].payload).toEqual(payload);
}, 30_000);

test("unsupported grading shapes stay outside correctness denominators", () => {
  expect(cohortSnapshotAnswerCorrectness({ correct_indices: [0] }, { length: 1 })).toBeNull();
  expect(cohortSnapshotAnswerCorrectness({ correct_indices: [0] }, "0")).toBeNull();
  expect(cohortSnapshotAnswerCorrectness({ correct_indices: [] }, [])).toBeNull();
  expect(cohortSnapshotAnswerCorrectness({ question_type: "short_answer", acceptable_answers: ["5"] }, { other: "5" })).toBeNull();
  expect(cohortSnapshotAnswerCorrectness({ question_type: "essay" }, { text: "An essay" })).toBeNull();
  expect(cohortSnapshotAnswerCorrectness({ question_type: "short_answer", acceptable_answers: ["5"] }, "6")).toBe(false);
  expect(cohortSnapshotAnswerCorrectness({ correct_indices: [1], stable_option_ids: ["a", "b"] }, "b")).toBe(true);
  expect(cohortSnapshotAnswerCorrectness({ correct_indices: [1], stable_option_ids: ["a", "b"] }, [1, "b"])).toBeNull();
  expect(cohortSnapshotAnswerCorrectness({ question_type: "short_answer", acceptable_answers: [{}] }, "[object Object]")).toBeNull();
});
