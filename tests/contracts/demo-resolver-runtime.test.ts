import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { fictionalDemoSnapshot } from "@/lib/demo/fictional-snapshot";
import { createPostgresTestDb } from "../helpers/postgres";

mock.module("server-only", () => ({}));
let fixture: Awaited<ReturnType<typeof createPostgresTestDb>>;
mock.module("@/lib/db", () => ({ get db() { return fixture.testDb; } }));
mock.module("@/db", () => ({ get db() { return fixture.testDb; } }));
let getDemoExperience: typeof import("@/app/(marketing)/demo/demo-data").getDemoExperience;
let POST: typeof import("@/app/api/demo/quiz/route").POST;
let resolvePublicFreeFirstChapter: typeof import("@/lib/demo/legacy-eligibility").resolvePublicFreeFirstChapter;

beforeAll(async () => {
  fixture = await createPostgresTestDb();
  ({ resolvePublicFreeFirstChapter } = await import("@/lib/demo/legacy-eligibility"));
  ({ getDemoExperience } = await import("@/app/(marketing)/demo/demo-data"));
  ({ POST } = await import("@/app/api/demo/quiz/route"));
  process.env.BETTER_AUTH_SECRET = "fictional-runtime-test-secret-only";
  const db = fixture.testDb;
  await db.insert(s.user).values({ id: "author", name: "Fictional author", email: "fictional@example.test" });
  await db.insert(s.pengguna).values({ id: "author" });
  await db.insert(s.courses).values({ id: "legacy", title: "Matematika I", category: "Matematika" });
  await db.insert(s.mataKuliah).values({ id: "course", code: "M", title: "Matematika I", legacyCourseId: "legacy" });
  await db.insert(s.courseMaterials).values({ id: "generic-pdf", courseId: "legacy", title: "Private generic PDF", type: "materi", chapterIds: ["chapter-1"], fileUrl: "paid/generic.pdf" });
  await db.insert(s.publicDemoSnapshots).values({ id: "snapshot", courseId: "course", snapshot: fictionalDemoSnapshot("course") });
  await db.insert(s.bab).values([1, 2].map(n => ({ id: `chapter-${n}`, mataKuliahId: "course", code: `B${n}`, title: `Bab ${n}`, orderIndex: n })));
  const common = { mataKuliahId: "course", creatorId: "author", sourceHash: "fixture", generationHash: "fixture", status: "published" as const };
  await db.insert(s.artikel).values({ ...common, id: "article", babId: "chapter-1", slug: "article", title: "Real Free article", structureStatus: "structured", contentMarkdown: "" });
  await db.insert(s.bagianArtikel).values({ id: "section", artikelId: "article", sectionKey: "intro", slug: "intro", sectionKind: "topic", title: "Intro", learningObjective: "Understand", orderIndex: 0, estimatedReadingMinutes: 1 });
  await db.insert(s.blokArtikel).values({ id: "block", artikelId: "article", bagianArtikelId: "section", blockKey: "intro", blockType: "text", orderIndex: 0, content: "Free body", generationHash: "fixture", status: "published" });
  for (const n of [1, 2]) {
    await db.insert(s.diktatMateri).values({ ...common, id: `diktat-${n}`, babId: `chapter-${n}`, title: `Diktat ${n}`, contentMarkdown: n === 1 ? "Free summary" : "PRIVATE LATER BODY", fileKey: "paid/private.pdf" });
    await db.insert(s.setFlashcard).values({ ...common, id: `set-${n}`, babId: `chapter-${n}`, title: `Set ${n}` });
    await db.insert(s.flashcard).values({ id: `card-${n}`, setFlashcardId: `set-${n}`, front: `Front ${n}`, back: `Back ${n}`, status: "published", generationHash: "fixture" });
  }
  await db.insert(s.soal).values([1, 2, 3, 4].map(n => ({ id: `q${n}`, mataKuliahId: "course", babId: n === 4 ? "chapter-2" : "chapter-1", questionType: "multiple_choice" as const, prompt: `Question ${n}`, optionsSnapshot: [{ text: "A", isCorrect: true }, { text: "B" }], status: "published" as const, difficulty: "easy" as const, cognitiveLevel: "understand" as const, reasoningPattern: "fixture", generationHash: "fixture", creatorId: "author" })));
  await db.insert(s.blueprintAsesmen).values({ id: "blueprint", mataKuliahId: "course", title: "Quiz", assessmentType: "quiz", blueprint: {}, generationHash: "fixture", creatorId: "author" });
  await db.insert(s.asesmen).values({ id: "quiz", blueprintAsesmenId: "blueprint", mataKuliahId: "course", title: "Quiz", assessmentType: "quiz", status: "published", generationHash: "fixture", creatorId: "author" });
  await db.insert(s.cakupanAsesmen).values({ id: "coverage", asesmenId: "quiz", babId: "chapter-1", orderIndex: 0 });
  await db.insert(s.itemAsesmen).values([1, 2, 3].map(n => ({ id: `item${n}`, asesmenId: "quiz", soalId: `q${n}`, orderIndex: n, renderedQuestionSnapshot: {}, optionOrderSnapshot: [], gradingPolicySnapshot: {}, contentVersion: 1, generationHash: "fixture" })));
  await db.insert(s.quizTemplates).values({ id: "quiz", courseId: "legacy", title: "Quiz", status: "published", visibility: "free", category: "chapter", selectionRules: { chapterIds: ["chapter-1"], fixedQuestionIds: ["q1", "q2", "q3"] } });
}, 60_000);
afterAll(async () => { await fixture?.client.close(); });

