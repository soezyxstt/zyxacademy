import { afterAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
let session: { user: { id: string; role: string } } | null = null;
mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => session } } }));
mock.module("next/headers", () => ({ headers: async () => new Headers() }));
const { resolveCourseAccess } = await import("@/lib/student/course-access");
const { canAccessQuizSnapshots } = await import("@/lib/quiz/question-scope");
const { GET: getAttempt, POST: submitAttempt } = await import("@/app/api/quiz/attempts/[id]/route");
const { GET: listAttempts, POST: startAttempt } = await import("@/app/api/quiz/attempts/route");
afterAll(() => client.close());

test("expired preview authorizes every stored question at the detail and list boundaries", async () => {
  await testDb.insert(schema.user).values(["student", "other", "suspended"].map((id) => ({ id: `snapshot-${id}`, name: id, email: `snapshot-${id}@test.local`, role: "student" as const })));
  await testDb.insert(schema.pengguna).values([{ id: "snapshot-student" }, { id: "snapshot-other" }, { id: "snapshot-suspended", status: "suspended" }]);
  await testDb.insert(schema.courses).values([{ id: "snapshot-course", title: "Course", category: "Fisika" }, { id: "snapshot-foreign", title: "Other", category: "Fisika" }]);
  await testDb.insert(schema.mataKuliah).values([
    { id: "snapshot-canonical", code: "SNAP", title: "Course", legacyCourseId: "snapshot-course", pricingCategory: "limited_time_free", freeStartsAt: new Date("2020-01-01Z"), freeEndsAt: new Date("2020-01-02Z") },
    { id: "snapshot-other-course", code: "OTHER", title: "Other", legacyCourseId: "snapshot-foreign" },
  ]);
  await testDb.insert(schema.chapters).values({ id: "snapshot-old-first", courseId: "snapshot-course", title: "First", orderIndex: 1, status: "published" });
  await testDb.insert(schema.bab).values([
    { id: "snapshot-first", mataKuliahId: "snapshot-canonical", code: "1", title: "First", orderIndex: 1, legacyChapterId: "snapshot-old-first" },
    { id: "snapshot-later", mataKuliahId: "snapshot-canonical", code: "2", title: "Later", orderIndex: 2 },
    { id: "snapshot-archived", mataKuliahId: "snapshot-canonical", code: "3", title: "Archived", orderIndex: 3, status: "archived" },
    { id: "snapshot-foreign-bab", mataKuliahId: "snapshot-other-course", code: "1", title: "Other", orderIndex: 1 },
  ]);
  for (const [id, course, chapter] of [["first", "snapshot-canonical", "snapshot-first"], ["later", "snapshot-canonical", "snapshot-later"], ["archived", "snapshot-canonical", "snapshot-archived"], ["foreign", "snapshot-other-course", "snapshot-foreign-bab"]]) {
    await testDb.insert(schema.soal).values({ id: `question-${id}`, mataKuliahId: course, babId: chapter, status: "published", creatorId: "snapshot-student", questionType: "multiple_choice", prompt: id, difficulty: "easy", cognitiveLevel: "apply", reasoningPattern: "test", generationHash: id });
    await testDb.insert(schema.aiQuestionBank).values({ id: `question-${id}`, courseId: id === "foreign" ? "snapshot-foreign" : "snapshot-course", prompt: id, options: ["A", "B"], correctIndices: [0], explanation: "secret answer", reviewStatus: "published" });
  }
  await testDb.insert(schema.aiQuestionBank).values({ id: "question-unscoped", courseId: "snapshot-course", prompt: "No scope", options: ["A"], correctIndices: [0], explanation: "secret", reviewStatus: "published" });
  await client.exec(`
    INSERT INTO master_teaching_documents (id,course_id,title,markdown_content,created_by_id) VALUES ('snapshot-mtd','snapshot-course','Source','body','snapshot-student');
    INSERT INTO concepts (id,canonical_slug) VALUES ('snapshot-concept','snapshot-concept');
    INSERT INTO knowledge_objects (id,course_id,mtd_id,chapter_id,concept_id,learning_order,title,concept_name,content,type,bloom_level,tags,metadata) VALUES ('snapshot-ko','snapshot-course','snapshot-mtd','snapshot-old-first','snapshot-concept',1,'First','First','body','definition','understand','[]','{}');
  `);
  await testDb.insert(schema.aiQuestionBank).values({ id: "question-legacy", courseId: "snapshot-course", knowledgeObjectId: "snapshot-ko", prompt: "Legacy", options: ["A"], correctIndices: [0], explanation: "secret", reviewStatus: "published" });
  await testDb.insert(schema.quizTemplates).values({ id: "snapshot-quiz", courseId: "snapshot-course", title: "Quiz", category: "chapter", visibility: "free", status: "published", selectionRules: {} });
  const question = (id: string) => ({ id: `question-${id}`, prompt: id === "later" ? "LATER SECRET PROMPT" : "Preview prompt", options: ["SECRET OPTION", "B"], correct_indices: [0], explanation: "SECRET ANSWER" });
  await testDb.insert(schema.studentQuizAttempts).values([
    { id: "snapshot-mixed", studentId: "snapshot-student", templateId: "snapshot-quiz", questionsSnapshot: [question("first"), question("later")], status: "completed" },
    { id: "snapshot-mixed-active", studentId: "snapshot-student", templateId: "snapshot-quiz", questionsSnapshot: [question("first"), question("later")], status: "in_progress" },
    { id: "snapshot-later-only", studentId: "snapshot-student", templateId: "snapshot-quiz", questionsSnapshot: [question("later")], status: "completed" },
    { id: "snapshot-preview", studentId: "snapshot-student", templateId: "snapshot-quiz", questionsSnapshot: [question("first")], status: "in_progress" },
    { id: "snapshot-suspended-attempt", studentId: "snapshot-suspended", templateId: "snapshot-quiz", questionsSnapshot: [question("first")], status: "in_progress" },
  ]);
  const during = await resolveCourseAccess({ courseId: "snapshot-course", userId: "snapshot-student", now: new Date("2020-01-01T12:00:00Z") }, testDb);
  expect(await canAccessQuizSnapshots(during, [[question("first"), question("later")]], testDb)).toEqual([true]);
  await testDb.update(schema.quizTemplates).set({ selectionRules: { chapterId: "snapshot-old-first" } }).where(eq(schema.quizTemplates.id, "snapshot-quiz"));
  const access = await resolveCourseAccess({ courseId: "snapshot-canonical", userId: "snapshot-student" }, testDb);
  expect(access.hasFullContentAccess).toBe(false);
  expect(await canAccessQuizSnapshots(access, [[question("first")], [question("legacy")], [question("first"), question("later")], [question("archived")], [question("foreign")], [question("unscoped")], [{ id: "missing", chapterId: "snapshot-first" }], []], testDb)).toEqual([true, true, false, false, false, false, false, false]);
  const alias = await resolveCourseAccess({ courseId: "snapshot-course", userId: "snapshot-student" }, testDb);
  expect(await canAccessQuizSnapshots(alias, [[question("first")], [question("later")]], testDb)).toEqual([true, false]);
  session = { user: { id: "snapshot-student", role: "student" } };
  const request = new NextRequest("http://localhost/api/quiz/attempts");
  const denied = await getAttempt(request, { params: Promise.resolve({ id: "snapshot-mixed" }) });
  expect(denied.status).toBe(403);
  const deniedBody = await denied.text();
  expect(deniedBody).not.toContain("SECRET");
  expect((await getAttempt(request, { params: Promise.resolve({ id: "snapshot-later-only" }) })).status).toBe(403);
  const submit = new NextRequest("http://localhost/api/quiz/attempts/snapshot-mixed-active", { method: "POST", body: JSON.stringify({ answers: {} }), headers: { "Content-Type": "application/json" } });
  expect((await submitAttempt(submit, { params: Promise.resolve({ id: "snapshot-mixed-active" }) })).status).toBe(403);
  expect((await testDb.select().from(schema.studentQuizAttempts).where(eq(schema.studentQuizAttempts.id, "snapshot-mixed-active")))[0].status).toBe("in_progress");
  const preview = await getAttempt(request, { params: Promise.resolve({ id: "snapshot-preview" }) });
  expect(preview.status).toBe(200);
  const previewBody = await preview.text();
  expect(previewBody).toContain("Preview prompt");
  expect(previewBody).not.toContain("SECRET ANSWER");
  const list = await listAttempts(request);
  expect(list.status).toBe(200);
  const listBody = await list.text();
  expect(listBody).toContain("snapshot-preview");
  expect(listBody).not.toContain("snapshot-mixed");
  expect(listBody).not.toContain("snapshot-later-only");
  expect(listBody).not.toContain("LATER SECRET PROMPT");
  session = { user: { id: "snapshot-other", role: "student" } };
  expect((await getAttempt(request, { params: Promise.resolve({ id: "snapshot-mixed" }) })).status).toBe(404);
  session = { user: { id: "snapshot-suspended", role: "student" } };
  expect((await getAttempt(request, { params: Promise.resolve({ id: "snapshot-suspended-attempt" }) })).status).toBe(403);
  expect((await canAccessQuizSnapshots(await resolveCourseAccess({ courseId: "snapshot-course", userId: "snapshot-suspended" }, testDb), [[question("first")]], testDb))).toEqual([false]);
  session = null;
  expect((await getAttempt(request, { params: Promise.resolve({ id: "snapshot-mixed" }) })).status).toBe(401);
  await testDb.insert(schema.pendaftaranMurid).values({ id: "snapshot-paid", penggunaId: "snapshot-student", mataKuliahId: "snapshot-canonical", status: "active" });
  session = { user: { id: "snapshot-student", role: "student" } };
  expect((await getAttempt(request, { params: Promise.resolve({ id: "snapshot-mixed" }) })).status).toBe(200);
  await testDb.update(schema.quizTemplates).set({ selectionRules: { count: 1, chapterIds: [], fixedQuestionIds: ["question-later"], tags: [] } }).where(eq(schema.quizTemplates.id, "snapshot-quiz"));
  const start = () => startAttempt(new NextRequest("http://localhost/api/quiz/attempts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ courseId: "snapshot-canonical", templateId: "snapshot-quiz" }) }));
  expect((await start()).status).toBe(201);
  await testDb.delete(schema.pendaftaranMurid).where(eq(schema.pendaftaranMurid.id, "snapshot-paid"));
  expect((await start()).status).toBe(403);
  await testDb.update(schema.mataKuliah).set({ pricingCategory: "free", freeStartsAt: null, freeEndsAt: null }).where(eq(schema.mataKuliah.id, "snapshot-canonical"));
  const freeStart = await start();
  expect(freeStart.status).toBe(201);
  const freeStartBody = await freeStart.json();
  expect(freeStartBody.questions.map((question: { id: string }) => question.id)).toEqual(["question-later"]);
  expect(JSON.stringify(freeStartBody)).not.toContain("secret answer");
  await testDb.update(schema.quizTemplates).set({ status: "draft" }).where(eq(schema.quizTemplates.id, "snapshot-quiz"));
  expect((await getAttempt(request, { params: Promise.resolve({ id: "snapshot-mixed" }) })).status).toBe(403);
});
