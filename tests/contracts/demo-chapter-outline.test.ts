import { describe, expect, test } from "bun:test";
import { demoChapterOutline } from "@/lib/demo/chapter-outline";
import { catalogueProgress, fictionalChapterPercent, fictionalMaterialCompleted, padDemoChapters } from "@/lib/demo/catalogue";
import { emptyOverlay } from "@/lib/demo/session-overlay";

describe("demo chapter outline", () => {
  test("shows real ordered chapters with varied fictional progress and links only the first", () => {
    const chapters = [1, 2, 3, 4].map(n => ({ id: `chapter-${n}`, title: `Bab ${n}`, orderIndex: n }));
    const materials = chapters.flatMap(chapter => Array.from({ length: 10 }, (_, index) => ({ id: `${chapter.id}-${index}`, title: `Materi ${index}`, chapterId: chapter.id, kind: "article" as const })));
    const rows = demoChapterOutline({ courseId: "course", catalogue: { chapters, materials }, articleId: "first", overlay: emptyOverlay(), articleHref: "/demo/article", progressLabel: String });
    expect(rows.map(row => row.title)).toEqual(chapters.map(chapter => chapter.title));
    expect(rows.map(row => row.href)).toEqual(["/demo/article", undefined, undefined, undefined]);
    expect(new Set(rows.map(row => row.completionPercent)).size).toBeGreaterThan(1);
    expect(rows[2].completionPercent).toBeGreaterThan(0);
  });
  test("a new real Berpikir chapter replaces padding without hiding real chapters", () => {
    const real = [1, 2].map(n => ({ id: `real-${n}`, title: `Bab ${n}`, orderIndex: n }));
    expect(padDemoChapters("Berpikir Komputasional", real)).toHaveLength(5);
    expect(padDemoChapters("Berpikir Komputasional", [...real, { id: "real-3", title: "Bab 3", orderIndex: 3 }]).map(row => row.id).slice(0, 3)).toEqual(["real-1", "real-2", "real-3"]);
    const seven = Array.from({ length: 7 }, (_, index) => ({ id: `real-${index}`, title: `Bab ${index + 1}`, orderIndex: index + 1 }));
    expect(padDemoChapters("Berpikir Komputasional", seven)).toEqual(seven);
    expect(padDemoChapters("Matematika I", real)).toEqual(real);
    expect(fictionalChapterPercent("course", 3)).toBeLessThanOrEqual(fictionalChapterPercent("course", 2));
  });
  test("local completion updates only the first chapter", () => {
    const chapters = [1, 2].map(n => ({ id: `chapter-${n}`, title: `Bab ${n}`, orderIndex: n }));
    const rows = demoChapterOutline({ courseId: "course", catalogue: { chapters, materials: [{ id: "first", title: "First", chapterId: "chapter-1", kind: "article" }] }, articleId: "first", overlay: { version: 1, events: [{ kind: "article", id: "demo-article-first", date: "2026-01-01" }] }, articleHref: "/demo/article", progressLabel: String });
    expect(rows[0].completionPercent).toBe(100);
    expect(rows[1].completionPercent).toBe(0);
  });
  test("chapter percentages and course totals use the same fictional material outcomes", () => {
    const chapters = [1, 2, 3].map(n => ({ id: `chapter-${n}`, title: `Bab ${n}`, orderIndex: n }));
    const materials = chapters.flatMap(chapter => Array.from({ length: 10 }, (_, index) => ({ id: `${chapter.id}-${index}`, title: `Materi ${index}`, chapterId: chapter.id, kind: "article" as const })));
    const catalogue = { chapters, materials };
    const totals = catalogueProgress("course", catalogue);
    const rows = demoChapterOutline({ courseId: "course", catalogue, articleId: "chapter-1-0", overlay: emptyOverlay(), articleHref: "/demo/article", progressLabel: String });
    expect(totals.total).toBe(30);
    expect(totals.completed).toBe(materials.filter(item => fictionalMaterialCompleted("course", item, chapters.findIndex(chapter => chapter.id === item.chapterId))).length);
    expect(rows.reduce((sum, row) => sum + row.completionPercent / 10, 0)).toBe(totals.completed);
  });
});

test("public content resolver passes only the selected first chapter to content loaders", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("lib/demo/legacy-eligibility.ts", "utf8");
  const resolver = source.slice(source.indexOf("export async function resolvePublicFreeFirstChapter"));
  expect(resolver).toContain("free[0]?.canonicalId");
  for (const loader of ["resolveArticle", "resolveDiktat", "resolveFlashcards", "resolvePublicQuiz"]) expect(resolver).toContain(`${loader}(course, first,`);
  expect(resolver).not.toMatch(/mockChapters|resolve(?:Article|Diktat|Flashcards|Quiz)\(course,\s*(?:chapters|free)\[/);
});
