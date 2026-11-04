import { describe, expect, test } from "bun:test";
import type { PublicDemoSnapshot } from "@/lib/demo/snapshot";
import { demoChapterOutline } from "@/lib/demo/chapter-outline";
import { emptyOverlay } from "@/lib/demo/session-overlay";

describe("demo chapter outline", () => {
  test("links only the first chapter and renders later mock metadata without a destination", () => {
    const snapshot = { mockChapters: [
      { id: "later-b", title: "Mock B", orderIndex: 3, completionPercent: 100 },
      { id: "later-a", title: "Mock A", orderIndex: 2, completionPercent: 45 },
    ] } as PublicDemoSnapshot;
    const rows = demoChapterOutline({ snapshot, chapterTitle: "First", articleId: "first", overlay: emptyOverlay(), articleHref: "/id/demo/article?course=one", availableLabel: "Available", mockLabel: (percent) => `Sample ${percent}%` });
    expect(rows.map((row) => row.title)).toEqual(["First", "Mock A", "Mock B"]);
    expect(rows.map((row) => row.href)).toEqual(["/id/demo/article?course=one", undefined, undefined]);
    expect(rows[1].statusLabel).toBe("Sample 45%");
    expect(rows[2].completed).toBe(true);
  });
  test("only the corresponding local article completion marks chapter one complete", () => {
    const snapshot = {} as PublicDemoSnapshot;
    const base = { snapshot, chapterTitle: "First", articleId: "first", articleHref: "/demo/article", availableLabel: "Available", mockLabel: String };
    expect(demoChapterOutline({ ...base, overlay: { version: 1, events: [{ kind: "article", id: "demo-article-first", date: "2026-01-01" }] } })[0].completed).toBe(true);
    expect(demoChapterOutline({ ...base, overlay: emptyOverlay() })[0].completed).toBe(false);
  });
});

test("public content resolver passes only the selected first chapter to content loaders", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("lib/demo/legacy-eligibility.ts", "utf8");
  const resolver = source.slice(source.indexOf("export async function resolvePublicFreeFirstChapter"));
  expect(resolver).toContain("free[0]?.canonicalId");
  for (const loader of ["resolveArticle", "resolveDiktat", "resolveFlashcards", "resolveQuiz"]) {
    expect(resolver).toContain(`${loader}(course, first)`);
  }
  expect(resolver).not.toMatch(/mockChapters|resolve(?:Article|Diktat|Flashcards|Quiz)\(course,\s*(?:chapters|free)\[/);
});
