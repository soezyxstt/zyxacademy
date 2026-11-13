import { afterAll, beforeEach, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
const dispatched: string[] = [];
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => ({ user: { id: "admin", role: "admin" } }) } } }));
mock.module("@/lib/auth/authorization", () => ({ hasAnyPeran: async () => true }));
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/vector-sync-dispatch", () => ({ dispatchVectorSync: async (courseId: string) => { dispatched.push(courseId); } }));
const { executeCreateQuestion, executePublishQuestion } = await import("@/lib/admin-ops-ai/domain-assessment");
const { transitionQuestionReviewTx } = await import("@/lib/question-review-lifecycle");
const { reconcileVectorRows, validateQueuedVectorRow } = await import("@/lib/vectorize/reconcile");

afterAll(async () => { await client.close(); });
beforeEach(async () => {
  dispatched.length = 0;
  await client.exec('TRUNCATE TABLE "user", courses, mata_kuliah CASCADE');
  await testDb.insert(schema.user).values({ id: "admin", name: "Admin", email: "review@example.test" });
  await testDb.insert(schema.pengguna).values({ id: "admin" });
  await testDb.insert(schema.courses).values({ id: "legacy", title: "Course", category: "Test" });
  await testDb.insert(schema.mataKuliah).values({ id: "canonical", legacyCourseId: "legacy", code: "COURSE", title: "Course" });
});

test("a consumed generated job is followed by an atomic publish for the current canonical version", async () => {
  await testDb.insert(schema.aiQuestionBank).values({ id: "question", courseId: "legacy", prompt: "Which?", options: ["A", "B"], correctIndices: [0], explanation: "Private answer", reviewStatus: "generated" });
  await testDb.insert(schema.soal).values({
    id: "question", mataKuliahId: "canonical", questionType: "multiple_choice", prompt: "Which?",
    optionsSnapshot: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: false }],
    version: 3, status: "draft", difficulty: "easy", cognitiveLevel: "remember", reasoningPattern: "recall", generationHash: "hash", creatorId: "admin",
  });
  await testDb.insert(schema.pembahasanSoal).values({ id: "solution", soalId: "question", version: 3, content: "Private answer", status: "draft", generationHash: "hash", creatorId: "admin" });
  await testDb.insert(schema.vectorSyncQueue).values({ id: "generated", courseId: "legacy", namespace: "practice", action: "upsert", payload: { id: "question", text: "Question: Which?" } });
  const [generated] = await testDb.select().from(schema.vectorSyncQueue).where(eq(schema.vectorSyncQueue.id, "generated"));
  expect(() => validateQueuedVectorRow(generated)).toThrow("VECTOR_SYNC_LEGACY_NAMESPACE_RETIRED");
  await testDb.update(schema.vectorSyncQueue).set({ status: "failed", attempts: 10 }).where(eq(schema.vectorSyncQueue.id, "generated"));

  await executePublishQuestion({ questionId: "question" }, "admin");
  const [canonical] = await testDb.select().from(schema.soal).where(eq(schema.soal.id, "question"));
  const [legacy] = await testDb.select().from(schema.aiQuestionBank).where(eq(schema.aiQuestionBank.id, "question"));
  const [solution] = await testDb.select().from(schema.pembahasanSoal).where(eq(schema.pembahasanSoal.id, "solution"));
  expect(canonical).toMatchObject({ status: "published", version: 3 });
  expect(legacy).toMatchObject({ reviewStatus: "published", status: "active" });
  expect(solution.status).toBe("published");
  expect(dispatched).toEqual(["legacy"]);
  const pending = await testDb.select().from(schema.vectorSyncQueue).where(eq(schema.vectorSyncQueue.status, "pending"));
  const job = pending.find((row) => row.namespace === "published_questions" && row.action === "upsert")!;
  expect(job).toMatchObject({ action: "upsert", payload: { entityId: "question", version: 3 } });
  expect(pending).toContainEqual(expect.objectContaining({ namespace: "published_questions", action: "delete", payload: expect.objectContaining({ entityId: "question", version: 1 }) }));
  const [after] = await testDb.transaction((tx) => reconcileVectorRows(tx as never, [job]));
  expect(after.outbox).toMatchObject({ operation: "upsert", version: 3, content: 'Which?\n\nOptions: [{"text":"A"},{"text":"B"}]' });
  expect(JSON.stringify(after.outbox)).not.toContain("Private answer");
  expect(JSON.stringify(after.outbox)).not.toContain("isCorrect");

  await testDb.transaction((tx) => transitionQuestionReviewTx(tx as never, { id: "question", reviewStatus: "retired", actorId: "admin" }));
  const retiredJobs = (await testDb.select().from(schema.vectorSyncQueue)).filter((row) => row.namespace === "published_questions" && row.action === "delete" && (row.payload as { version?: number }).version === 3);
  expect(retiredJobs).toHaveLength(1);
  expect(retiredJobs[0].payload).toMatchObject({ entityId: "question", version: 3 });
  const [retired] = await testDb.transaction((tx) => reconcileVectorRows(tx as never, retiredJobs));
  expect(retired.outbox.operation).toBe("delete");
});