test("reads actual Free products, excludes later chapters and storage keys", async () => {
  const result = await resolvePublicFreeFirstChapter("course");
  expect(result?.article.id).toBe("article");
  expect(result?.collections.diktats.map(x => x.id)).toEqual(["diktat-1"]);
  expect(result?.collections.flashcardSets.map(x => x.id)).toEqual(["set-1"]);
  expect(result?.quiz.map(x => x.id)).toEqual(["q1", "q2", "q3"]);
  expect(JSON.stringify(result)).not.toContain("PRIVATE LATER BODY");
  expect(JSON.stringify(result)).not.toContain("paid/private.pdf");
  expect(JSON.stringify(result)).not.toMatch(/generic-pdf|paid\/generic.pdf|Private generic PDF/);
  for (const selection of [{ articleId: "foreign" }, { diktatId: "diktat-2" }, { flashcardSetId: "set-2" }, { quizOffset: 3 }, { flashcardOffset: 100 }]) {
    expect(await resolvePublicFreeFirstChapter("course", selection)).toBeNull();
  }
});

test("initial public payload redacts answers and grading enforces the issued scope without writes", async () => {
  const experience = await getDemoExperience("course");
  expect(experience).not.toBeNull();
  expect(JSON.stringify(experience)).not.toMatch(/correctIndices|isCorrect|gradingPolicy|optionsSnapshot|fileKey/);
  const body = { courseId: "course", questionIds: experience!.content.quiz.map(q => q.id), questionSetToken: experience!.content.quizSetToken, answers: [[0], [0], [0]] };
  const submit = (value: unknown) => POST(new Request("http://localhost/api/demo/quiz", { method: "POST", body: JSON.stringify(value) }));
  const response = await submit(body);
  expect(response.status).toBe(200);
  const graded = await response.json();
  expect(graded.score).toBe(3);
  expect(graded.results.map((item: { correctIndices: number[] }) => item.correctIndices)).toEqual([[0], [0], [0]]);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  for (const invalid of [[[0, 0], [0], [0]], [[], [0], [0]], [[2], [0], [0]], [["0"], [0], [0]]]) expect((await submit({ ...body, answers: invalid })).status).toBe(400);
  expect((await submit({ ...body, questionIds: ["q1", "q2", "q4"] })).status).toBe(409);
  expect((await submit({ ...body, questionSetToken: `${body.questionSetToken}tampered` })).status).toBe(409);
  expect((await submit({ ...body, courseId: "foreign" })).status).not.toBe(200);
  expect(await fixture.testDb.select().from(s.studentQuizAttempts)).toHaveLength(0);
});

test("unavailable real quiz uses only authored fictional questions, never a paid question", async () => {
  await fixture.testDb.update(s.quizTemplates).set({ visibility: "paid" }).where(eq(s.quizTemplates.id, "quiz"));
  const result = await resolvePublicFreeFirstChapter("course");
  expect(result?.article.id).toBe("article");
  expect(result?.quiz.map(x => x.id)).toEqual([1, 2, 3].map(n => `fictional-course-question-${n}`));
  expect(result?.quiz.some(x => x.id === "q1" || x.id === "q4")).toBe(false);
});

test("ambiguous legacy chapter scope fails closed before any fallback", async () => {
  await fixture.testDb.insert(s.chapters).values({ id: "legacy-chapter", courseId: "legacy", title: "Legacy", orderIndex: 1 });
  await fixture.testDb.update(s.bab).set({ legacyChapterId: "legacy-chapter" }).where(eq(s.bab.mataKuliahId, "course"));
  expect(await resolvePublicFreeFirstChapter("course")).toBeNull();
});
