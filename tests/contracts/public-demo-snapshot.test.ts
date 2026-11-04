import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { hasChapterScopeWithin, selectFreeChapters } from "@/lib/student/course-access";
import { matchesDemoQuizScope, publicDemoSnapshotSchema, selectPublicDemoSnapshots, selectPublicDemoSnapshot } from "@/lib/demo/snapshot";

const valid = {
  version: 2, contentPolicy: "free-first-chapter", courseId: "course", revision: "r1", displayName: "Siswa Demo", asOf: "2026-02-28", streakDays: 2,
  course: { completedMaterials: 1, totalMaterials: 2, nextConcept: null },
  inProgressDocuments: [{ id: "d", title: "Dokumen", completionPercent: 50 }],
  flashcards: { dueCount: 1, recentReviews: [{ id: "f", front: "Konsep", grade: 3, reviewedOn: "2026-02-27" }] },
  weakConcepts: [{ id: "w", title: "Konsep", masteryPercent: 20 }],
  availableAssessments: [{ id: "q", title: "Kuis", type: "quiz" }],
  history: [{ date: "2026-02-28", materialsCompleted: 1, flashcardsReviewed: 2, quizzesCompleted: 0 }],
};

describe("public demo snapshot", () => {
  test("accepts a complete public snapshot", () => expect(publicDemoSnapshotSchema.safeParse(valid).success).toBe(true));
  test("rejects private fields, invalid dates, duplicates, totals and missing revision", () => {
    const cases = [
      { ...valid, version: 1 },
      { ...valid, contentPolicy: "other" },
      { ...valid, mockChapters: [{ id: "x", title: "Bab", orderIndex: 2, completionPercent: 0, url: "private" }] },
      { ...valid, email: "private" },
      { ...valid, course: { ...valid.course, private: true } },
      { ...valid, asOf: "2026-02-29" },
      { ...valid, revision: "" },
      { ...valid, course: { ...valid.course, completedMaterials: 3 } },
      { ...valid, history: [...valid.history, valid.history[0]] },
      { ...valid, history: [{ ...valid.history[0], date: "2026-03-01" }] },
      { ...valid, weakConcepts: [{ ...valid.weakConcepts[0], masteryPercent: 101 }] },
    ];
    for (const value of cases) expect(publicDemoSnapshotSchema.safeParse(value).success).toBe(false);
  });
  test("allowlist validates and isolates multiple courses", () => {
    const rows = ["a", "b", "c", "d"].map((courseId) => ({ courseId, snapshot: { ...valid, courseId } }));
    const snapshots = selectPublicDemoSnapshots([...rows, { courseId: "other", snapshot: valid }]);
    expect(snapshots.map((snapshot) => snapshot.courseId)).toEqual(["a", "b", "c", "d"]);
    expect(selectPublicDemoSnapshot(snapshots, "c")?.courseId).toBe("c");
    expect(selectPublicDemoSnapshot(snapshots, "other")).toBeNull();
    expect(selectPublicDemoSnapshot(snapshots)).toBeNull();
  });
  test("first chapter gate denies null, mixed, and later scopes", () => {
    const candidates = [2, 1].map((n) => ({ id: `b${n}`, canonicalId: `b${n}`, legacyId: null, title: `Bab ${n}`, orderIndex: n, source: "canonical" as const }));
    const first = selectFreeChapters(candidates)[0];
    expect(first.id).toBe("b1");
    expect(hasChapterScopeWithin(["b1"], [first.id])).toBe(true);
    expect(hasChapterScopeWithin(["b1", "b2"], [first.id])).toBe(false);
    expect(hasChapterScopeWithin([null], [first.id])).toBe(false);
    expect(hasChapterScopeWithin(["b2"], [first.id])).toBe(false);
  });
  test("quiz scope rejects another course even with identical questions", () => {
    const payload = { courseId: "a", contentPolicy: "free-first-chapter", contentRevision: "r1", questionIds: ["q"], questionVersions: [1] };
    expect(matchesDemoQuizScope(payload, { ...payload })).toBe(true);
    expect(matchesDemoQuizScope(payload, { ...payload, courseId: "b" })).toBe(false);
    expect(matchesDemoQuizScope(payload, { ...payload, contentRevision: "r2" })).toBe(false);
  });
  test("repository and endpoint enforce allowlist boundaries", () => {
    const resolver = readFileSync("app/(marketing)/demo/demo-data.ts", "utf8");
    const repository = readFileSync("lib/demo/snapshot-repository.ts", "utf8");
    const endpoint = readFileSync("app/api/demo/quiz/route.ts", "utf8");
    expect(repository).toContain('import "server-only"');
    expect(repository).toContain(".from(publicDemoSnapshots)");
    expect(resolver).toContain("resolvePublicFreeFirstChapter");
    const legacy = readFileSync("lib/demo/legacy-eligibility.ts", "utf8");
    expect(legacy).toContain("selectFreeChapters(");
    expect(legacy).toContain("hasChapterScopeWithin(");
    expect(legacy).toContain("eq(soal.babId, chapter.id)");
    expect(endpoint).toContain("getDemoQuizSet(courseId, quizOffset)");
    expect(endpoint).toContain("courseId: quizSet.courseId");
  });
  test("product selection and quiz pages retain first chapter scope", () => {
    const resolver = readFileSync("lib/demo/legacy-eligibility.ts", "utf8");
    const publicResolver = resolver.slice(resolver.indexOf("export async function resolvePublicFreeFirstChapter"));
    expect(publicResolver).toContain("eq(artikel.babId, first.id)");
    expect(publicResolver).toContain("eq(diktatMateri.babId, first.id)");
    expect(publicResolver).toContain("eq(setFlashcard.babId, first.id)");
    expect(publicResolver).toContain("resolveArticle(course, first, articleId, true)");
    expect(publicResolver).toContain("resolveDiktat(course, first, diktatId, true)");
    expect(publicResolver).toContain("if (!match) return null");
    expect(publicResolver).toContain("COLLECTION_PAGE_SIZE + 1");
    const quiz = resolver.slice(resolver.indexOf("async function resolvePublicQuiz"), resolver.indexOf("export async function resolvePublicFreeFirstChapter"));
    expect(quiz).toContain("eq(soal.babId, chapter.id)");
    expect(quiz).toContain("offset >= total");
    expect(quiz).toContain("offset + QUIZ_PAGE_SIZE < total");
    const endpoint = readFileSync("app/api/demo/quiz/route.ts", "utf8");
    expect(endpoint).toContain("getDemoQuizSet(courseId, quizOffset)");
    expect(endpoint).toContain("rawAnswers.length !== quizSet.questions.length");
  });

});

