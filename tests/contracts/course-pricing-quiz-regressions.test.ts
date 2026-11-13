import { afterAll, expect, mock, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
mock.module("@/db", () => ({ db: testDb }));
const { validatedQuizScope, canAccessStudentQuizTemplate } = await import("@/lib/quiz/student-access");
const { freeQuizQuestionScope } = await import("@/lib/quiz/question-scope");
afterAll(() => client.close());

const policy = { hasCourseAccess: true, hasFullContentAccess: true, tier: "free", canonicalCourseId: "q-canonical", legacyCourseId: "q-course", scopedChapterIds: ["q-chapter", "q-legacy", "q-second"], freeChapterIds: ["q-chapter", "q-legacy"] } as any;
const template = { status: "published", category: "chapter", visibility: "free", selectionRules: {} } as const;

test("pricing quiz scope rejects malformed and conflicting representations", () => {
  for (const rules of ["{", "null", "[]", "5", null, [], 4, { chapterIds: [] }, { chapterIds: ["q-chapter", null] }, { chapterId: "q-chapter", chapterIds: ["q-chapter"] }, { fixedQuestionIds: ["x", null] }, { tags: "bad" }]) {
    expect(validatedQuizScope(rules)).toBeNull();
    expect(canAccessStudentQuizTemplate(policy, { ...template, selectionRules: rules } as any)).toBe(false);
  }
  expect(canAccessStudentQuizTemplate(policy, template as any)).toBe(true);
  expect(canAccessStudentQuizTemplate(policy, { ...template, selectionRules: { chapterId: "q-second" } } as any)).toBe(true);
  expect(canAccessStudentQuizTemplate(policy, { ...template, selectionRules: { chapterId: "foreign" } } as any)).toBe(false);
  expect(canAccessStudentQuizTemplate({ ...policy, hasFullContentAccess: false }, { ...template, selectionRules: { chapterId: "q-second" } } as any)).toBe(false);
  expect(canAccessStudentQuizTemplate({ ...policy, tier: "enrolled" }, template as any)).toBe(true);
});

test("canonical no-KO questions use the same chapter eligibility for fixed and dynamic selections", async () => {
  await testDb.insert(schema.courses).values([{ id: "q-course", title: "Course", category: "Fisika" }, { id: "q-foreign-course", title: "Foreign", category: "Fisika" }]);
  await testDb.insert(schema.mataKuliah).values([{ id: "q-canonical", code: "Q", title: "Course", legacyCourseId: "q-course" }, { id: "q-foreign", code: "F", title: "Foreign", legacyCourseId: "q-foreign-course" }]);
  await testDb.insert(schema.chapters).values({ id: "q-legacy", courseId: "q-course", title: "Chapter", orderIndex: 1, status: "published" });
  await testDb.insert(schema.bab).values([
    { id: "q-chapter", mataKuliahId: "q-canonical", code: "1", title: "One", orderIndex: 1, legacyChapterId: "q-legacy" },
    { id: "q-second", mataKuliahId: "q-canonical", code: "2", title: "Two", orderIndex: 2 },
    { id: "q-archived", mataKuliahId: "q-canonical", code: "3", title: "Archived", orderIndex: 3, status: "archived" },
    { id: "q-other", mataKuliahId: "q-foreign", code: "1", title: "Other", orderIndex: 1 },
  ]);
  await testDb.insert(schema.user).values({ id: "q-author", name: "Author", email: "q-author@test.local", role: "student" });
  await testDb.insert(schema.pengguna).values({ id: "q-author" });
  const rows = [["q-valid", "q-canonical", "q-chapter", "published"], ["q-later", "q-canonical", "q-second", "published"], ["q-hidden", "q-canonical", "q-archived", "published"], ["q-draft", "q-canonical", "q-chapter", "draft"], ["q-foreign-question", "q-foreign", "q-other", "published"]] as const;
  for (const [id, mataKuliahId, babId, status] of rows) {
    await testDb.insert(schema.soal).values({ id, mataKuliahId, babId, status, creatorId: "q-author", questionType: "multiple_choice", prompt: id, difficulty: "easy", cognitiveLevel: "apply", reasoningPattern: "test", generationHash: id });
    await testDb.insert(schema.aiQuestionBank).values({ id, courseId: "q-course", prompt: id, options: ["A", "B"], correctIndices: [0], explanation: "secret", reviewStatus: "published" });
  }
  const select = async (rules: unknown, access = policy, fixed?: string[]) => testDb.select({ id: schema.aiQuestionBank.id }).from(schema.aiQuestionBank).where(and(eq(schema.aiQuestionBank.courseId, "q-course"), eq(schema.aiQuestionBank.reviewStatus, "published"), await freeQuizQuestionScope(access, rules), fixed ? inArray(schema.aiQuestionBank.id, fixed) : undefined));
  expect((await select({}, policy, ["q-valid"])).map((row) => row.id)).toEqual(["q-valid"]);
  expect((await select({})).map((row) => row.id).sort()).toEqual(["q-later", "q-valid"]);
  expect((await select({ chapterId: "q-legacy" })).map((row) => row.id)).toEqual(["q-valid"]);
  expect((await select({ chapterId: "q-chapter" }, { ...policy, hasFullContentAccess: false })).map((row) => row.id)).toEqual(["q-valid"]);
});