test("legacy-only Ops creation does not enter canonical indexing", async () => {
  const result = await executeCreateQuestion({ courseId: "legacy", prompt: "New question?", options: ["A", "B"], correctAnswer: "A" }, "admin");
  expect(result.data.id).toBeTruthy();
  expect(await testDb.select().from(schema.vectorSyncQueue)).toHaveLength(0);
  expect(dispatched).toEqual(["legacy"]);
});

test("historical publication without required source and Idea rolls back without an outbox", async () => {
  await testDb.insert(schema.aiQuestionBank).values({ id: "historical", courseId: "legacy", origin: "historical_reference", prompt: "Question", options: [], correctIndices: [], explanation: "Explanation", reviewStatus: "generated" });
  await testDb.insert(schema.soal).values({ id: "historical", mataKuliahId: "canonical", origin: "historical_reference", questionType: "multiple_choice", prompt: "Question", optionsSnapshot: [], status: "draft", difficulty: "easy", cognitiveLevel: "remember", reasoningPattern: "recall", generationHash: "hash", creatorId: "admin" });
  await expect(executePublishQuestion({ questionId: "historical" }, "admin")).rejects.toThrow();
  expect(await testDb.select().from(schema.vectorSyncQueue)).toHaveLength(0);
  expect((await testDb.select().from(schema.soal))[0].status).toBe("draft");
  expect((await testDb.select().from(schema.aiQuestionBank))[0].reviewStatus).toBe("generated");
  expect(dispatched).toHaveLength(0);
});

test("a failed outer transaction rolls back the review projection, audit and outbox", async () => {
  await testDb.insert(schema.aiQuestionBank).values({ id: "rollback", courseId: "legacy", prompt: "Question", options: [], correctIndices: [], explanation: "Explanation", reviewStatus: "generated" });
  await expect(testDb.transaction(async (tx) => {
    await transitionQuestionReviewTx(tx as never, { id: "rollback", reviewStatus: "published", actorId: "admin" });
    throw new Error("rollback");
  })).rejects.toThrow("rollback");
  expect((await testDb.select().from(schema.aiQuestionBank))[0].reviewStatus).toBe("generated");
  expect(await testDb.select().from(schema.vectorSyncQueue)).toHaveLength(0);
  expect(await testDb.select().from(schema.auditMutasi)).toHaveLength(0);
});

const { questionAuthoringInputSchema } = await import("@/lib/question-authoring-contract");
const { createCanonicalQuestion, updateCanonicalQuestion, createCanonicalQuestionBatch } = await import("@/lib/question-authoring");

