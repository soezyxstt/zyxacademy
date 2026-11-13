import { afterAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
let session: { user: { id: string; role: string } } | null = { user: { id: "daily-student", role: "student" } };
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/db", () => ({ db: testDb }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => session } } }));
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
mock.module("@/lib/auth-secret", () => ({ resolveAuthSecret: () => "daily-test-only-signing-secret-32-characters" }));
const { GET, POST } = await import("@/app/api/quiz/daily/route");
afterAll(() => client.close());

test("daily quiz uses published canonical and legacy scope for GET and signed server grading", async () => {
  await testDb.insert(schema.user).values(["student", "other"].map((id) => ({ id: `daily-${id}`, name: id, email: `daily-${id}@test.local`, role: "student" as const })));
  await testDb.insert(schema.pengguna).values([{ id: "daily-student" }, { id: "daily-other" }]);
  await testDb.insert(schema.courses).values([{ id: "daily-course", title: "Course", category: "Fisika" }, { id: "daily-foreign", title: "Foreign", category: "Fisika" }]);
  await testDb.insert(schema.mataKuliah).values([{ id: "daily-canonical", code: "DAILY", title: "Course", legacyCourseId: "daily-course", pricingCategory: "free" }, { id: "daily-other-course", code: "DAILY-OTHER", title: "Foreign", legacyCourseId: "daily-foreign" }]);
  await testDb.insert(schema.chapters).values({ id: "daily-old-first", courseId: "daily-course", title: "First", orderIndex: 1, status: "published" });
  await testDb.insert(schema.bab).values([
    { id: "daily-first", mataKuliahId: "daily-canonical", code: "1", title: "First", orderIndex: 1, legacyChapterId: "daily-old-first" },
    { id: "daily-later", mataKuliahId: "daily-canonical", code: "2", title: "Later", orderIndex: 2 },
    { id: "daily-archived", mataKuliahId: "daily-canonical", code: "3", title: "Archived", orderIndex: 3, status: "archived" },
    { id: "daily-foreign-bab", mataKuliahId: "daily-other-course", code: "1", title: "Foreign", orderIndex: 1 },
  ]);
  for (const [id, course, chapter, status] of [["first", "daily-canonical", "daily-first", "published"], ["later", "daily-canonical", "daily-later", "published"], ["archived", "daily-canonical", "daily-archived", "published"], ["draft", "daily-canonical", "daily-first", "draft"], ["foreign", "daily-other-course", "daily-foreign-bab", "published"], ["stale", "daily-canonical", "daily-first", "published"], ["bank-draft", "daily-canonical", "daily-first", "published"]] as const) {
    await testDb.insert(schema.soal).values({ id: `daily-q-${id}`, mataKuliahId: course, babId: chapter, status, creatorId: "daily-student", questionType: "multiple_choice", prompt: id, difficulty: "easy", cognitiveLevel: "apply", reasoningPattern: "test", generationHash: id });
    await testDb.insert(schema.aiQuestionBank).values({ id: `daily-q-${id}`, courseId: "daily-course", prompt: id, difficulty: "easy", options: [{ text: "A", isCorrect: true }, { text: "B", isCorrect: false }], correctIndices: [0], explanation: "SECRET ANSWER", reviewStatus: id === "bank-draft" ? "generated" : "published", isStale: id === "stale", tags: ["selected"] });
  }
  await client.exec(`
    INSERT INTO master_teaching_documents (id,course_id,title,markdown_content,created_by_id) VALUES ('daily-mtd','daily-course','Source','body','daily-student');
    INSERT INTO concepts (id,canonical_slug) VALUES ('daily-concept','daily-concept');
    INSERT INTO knowledge_objects (id,course_id,mtd_id,chapter_id,concept_id,learning_order,title,concept_name,content,type,bloom_level,tags,metadata) VALUES ('daily-ko','daily-course','daily-mtd','daily-old-first','daily-concept',1,'First','First','body','definition','understand','[]','{}');
  `);
  await testDb.insert(schema.aiQuestionBank).values([
    { id: "daily-q-legacy", courseId: "daily-course", knowledgeObjectId: "daily-ko", prompt: "legacy", difficulty: "easy", options: ["A", "B"], correctIndices: [0], explanation: "SECRET ANSWER", reviewStatus: "published", tags: ["selected"] },
    { id: "daily-q-unscoped", courseId: "daily-course", prompt: "unscoped", options: ["A"], correctIndices: [0], explanation: "SECRET ANSWER", reviewStatus: "published" },
    ...[true, false].map((quizEligible) => ({ id: `daily-history-${quizEligible}`, courseId: "daily-course", knowledgeObjectId: "daily-ko", prompt: "history", options: ["A"], correctIndices: [0], explanation: "SECRET ANSWER", origin: "historical_reference" as const, quizEligible, reviewStatus: "generated" as const, tags: ["history"] })),
  ]);
  await testDb.insert(schema.quizTemplates).values({ id: "daily-template", courseId: "daily-course", title: "Daily", category: "daily", status: "published", visibility: "free", selectionRules: {} });
  const rules = async (selectionRules: unknown) => testDb.update(schema.quizTemplates).set({ selectionRules }).where(eq(schema.quizTemplates.id, "daily-template"));
  const pricing = async (pricingCategory: "free" | "limited_time_free", freeStartsAt: Date | null, freeEndsAt: Date | null) => testDb.update(schema.mataKuliah).set({ pricingCategory, freeStartsAt, freeEndsAt }).where(eq(schema.mataKuliah.id, "daily-canonical"));
  const get = async () => { const response = await GET(); expect(response.status).toBe(200); const body = await response.json(); expect(JSON.stringify(body)).not.toMatch(/SECRET ANSWER|correctIndices|correct_indices|isCorrect|acceptableAnswers|explanation/); return body; };
  const submit = async (body: any) => POST(new NextRequest("http://localhost/api/quiz/daily", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ templateId: "daily-template", questionIds: body.questionIds, questionSetToken: body.questionSetToken, answers: Object.fromEntries(body.questionIds.map((id: string) => [id, 0])) }) }));

  await rules({ chapterId: "daily-later", fixedQuestionIds: ["daily-q-later"] });
  let result = await get();
  expect(result.questionIds).toEqual(["daily-q-later"]);
  let submitted = await submit(result);
  expect(submitted.status).toBe(200);
  const submittedBody = await submitted.json();
  expect(submittedBody.score).toBe(100);
  expect(await testDb.select().from(schema.percobaanAsesmen).where(eq(schema.percobaanAsesmen.id, submittedBody.attemptId))).toHaveLength(1);
  await rules({ chapterId: "daily-old-first", tags: ["selected"] });
  result = await get();
  expect(result.questionIds.sort()).toEqual(["daily-q-first", "daily-q-legacy"]);
  expect((await submit(result)).status).toBe(200);
  await rules({});
  result = await get();
  expect(result.questionIds.sort()).toEqual(["daily-q-first", "daily-q-later", "daily-q-legacy"]);

  await rules({ chapterIds: [], fixedQuestionIds: ["daily-q-later"], tags: [] });
  result = await get();
  expect(result.questionIds).toEqual(["daily-q-later"]);
  expect((await submit(result)).status).toBe(200);

  await testDb.update(schema.aiQuestionBank).set({ reviewStatus: "published" }).where(eq(schema.aiQuestionBank.origin, "historical_reference"));
  await rules({ chapterId: "daily-first", tags: ["history"] });
  expect((await get()).questionIds).toEqual(["daily-history-true"]);
  await testDb.update(schema.aiQuestionBank).set({ reviewStatus: "generated" }).where(eq(schema.aiQuestionBank.origin, "historical_reference"));

  const now = Date.now();
  await pricing("limited_time_free", new Date(now - 86400000), new Date(now + 86400000));
  await rules({ chapterId: "daily-later", fixedQuestionIds: ["daily-q-later"] });
  result = await get();
  expect(result.questionIds).toEqual(["daily-q-later"]);
  expect((await submit(result)).status).toBe(200);
  await rules({ chapterIds: ["daily-first", "daily-later"] });
  result = await get();
  expect(result.questionIds.sort()).toEqual(["daily-q-first", "daily-q-later", "daily-q-legacy"]);
  expect((await submit(result)).status).toBe(200);
  await pricing("limited_time_free", new Date(now + 86400000), new Date(now + 172800000));
  await rules({ chapterIds: [] });
  expect((await get()).templateId).toBeNull();
  await rules({ chapterId: "daily-later" });
  expect((await get()).templateId).toBeNull();
  await rules({ chapterId: "daily-old-first" });
  expect((await get()).questionIds.sort()).toEqual(["daily-q-first", "daily-q-legacy"]);
  await rules({ chapterId: "daily-later" });
  await pricing("limited_time_free", new Date(now - 172800000), new Date(now - 86400000));
  expect((await get()).templateId).toBeNull();
  await rules({ chapterId: "daily-old-first" });
  result = await get();
  expect(result.questionIds.sort()).toEqual(["daily-q-first", "daily-q-legacy"]);
  const preview = result;
  expect((await submit({ ...preview, questionIds: ["daily-q-later"] })).status).toBe(403);
  session = { user: { id: "daily-other", role: "student" } };
  expect((await submit(preview)).status).toBe(403);
  session = { user: { id: "daily-student", role: "student" } };
  await testDb.insert(schema.pendaftaranMurid).values({ id: "daily-paid", penggunaId: "daily-student", mataKuliahId: "daily-canonical", status: "active" });
  await rules({ chapterIds: [], fixedQuestionIds: ["daily-q-later"], tags: [] });
  result = await get();
  expect(result.questionIds).toEqual(["daily-q-later"]);
  expect((await submit(result)).status).toBe(200);

  await testDb.delete(schema.pendaftaranMurid).where(eq(schema.pendaftaranMurid.id, "daily-paid"));
  await pricing("free", null, null);
  for (const id of ["daily-q-archived", "daily-q-foreign", "daily-q-draft", "daily-q-stale", "daily-q-bank-draft", "daily-q-unscoped", "daily-q-missing"]) {
    await rules({ chapterId: "daily-first", fixedQuestionIds: [id] });
    expect((await get()).questionIds).toEqual([]);
  }
  await rules({ chapterId: "daily-first", fixedQuestionIds: ["daily-q-first"] });
  result = await get();
  await testDb.update(schema.soal).set({ status: "draft" }).where(eq(schema.soal.id, "daily-q-first"));
  expect((await submit(result)).status).toBe(403);
  for (const selectionRules of ["{", { chapterId: "daily-first", chapterIds: ["daily-first"] }, { fixedQuestionIds: ["daily-q-first", null] }, { tags: "selected" }]) {
    await rules(selectionRules);
    expect((await get()).templateId).toBeNull();
  }
});
