import { afterAll, beforeAll, expect, mock, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { fictionalDemoSnapshot } from "@/lib/demo/fictional-snapshot";
import { createPostgresTestDb } from "../helpers/postgres";

mock.module("server-only", () => ({}));
let fixture: Awaited<ReturnType<typeof createPostgresTestDb>>;
mock.module("@/lib/db", () => ({ get db() { return fixture.testDb; } }));
mock.module("@/db", () => ({ get db() { return fixture.testDb; } }));
let getDemoSummaries: typeof import("@/lib/demo/summary-repository").getDemoSummaries;
let getDemoExperience: typeof import("@/app/(marketing)/demo/demo-data").getDemoExperience;
let getDemoQuizSet: typeof import("@/app/(marketing)/demo/demo-data").getDemoQuizSet;
let verifyDemoQuestionSetToken: typeof import("@/app/(marketing)/demo/demo-data").verifyDemoQuestionSetToken;

beforeAll(async () => {
  fixture = await createPostgresTestDb();
  ({ getDemoSummaries } = await import("@/lib/demo/summary-repository"));
  ({ getDemoExperience, getDemoQuizSet, verifyDemoQuestionSetToken } = await import("@/app/(marketing)/demo/demo-data"));
  process.env.BETTER_AUTH_SECRET = "scoped-demo-test-secret-only";
  const db = fixture.testDb;
  await db.insert(s.user).values({ id: "author", name: "Author", email: "demo-scoped@example.test" });
  await db.insert(s.pengguna).values({ id: "author" });
  const titles = ["Matematika I", "Fisika Dasar I", "Kimia Dasar I", "Berpikir Komputasional"];
  await db.insert(s.courses).values(titles.map((title, i) => ({ id: `legacy-${i}`, title, category: "Matematika" as const })));
  await db.insert(s.mataKuliah).values(titles.map((title, i) => ({ id: `course-${i}`, code: `C${i}`, title, legacyCourseId: `legacy-${i}` })));
  await db.insert(s.publicDemoSnapshots).values(titles.map((_, i) => ({ id: `snapshot-${i}`, courseId: `course-${i}`, snapshot: fictionalDemoSnapshot(`course-${i}`) })));
  await db.insert(s.bab).values(titles.flatMap((_, i) => [1, 2].map(n => ({ id: `chapter-${i}-${n}`, mataKuliahId: `course-${i}`, code: `B${n}`, title: `Chapter ${n}`, orderIndex: n }))));
  const common = { mataKuliahId: "course-0", creatorId: "author", sourceHash: "fixture", generationHash: "fixture", status: "published" as const };
  await db.insert(s.artikel).values([
    { ...common, id: "article", babId: "chapter-0-1", slug: "article", title: "Free article", structureStatus: "structured", contentMarkdown: "PRIVATE SOURCE" },
    { ...common, id: "later", babId: "chapter-0-2", slug: "later", title: "Later", structureStatus: "structured", contentMarkdown: "PRIVATE LATER" },
  ]);
  await db.insert(s.bagianArtikel).values({ id: "section", artikelId: "article", sectionKey: "intro", slug: "intro", sectionKind: "topic", title: "Intro", learningObjective: "Understand", orderIndex: 0, estimatedReadingMinutes: 1 });
  await db.insert(s.blokArtikel).values({ id: "block", artikelId: "article", bagianArtikelId: "section", blockKey: "intro", blockType: "text", orderIndex: 0, content: "ARTICLE BODY", generationHash: "fixture", status: "published" });
  await db.insert(s.diktatMateri).values({ ...common, id: "diktat", babId: "chapter-0-1", title: "Free diktat", contentMarkdown: "DIKTAT BODY", fileKey: "private/file.pdf" });
  await db.insert(s.setFlashcard).values({ ...common, id: "set", babId: "chapter-0-1", title: "Cards" });
  await db.insert(s.flashcard).values({ id: "card", setFlashcardId: "set", front: "CARD FRONT", back: "CARD BACK", status: "published", generationHash: "fixture" });
  await db.insert(s.soal).values(Array.from({ length: 4 }, (_, i) => ({ id: `q${i + 1}`, mataKuliahId: "course-0", babId: "chapter-0-1", questionType: "multiple_choice" as const, prompt: `Question ${i + 1}`, optionsSnapshot: [{ text: "Yes", isCorrect: true }, { text: "No" }], status: "published" as const, difficulty: "easy" as const, cognitiveLevel: "understand" as const, reasoningPattern: "fixture", generationHash: "fixture", creatorId: "author" })));
  await db.insert(s.blueprintAsesmen).values({ id: "blueprint", mataKuliahId: "course-0", title: "Quiz", assessmentType: "quiz", blueprint: {}, generationHash: "fixture", creatorId: "author" });
  await db.insert(s.asesmen).values({ id: "quiz", blueprintAsesmenId: "blueprint", mataKuliahId: "course-0", title: "Quiz", assessmentType: "quiz", status: "published", generationHash: "fixture", creatorId: "author" });
  await db.insert(s.cakupanAsesmen).values({ id: "coverage", asesmenId: "quiz", babId: "chapter-0-1", orderIndex: 0 });
  await db.insert(s.itemAsesmen).values(Array.from({ length: 4 }, (_, i) => ({ id: `item-${i}`, asesmenId: "quiz", soalId: `q${i + 1}`, orderIndex: i, renderedQuestionSnapshot: {}, optionOrderSnapshot: [], gradingPolicySnapshot: {}, contentVersion: 1, generationHash: "fixture" })));
  await db.insert(s.quizTemplates).values({ id: "quiz", courseId: "legacy-0", title: "Quiz", status: "published", visibility: "free", category: "chapter", selectionRules: { chapterIds: ["chapter-0-1"], fixedQuestionIds: ["q1", "q2", "q3", "q4"] } });
  await db.insert(s.pembahasanSoal).values({ id: "solution", soalId: "q1", content: "SOLUTION", version: 1, status: "published", creatorId: "author", generationHash: "fixture" });
}, 60_000);
afterAll(async () => { await fixture?.client.close(); });

test("four course summaries use batched metadata and omit bodies", async () => {
  const select = spyOn(fixture.testDb, "select");
  try {
    const summaries = await getDemoSummaries();
    expect(summaries).toHaveLength(4);
    expect(summaries.find((item) => item.snapshot.courseId === "course-0")?.content.article).toEqual({ id: "article", title: "Free article" });
    expect(select.mock.calls.length).toBeLessThanOrEqual(6);
    expect(JSON.stringify(summaries)).not.toMatch(/ARTICLE BODY|DIKTAT BODY|PRIVATE|CARD BACK|SOLUTION/);
  } finally { select.mockRestore(); }
});

test("view-specific loaders return only the requested body while default remains complete", async () => {
  const all = await getDemoExperience("course-0");
  const documents = await getDemoExperience("course-0", {}, "documents");
  const article = await getDemoExperience("course-0", {}, "article");
  const diktat = await getDemoExperience("course-0", {}, "diktat");
  const cards = await getDemoExperience("course-0", {}, "flashcards");
  expect(all?.content.article.sections[0].blocks[0].content).toBe("ARTICLE BODY");
  expect(all?.content.diktat.sections[0].content).toBe("DIKTAT BODY");
  expect(all?.content.flashcards[0].back).toBe("CARD BACK");
  expect(documents?.content.collections.articles.map((item) => item.id)).toEqual(["article"]);
  expect(JSON.stringify(documents)).not.toMatch(/ARTICLE BODY|DIKTAT BODY|CARD BACK|Question 1|SOLUTION/);
  expect(article?.content.article.sections[0].blocks[0].content).toBe("ARTICLE BODY");
  expect(JSON.stringify(article)).not.toMatch(/DIKTAT BODY|CARD BACK|Question 1|SOLUTION/);
  expect(diktat?.content.diktat.sections[0].content).toBe("DIKTAT BODY");
  expect(diktat?.content.article.chapterId).toBe("chapter-0-1");
  expect(JSON.stringify(diktat)).not.toMatch(/ARTICLE BODY|CARD BACK|Question 1|SOLUTION/);
  expect(cards?.content.flashcards[0].back).toBe("CARD BACK");
  expect(JSON.stringify(cards)).not.toMatch(/ARTICLE BODY|DIKTAT BODY|Question 1|SOLUTION/);
  for (const kind of ["metadata", "documents", "article", "diktat", "flashcards", "quiz"] as const) {
    expect(await getDemoExperience("course-0", { articleId: "later" }, kind)).toBeNull();
  }
});

test("collection and reader views do not select unrelated body or answer columns", async () => {
  const select = spyOn(fixture.testDb, "select");
  const distinct = spyOn(fixture.testDb, "selectDistinctOn");
  const selected = (column: unknown) => select.mock.calls.some(([fields]) => fields && Object.values(fields).some((field) => field === column));
  try {
    await getDemoExperience("course-0", {}, "documents");
    expect(selected(s.diktatMateri.contentMarkdown)).toBe(false);
    expect(selected(s.flashcard.back)).toBe(false);
    expect(selected(s.soal.optionsSnapshot)).toBe(false);
    expect(selected(s.pembahasanSoal.content)).toBe(false);
    select.mockClear();
    distinct.mockClear();
    await getDemoExperience("course-0", {}, "quiz");
    expect(distinct).not.toHaveBeenCalled();
    expect(selected(s.diktatMateri.contentMarkdown)).toBe(false);
    expect(selected(s.flashcard.back)).toBe(false);
    expect(selected(s.pembahasanSoal.content)).toBe(false);
    select.mockClear();
    await getDemoQuizSet("course-0");
    expect(selected(s.pembahasanSoal.content)).toBe(true);
    expect(selected(s.diktatMateri.contentMarkdown)).toBe(false);
  } finally { select.mockRestore(); distinct.mockRestore(); }
});

test("quiz pages redact solutions, bind revision and versions, and grading reads the solution", async () => {
  const first = await getDemoExperience("course-0", {}, "quiz");
  const second = await getDemoExperience("course-0", { quizOffset: 3 }, "quiz");
  expect(first?.content.quiz.map((question) => question.id)).toEqual(["q1", "q2", "q3"]);
  expect(second?.content.quiz.map((question) => question.id)).toEqual(["q4"]);
  expect(first?.content.collections.quiz.total).toBe(4);
  expect(JSON.stringify([first, second])).not.toMatch(/correctIndices|SOLUTION|ARTICLE BODY|DIKTAT BODY|CARD BACK/);
  const grading = await getDemoQuizSet("course-0");
  expect(grading?.questions[0]).toMatchObject({ id: "q1", correctIndices: [0], explanation: "SOLUTION" });
  const scope = { courseId: "course-0", contentPolicy: "free-first-chapter" as const, contentRevision: first!.snapshot.revision, questionIds: grading!.questions.map((q) => q.id), questionVersions: grading!.questions.map((q) => q.version) };
  expect(verifyDemoQuestionSetToken(first?.content.quizSetToken, scope)).toBe(true);
  expect(verifyDemoQuestionSetToken(first?.content.quizSetToken, { ...scope, contentRevision: "other-revision" })).toBe(false);
  expect(verifyDemoQuestionSetToken(first?.content.quizSetToken, { ...scope, questionVersions: [2, 1, 1] })).toBe(false);
  await fixture.testDb.update(s.soal).set({ version: 2 }).where(eq(s.soal.id, "q1"));
  expect((await getDemoQuizSet("course-0"))?.questions[0].id).toBe("fictional-course-0-question-1");
  await fixture.testDb.update(s.soal).set({ version: 1 }).where(eq(s.soal.id, "q1"));
  await fixture.testDb.update(s.quizTemplates).set({ visibility: "paid" }).where(eq(s.quizTemplates.id, "quiz"));
  expect((await getDemoQuizSet("course-0"))?.questions[0].id).toBe("fictional-course-0-question-1");
});

test("ambiguous chapter aliases fail closed for summaries and scoped reads", async () => {
  const db = fixture.testDb;
  await db.insert(s.chapters).values({ id: "legacy-chapter", courseId: "legacy-0", title: "Legacy", orderIndex: 1 });
  await db.update(s.bab).set({ legacyChapterId: "legacy-chapter" }).where(eq(s.bab.mataKuliahId, "course-0"));
  expect((await getDemoSummaries()).some((item) => item.snapshot.courseId === "course-0")).toBe(false);
  expect(await getDemoExperience("course-0", {}, "quiz")).toBeNull();
});

test("an active course alias colliding with an opted-in canonical ID fails closed", async () => {
  const db = fixture.testDb;
  await db.insert(s.courses).values({ id: "course-1", title: "Collision", category: "Matematika" });
  await db.insert(s.mataKuliah).values({ id: "collision", code: "COLLISION", title: "Collision", legacyCourseId: "course-1" });
  expect((await getDemoSummaries()).some((item) => item.snapshot.courseId === "course-1")).toBe(false);
  expect(await getDemoExperience("course-1", {}, "documents")).toBeNull();
});