test("canonical creation, revision and batch enqueue current identities and retire superseded manual solutions", async () => {
  const input = questionAuthoringInputSchema.parse({ courseId: "canonical", prompt: "Which number is even?", questionType: "multiple_choice", difficulty: "easy", options: ["2", "3"], correctIndices: [0], explanation: "Two is even.", reviewStatus: "published" });
  const created = await createCanonicalQuestion(input, "admin");
  expect(created.version).toBe(1);
  const updated = await updateCanonicalQuestion({ ...input, prompt: "Which number is odd?", correctIndices: [1], explanation: "Three is odd." }, "admin", created.id);
  expect(updated.version).toBe(2);
  const solutions = await testDb.select().from(schema.pembahasanSoal).where(eq(schema.pembahasanSoal.soalId, created.id));
  expect(solutions.find(row => row.version === 1)?.status).toBe("retired");
  expect(solutions.find(row => row.version === 2)?.status).toBe("published");
  const jobs = await testDb.select().from(schema.vectorSyncQueue);
  expect(jobs).toContainEqual(expect.objectContaining({ namespace: "published_questions", action: "upsert", payload: expect.objectContaining({ entityId: created.id, version: 2 }) }));
  expect(jobs).toContainEqual(expect.objectContaining({ namespace: "published_questions", action: "delete", payload: expect.objectContaining({ entityId: created.id, version: 1 }) }));
  expect(jobs).toContainEqual(expect.objectContaining({ namespace: "published_solutions", action: "delete", payload: expect.objectContaining({ entityId: solutions.find(row => row.version === 1)!.id }) }));
  const batch = await createCanonicalQuestionBatch({ courseId: "canonical", creatorId: "admin", reviewStatus: "published", items: [{ question: input }] });
  expect(batch).toHaveLength(1);
  expect((await testDb.select().from(schema.vectorSyncQueue)).some(row => row.namespace === "published_questions" && (row.payload as { entityId?: string }).entityId === batch[0].id)).toBe(true);
  expect(dispatched).toEqual(["legacy", "legacy", "legacy"]);
});

const { NextRequest } = await import("next/server");
const { PUT: bulkReview } = await import("@/app/api/admin/questions/route");
const { DELETE: deleteQuestion } = await import("@/app/api/admin/questions/[id]/route");

test("bulk canonical publication and deletion queue question and solution transitions before dispatch", async () => {
  const input = questionAuthoringInputSchema.parse({ courseId: "canonical", prompt: "A publication transition?", questionType: "multiple_choice", difficulty: "easy", options: ["Yes", "No"], correctIndices: [0], explanation: "Private explanation", reviewStatus: "generated" });
  const created = await createCanonicalQuestion(input, "admin");
  await testDb.delete(schema.vectorSyncQueue);
  dispatched.length = 0;
  const published = await bulkReview(new NextRequest("http://localhost/api/admin/questions", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [created.id], reviewStatus: "published" }) }));
  expect(published.status).toBe(200);
  const publishedJobs = await testDb.select().from(schema.vectorSyncQueue);
  expect(publishedJobs.some(row => row.namespace === "published_questions" && row.action === "upsert")).toBe(true);
  expect(publishedJobs.some(row => row.namespace === "published_solutions" && row.action === "upsert")).toBe(true);
  expect(dispatched).toEqual(["legacy"]);
  await testDb.delete(schema.vectorSyncQueue);
  const deleted = await deleteQuestion(new NextRequest(`http://localhost/api/admin/questions/${created.id}`, { method: "DELETE" }), { params: Promise.resolve({ id: created.id }) });
  expect(deleted.status).toBe(200);
  expect(await testDb.select().from(schema.soal)).toHaveLength(0);
  expect(await testDb.select().from(schema.pembahasanSoal)).toHaveLength(0);
  const deletionJobs = await testDb.select().from(schema.vectorSyncQueue);
  expect(deletionJobs.some(row => row.namespace === "published_questions" && row.action === "delete")).toBe(true);
  expect(deletionJobs.some(row => row.namespace === "published_solutions" && row.action === "delete")).toBe(true);
  expect(dispatched).toEqual(["legacy", "legacy"]);
});
