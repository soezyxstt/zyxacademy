import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { createPostgresTestDb } from "../helpers/postgres";
import * as schema from "@/db/schema";
import { PERAN_SEEDS, membershipIdFor } from "@/lib/auth/peran";
import { projectQuestion, readQuizAnswers } from "@/lib/student/assessment-projection";
import { choice, playerDeadline, restoreAssessmentDraft, toTryoutAnswers } from "../../apps/mobile-native/features/student/assessment/client";
import { assessmentApiPath, type AssessmentPage, type AssessmentPlayer } from "../../packages/native-parity/student/assessment/contract";
import { assessmentFixturePaths, createAssessmentFixtureRequest } from "../../packages/native-parity/student/assessment/fixtures";

const learner = "assessment-learner";
const other = "assessment-other";
const denied = "assessment-denied";
const courseId = "assessment-course";
const wrongCourse = "other-course";
const quizId = "assessment-quiz";
const quizQuestion = "quiz-q1";
const tryoutId = "assessment-tryout";
const tryoutQuestion = "tryout-q1";
const quizKey = "ad26ac66-f510-4b9a-8a0c-36dceb88f379";
const tryoutKey = "ad26ac66-f510-4b9a-8a0c-36dceb88f380";
let userId: string | null = learner;
let database: Awaited<ReturnType<typeof createPostgresTestDb>>;
const dbProxy = new Proxy({} as typeof database.testDb, {
  get(_target, key) {
    const db = database.testDb;
    const value = Reflect.get(db, key);
    return typeof value === "function" ? value.bind(db) : value;
  },
});
mock.module("@/db", () => ({ db: dbProxy }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => userId ? { user: { id: userId, role: "student" } } : null } } }));
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {}, unstable_cache: (callback: Function) => callback }));
mock.module("@/lib/inngest", () => ({ inngest: { send: async () => ({ ids: [] }) } }));

import { GET, POST } from "@/app/api/native/student/assessment/[courseId]/[...segments]/route";
import { signTryoutAttachment, verifyTryoutAttachment } from "@/lib/student/tryout-attachment-receipt";

beforeAll(async () => {
  database = await createPostgresTestDb();
  const db = database.testDb;
  await db.insert(schema.peran).values(PERAN_SEEDS).onConflictDoNothing();
  await db.insert(schema.user).values([learner, other, denied].map((id) => ({ id, name: id, email: `${id}@example.invalid` })));
  await db.insert(schema.pengguna).values([learner, other, denied].map((id) => ({ id, status: "active" as const })));
  await db.insert(schema.penggunaPeran).values([learner, other, denied].map((id) => ({ id: membershipIdFor(id, "murid"), penggunaId: id,
    peranId: PERAN_SEEDS.find((seed) => seed.code === "murid")!.id, source: "seed" })));
  await db.insert(schema.courses).values([courseId, wrongCourse].map((id) => ({ id, title: id, category: "Matematika" as const })));
  await db.insert(schema.mataKuliah).values([courseId, wrongCourse].map((id) => ({ id: `mk-${id}`, code: id, title: id, legacyCourseId: id })));
  await db.insert(schema.enrollments).values([learner, other].map((id) => ({ id: `${id}-enr`, userId: id, courseId, enrolledAt: new Date(0), expiresAt: new Date(Date.now() + 86_400_000) })));
  await db.insert(schema.quizTemplates).values({ id: quizId, courseId, category: "chapter", status: "published", visibility: "paid",
    title: "Kuis native", maxAttempts: 1, timeLimitSeconds: 60, selectionRules: { fixedQuestionIds: [quizQuestion], count: 1, explanationRelease: "after_close" } });
  await db.insert(schema.aiQuestionBank).values({ id: quizQuestion, courseId, prompt: "2 + 3", options: ["5", "4"], correctIndices: [0], explanation: "Two plus three is five", reviewStatus: "published" });
  await db.insert(schema.exams).values({ id: tryoutId, courseId, title: "Tryout native", type: "tryout", status: "published", settings: { maxAttempts: 1 } });
  await db.insert(schema.questions).values({ id: tryoutQuestion, examId: tryoutId, order: 1, type: "multiple_choice", content: { prompt: "3 + 3", options: ["6", "7"], correctIndex: 0, explanation: "Three plus three is six" } });
}, 60_000);
afterAll(async () => { await database?.client.close(); });

function call(segments: string[], options: { method?: "GET" | "POST"; body?: unknown; raw?: string; expected?: string; course?: string; query?: string } = {}) {
  const method = options.method ?? "GET";
  const key = options.course ?? courseId;
  const request = new Request(`http://localhost:3000/api/native/student/assessment/${key}/${segments.join("/")}${options.query ?? ""}`, {
    method, headers: { "x-student-id": options.expected ?? userId ?? "", "Content-Type": "application/json" },
    body: options.raw ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });
  return (method === "GET" ? GET : POST)(request, { params: Promise.resolve({ courseId: key, segments }) });
}