describe("public demo sanitizer integration", () => {
  test("sanitizes eligible content and private feedback before either public path returns it", () => {
    const data = readFileSync("app/(marketing)/demo/demo-data.ts", "utf8");
    const load = data.slice(data.indexOf("async function loadPieces"), data.indexOf("async function makeExperience"));
    expect(load.indexOf("resolvePublicFreeFirstChapter")).toBeLessThan(load.indexOf("sanitizeDemoArticle(pieces.article)"));
    expect(load).toContain("sanitizeDemoMarkdown(section.content)");
    expect(load).toContain("sanitizeDemoMarkdown(card.front)");
    expect(load).toContain("sanitizeDemoMarkdown(card.back)");
    expect(load).toContain("sanitizeDemoMarkdown(question.prompt)");
    expect(load).toContain("question.options.map(sanitizeDemoMarkdown)");
    expect(load).toContain("sanitizeDemoMarkdown(question.explanation)");
    expect(load).toContain("cleanItems(pieces.collections.articles)");
    expect(load).toContain("cleanItems(pieces.collections.diktats)");
    expect(load).toContain("cleanItems(pieces.collections.flashcardSets)");
    expect(load).toContain("catch { return null; }");
    expect(data).toContain("loadPieces(row, { quizOffset: offset })");
    const legacy = readFileSync("lib/demo/legacy-eligibility.ts", "utf8");
    const publicResolver = legacy.slice(legacy.indexOf("export async function resolvePublicFreeFirstChapter"));
    expect(publicResolver).not.toContain("JSON.stringify({ article");
    expect(publicResolver).toContain("resolveArticle(course, first, articleId, true)");
    expect(legacy).toContain("visuals: publicVisuals ? shared.articleVisuals : []");
  });
});
