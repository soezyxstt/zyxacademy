import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Client } from "pg";
import * as schema from "../../../../../db/schema";
import { localStudentCookie } from "./session";

const origin = new URL(process.env.BETTER_AUTH_URL ?? "");
const database = new URL(process.env.DATABASE_URL ?? "");
if (![origin.hostname, database.hostname].every(host => ["127.0.0.1", "localhost"].includes(host)) ||
    database.pathname !== "/student_evidence") throw new Error("Expected the disposable loopback Student evidence environment");

const courseId = `assessment-http-${randomUUID()}`;
const canonicalId = `${courseId}-canonical`;
const quizId = `${courseId}-quiz`;
const quizQuestion = `${quizId}-choice`;
const tryoutId = `${courseId}-tryout`;
const tryoutQuestion = `${tryoutId}-choice`;
const prefix = `/api/native/student/assessment/${courseId}`;

async function student(account: "assessment-enrolled" | "assessment-unenrolled") {
  const { name, value } = await localStudentCookie(account);
  return { cookie: `${name}=${value}`, "x-student-id": `student-evidence-${account}` };
}

const [owner, peer] = await Promise.all([student("assessment-enrolled"), student("assessment-unenrolled")]);
async function request(path: string, status: number, payload?: unknown, headers = owner) {
  const method = payload === undefined ? "GET" : "POST";
  const response = await fetch(new URL(`${prefix}/${path}`, origin), {
    headers: { ...headers, "content-type": "application/json" },
    redirect: "manual",
    method,
    body: payload === undefined ? undefined : JSON.stringify(payload),
    signal: AbortSignal.timeout(480_000),
  }).catch((error: unknown) => {
    throw new Error(`${method} ${path}: ${String(error)}`, { cause: error });
  });
  const text = await response.text();
  assert.equal(response.status, status, `${path}: ${text.slice(0, 500)}`);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  return JSON.parse(text);
}

const connection = new Client({ connectionString: database.href });
await connection.connect();
const db = drizzle(connection);
try {
  await db.transaction(async tx => {
    const title = "Asesmen uji HTTP";
    await tx.insert(schema.courses).values({ id: courseId, title, category: "Matematika" });
    await tx.insert(schema.mataKuliah).values({ id: canonicalId, code: courseId, title, legacyCourseId: courseId });
    const expiresAt = new Date(Date.now() + 3_600_000);
    await tx.insert(schema.enrollments).values([owner, peer].map(({ "x-student-id": userId }) => ({
      id: `${courseId}-${userId}`, userId, courseId, enrolledAt: new Date(0), expiresAt,
    })));
    await tx.insert(schema.quizTemplates).values({ id: quizId, courseId, title: "Kuis penjumlahan", category: "chapter",
      status: "published", visibility: "paid", manualStatus: "open", maxAttempts: 1, timeLimitSeconds: 900,
      selectionRules: { fixedQuestionIds: [quizQuestion], count: 1, explanationRelease: "after_close" } });
    await tx.insert(schema.aiQuestionBank).values({ id: quizQuestion, courseId, prompt: "2 + 3", options: ["5", "4"],
      correctIndices: [0], explanation: "Dua tambah tiga sama dengan lima.", reviewStatus: "published" });
    await tx.insert(schema.exams).values({ id: tryoutId, courseId, title: "Tryout penjumlahan",
      type: "tryout", status: "published", settings: { maxAttempts: 1 } });
    await tx.insert(schema.questions).values({ id: tryoutQuestion, examId: tryoutId, order: 1, type: "multiple_choice",
      content: { prompt: "3 + 3", options: ["6", "7"], correctIndex: 0 } });
  });

  const quiz = `quiz/${quizId}`;
  const start = { requestId: randomUUID() };
  const { attemptId } = await request(quiz, 201, start);
  assert.ok(attemptId);
  assert.equal((await request(quiz, 200, start)).attemptId, attemptId);
  const active = await request(`${quiz}?attemptId=${attemptId}`, 200);
  assert.deepEqual(active.player.questions[0].options, ["5", "4"]);
  assert.ok(!JSON.stringify(active).includes("Dua tambah tiga sama dengan lima."));
  const answers = { answers: { [quizQuestion]: 0 } };
  const completed = { attemptId, status: "completed" };
  assert.deepEqual(await request(`${quiz}/attempt/${attemptId}`, 200, answers), completed);
  assert.deepEqual(await request(`${quiz}/attempt/${attemptId}`, 200, answers), completed);
  const quizReview = `my-results/${attemptId}`;
  const held = await request(quizReview, 200);
  assert.equal(held.review.result.score, 100);
  assert.equal(held.review.discussionAvailable, false);
  assert.deepEqual(held.review.items, []);
  await db.update(schema.quizTemplates).set({ manualStatus: "closed" }).where(eq(schema.quizTemplates.id, quizId));
  const released = await request(quizReview, 200);
  assert.equal(released.review.items[0].expected, "A. 5");
  const peerResults = await request("my-results", 200, undefined, peer);
  assert.equal(peerResults.fullAccess, true);
  assert.deepEqual(peerResults.results, []);
  await request(quizReview, 404, undefined, peer);
  assert.equal((await db.select().from(schema.studentQuizAttempts).where(eq(schema.studentQuizAttempts.templateId, quizId))).length, 1);
  console.log("Quiz start 201/200, submit 200/200, one saved attempt, result 100, review released after closing, peer 404");

  const tryout = `tryout/${tryoutId}`;
  const payload = { requestId: randomUUID(), answers: { [tryoutQuestion]: { type: "multiple_choice", index: 0 } } };
  const first = await request(tryout, 201, payload);
  assert.ok(first.submissionId);
  assert.deepEqual(await request(tryout, 201, payload), first);
  await request(tryout, 409, { ...payload, requestId: randomUUID() });
  assert.equal((await db.select().from(schema.submissions).where(eq(schema.submissions.examId, tryoutId))).length, 1);
  const tryoutReview = `my-results/${first.submissionId}`;
  const review = await request(tryoutReview, 200);
  assert.equal(review.review.result.score, 100);
  assert.equal(review.review.items[0].expected, "A. 6");
  await request(tryoutReview, 404, undefined, peer);
  const { results } = await request("my-results", 200);
  assert.deepEqual(results.map(({ id }: { id: string }) => id).sort(), [attemptId, first.submissionId].sort());
  console.log("Tryout submit 201/201, new submission over quota 409, one saved submission, result 100, peer 404, both results listed");
} finally {
  try {
    await db.transaction(async tx => {
      await tx.delete(schema.submissions).where(eq(schema.submissions.examId, tryoutId));
      await tx.delete(schema.questions).where(eq(schema.questions.examId, tryoutId));
      await tx.delete(schema.exams).where(eq(schema.exams.id, tryoutId));
      await tx.delete(schema.enrollments).where(eq(schema.enrollments.courseId, courseId));
      await tx.delete(schema.percobaanAsesmen).where(eq(schema.percobaanAsesmen.asesmenId, quizId));
      await tx.delete(schema.asesmen).where(eq(schema.asesmen.id, quizId));
      await tx.delete(schema.blueprintAsesmen).where(eq(schema.blueprintAsesmen.mataKuliahId, canonicalId));
      await tx.delete(schema.mataKuliah).where(eq(schema.mataKuliah.id, canonicalId));
      await tx.delete(schema.courses).where(eq(schema.courses.id, courseId));
    });
  } finally {
    await connection.end();
  }
}