describe("native Student assessment against PostgreSQL and legacy quiz/tryout handlers", () => {
  test("session binding and the exam course are both required", async () => {
    userId = null;
    expect((await call(["quiz"])).status).toBe(401);
    userId = learner;
    expect((await call(["quiz"], { expected: other })).status).toBe(409);
    expect((await call(["quiz", quizId], { method: "POST", body: { requestId: quizKey }, course: wrongCourse })).status).toBe(404);
    userId = denied;
    const payload = await (await call(["tryout", tryoutId])).json() as AssessmentPage;
    expect(payload.kind).toBe("tryout-detail");
    if (payload.kind === "tryout-detail") expect(payload.player).toBeNull();
    expect((await call(["quiz", quizId], { method: "POST", body: { requestId: quizKey } })).status).toBe(403);
    userId = learner;
  });

  test("a retried quiz start reserves one attempt and a retried submit releases only the owner's allowed review", async () => {
    const start = () => call(["quiz", quizId], { method: "POST", body: { requestId: quizKey } });
    const [first, second] = await Promise.all([start(), start()]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    const firstBody = await first.json();
    const secondBody = await second.json();
    expect(firstBody.attemptId).toBe(secondBody.attemptId);
    const attemptId = firstBody.attemptId as string;
    expect(await database.testDb.select().from(schema.studentQuizAttempts).where(eq(schema.studentQuizAttempts.templateId, quizId))).toHaveLength(1);
    const player = await call(["quiz", quizId], { query: `?attemptId=${attemptId}` });
    const activeBody = await player.json();
    expect(activeBody.player.questions[0]).toEqual({ id: quizQuestion, type: "multiple_choice", prompt: "2 + 3", options: ["5", "4"], acceptsImage: false, acceptsFile: false });
    expect(JSON.stringify(activeBody)).not.toContain("Two plus three is five");
    userId = other;
    expect((await call(["quiz", quizId], { query: `?attemptId=${attemptId}` })).status).toBe(404);
    expect((await call(["my-results", attemptId, "summary"])).status).toBe(404);
    userId = learner;
    const submit = () => call(["quiz", quizId, "attempt", attemptId], { method: "POST", body: { answers: { [quizQuestion]: 0 } } });
    expect(await (await submit()).json()).toEqual({ attemptId, status: "completed" });
    expect(await (await submit()).json()).toEqual({ attemptId, status: "completed" });
    const hidden = await (await call(["my-results", attemptId])).json();
    expect(hidden.review).toMatchObject({ discussionAvailable: false, items: [], result: { id: attemptId, score: 100 } });
    const summary = await (await call(["quiz", quizId, "summary", attemptId])).json();
    expect(summary.analytics.status).toBe("not_available");
    await database.testDb.update(schema.quizTemplates).set({ manualStatus: "closed" }).where(eq(schema.quizTemplates.id, quizId));
    const released = await (await call(["my-results", attemptId])).json();
    expect(released.review.items[0]).toMatchObject({ correct: true, expected: "A. 5", explanation: "Two plus three is five" });
    expect((await start()).status).toBe(200);
    expect((await call(["my-results", attemptId], { course: wrongCourse })).status).toBe(404);
  });

  test("tryout validates answers and deduplicates concurrent and lost-response retries", async () => {
    const send = (key: string, answers: Record<string, unknown>) => call(["tryout", tryoutId], { method: "POST", body: { requestId: key, answers } });
    const detail = await (await call(["tryout", tryoutId])).json();
    expect(JSON.stringify(detail)).not.toContain("correctIndex");
    expect(JSON.stringify(detail)).not.toContain("Three plus three is six");
    expect((await call(["tryout", tryoutId], { method: "POST", raw: `"${"a".repeat(513 * 1024)}"` })).status).toBe(413);
    expect((await send(tryoutKey, { foreignQuestion: { type: "multiple_choice", index: 0 } })).status).toBe(422);
    const answers = { [tryoutQuestion]: { type: "multiple_choice", index: 0 } };
    const responses = await Promise.all([send(tryoutKey, answers), send(tryoutKey, answers)]);
    expect(responses.map((response) => response.status)).toEqual([201, 201]);
    const ids = await Promise.all(responses.map(async (response) => (await response.json()).submissionId as string));
    expect(ids[1]).toBe(ids[0]);
    expect((await send(quizKey, answers)).status).toBe(409);
    expect(await database.testDb.select().from(schema.submissions).where(and(eq(schema.submissions.userId, learner), eq(schema.submissions.examId, tryoutId)))).toHaveLength(1);
    const review = await (await call(["my-results", ids[0]])).json();
    expect(review.review.result.score).toBe(100);
    expect(review.review.items[0].expected).toBe("A. 6");
    userId = other;
    expect((await call(["my-results", ids[0]])).status).toBe(404);
    userId = learner;
    await database.testDb.delete(schema.enrollments).where(eq(schema.enrollments.userId, learner));
    expect((await send(tryoutKey, answers)).status).toBe(403);
    expect((await call(["my-results", ids[0]])).status).toBe(404);
  });
});

test("draft recovery preserves answers, timer, flags and pending tryout identity", () => {
  const player: AssessmentPlayer = { questions: [{ id: "q1", type: "multiple_choices", prompt: "Choose", options: ["a", "b", "c"] }],
    answers: {}, startAt: null, closeAt: "2026-10-05T03:21:00Z", durationSeconds: 60, canGoBack: true, requireAllAnswered: false, perQuestionSeconds: null };
  const initial = Date.parse("2026-10-05T03:20:30Z");
  const first = restoreAssessmentDraft(null, player, () => tryoutKey, initial);
  first.answers = { q1: choice([2], 0, true), stale: "ignored" };
  first.flags = { q1: true, stale: true };
  first.pending = true;
  first.frozenAnswers = toTryoutAnswers(player.questions, first.answers);
  const restored = restoreAssessmentDraft(JSON.stringify(first), player, () => quizKey, initial + 500);
  expect(restored).toMatchObject({ requestId: tryoutKey, pending: true, answers: { q1: [0, 2] }, flags: { q1: true } });
  expect(Object.keys(restored.answers)).toEqual(["q1"]);
  expect(restored.frozenAnswers).toEqual({ q1: { type: "multiple_choices", indices: [0, 2] } });
  expect(playerDeadline(player, restored.startedAt)).toBe(Date.parse(player.closeAt!));
});

test("fixture lost-response retry recovers the same committed submission", async () => {
  const fixture = createAssessmentFixtureRequest("retry");
  const path = assessmentApiPath(assessmentFixturePaths.tryout);
  const write = { method: "POST", body: JSON.stringify({ requestId: tryoutKey, answers: {} }) };
  await expect(fixture(path, write)).rejects.toThrow("Fixture response lost");
  const committed = await (await fixture(path, write)).json();
  expect(await (await fixture(path, write)).json()).toEqual(committed);
  const updated = await (await fixture(assessmentApiPath(assessmentFixturePaths.results))).json();
  expect(updated.results.filter((result: { id: string }) => result.id === committed.submissionId)).toHaveLength(1);
});

test("legacy type inference preserves old short and multiple-choice inputs without exposing grading keys", () => {
  const short = { id: "short", prompt: "Type an expression", acceptableAnswers: ["2x"], explanation: "Power rule" };
  const multi = { id: "multi", prompt: "Choose two", options: ["a", "b", "c"], correct_indices: [0, 2], stable_option_ids: ["a0", "b1", "c2"] };
  expect(projectQuestion(short)).toMatchObject({ type: "short_answer", options: [] });
  expect(projectQuestion(multi)).toMatchObject({ type: "multiple_choices", options: ["a", "b", "c"] });
  const redacted = JSON.stringify([projectQuestion(short), projectQuestion(multi)]);
  expect(redacted).not.toContain("acceptableAnswers");
  expect(redacted).not.toContain("correct_indices");
  expect(redacted).not.toContain("Power rule");
  expect(readQuizAnswers({ short: "2x", multi: ["a0", "c2"] }, [short, multi])).toEqual({ short: "2x", multi: [0, 2] });
});

test("a tryout upload receipt binds the file to the account, question and draft", () => {
  const claim = { userId: learner, examId: tryoutId, questionId: tryoutQuestion, requestId: tryoutKey, fileKey: "exams/signed/attachment.pdf", fileName: "attachment.pdf" };
  const receipt = signTryoutAttachment(claim);
  expect(verifyTryoutAttachment(claim, receipt)).toBe(true);
  expect(verifyTryoutAttachment({ ...claim, userId: other }, receipt)).toBe(false);
  expect(verifyTryoutAttachment({ ...claim, questionId: quizQuestion }, receipt)).toBe(false);
  expect(verifyTryoutAttachment({ ...claim, requestId: quizKey }, receipt)).toBe(false);
  expect(verifyTryoutAttachment({ ...claim, fileKey: "exams/unrelated/secret.pdf" }, receipt)).toBe(false);
});
