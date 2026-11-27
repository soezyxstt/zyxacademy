import { expect, test } from "bun:test";
import { bindPdfAnnotations, pdfOutline, pdfThumbnailPages } from "@/apps/mobile-native/features/student/courses/pdf-reader-model";
import { findReadingSections, readingNavigationItems } from "@/apps/mobile-native/features/student/courses/reading-search";
import type { OnlineReadingContent } from "@/apps/mobile-native/features/student/courses/online-reading";

test("PDF outline normalizes both mobile bookmarks and ignores invalid or external destinations", () => {
  const result = pdfOutline([
    { title: "Parent", pageIdx: 0, children: [{ title: "Part", pageIdx: "3", children: [] }] },
    { title: "Missing", pageIdx: 8 },
    { title: "External", url: "https://private.example", pageIdx: "-1" },
  ], 5);
  expect(result).toEqual([{ title: "Parent", page: 1, depth: 0 }, { title: "Part", page: 4, depth: 1 }]);
});

test("reader notes persist per origin, account, document and revision while current access remains required", () => {
  const values = new Map<string, string>();
  const store = { read: (key: string) => values.get(key) ?? null, write: (key: string, value: string) => { values.set(key, value); } };
  const scope = { origin: "https://academy.test", userId: "learner", courseId: "course", materialId: "lesson", revision: "a" };
  let active = true;
  const bind = (changes = {}) => bindPdfAnnotations(store, { ...scope, ...changes }, () => active, 3);
  expect(bind().toggle(2)?.bookmarks).toEqual([2]);
  expect(bind().note(2, "Paragraph to revisit")?.notes[2]).toBe("Paragraph to revisit");
  expect(bind().get()).toEqual({ bookmarks: [2], notes: { 2: "Paragraph to revisit" } });
  expect(bind().note(4, "Out of bounds")).toBeNull();
  for (const changes of [{ userId: "someone-else" }, { origin: "https://other.test" }, { materialId: "other" }, { revision: "b" }]) {
    expect(bind(changes).get()).toEqual({ bookmarks: [], notes: {} });
  }
  active = false;
  expect(bind().get().notes).toEqual({});
  expect(bind().note(2, "Denied")).toBeNull();
  active = true;
  expect(bind().note(2, "")?.notes).toEqual({});
  expect(bind().toggle(2)?.bookmarks).toEqual([]);
});

test("native reader search only uses authored title, body and public parts", () => {
  const content: OnlineReadingContent = {
    kind: "article", title: "Flux", structured: true, locale: "en", revision: "fixture", resolveImage: () => undefined,
    data: { id: "id", courseId: "course", chapterId: "chapter", title: "Flux", version: 1, sections: [
      { id: "s1", slug: "first", title: "Part one", blocks: [{
        id: "b1", content: "fallback", blockType: "text", formativeCheck: { answer: "private-answer" },
        parts: [
          { id: "p1", kind: "markdown", markdown: "Visible flux text <!-- hidden reference -->" },
          { id: "work", kind: "worked_example", title: "Calculation", problemMarkdown: "Calculate a quantity", verificationMarkdown: "Compare the result",
            steps: [{ id: "step", operationMarkdown: "Find the flux", reasonMarkdown: "Use this equation", sourceElementRefs: ["p1"], parts: [{ id: "leaf", kind: "markdown", markdown: "Another line" }] }] },
        ],
      }] },
      { id: "s2", slug: "second", title: "Gradient", blocks: [{ id: "b2", blockType: "text", content: "Second part" }] },
    ] },
  };
  const entries = readingNavigationItems(content);
  expect(findReadingSections(entries, " FLUX ")).toMatchObject([
    { id: "s1", slug: "first", snippet: "Visible flux text", target: { sectionId: "s1", blockId: "b1", partId: "p1" } },
  ]);
  expect(findReadingSections(entries, "Use this equation")).toMatchObject([
    { id: "s1", slug: "first", snippet: "Find the flux Use this equation", target: { sectionId: "s1", blockId: "b1", partId: "work", elementId: "step" } },
  ]);
  expect(findReadingSections(entries, "one visible")).toEqual([]);
  expect(findReadingSections(entries, "Second part")[0].target).toEqual({ sectionId: "s2", blockId: "b2" });
  expect(findReadingSections(entries, "private-answer")).toEqual([]);
  expect(findReadingSections(entries, "hidden reference")).toEqual([]);
  expect(findReadingSections(entries, "")).toHaveLength(2);
});

test("Diktat outline and search resolve the same section indices as the web reader", () => {
  const body = [
    "# Bab 1", "Introduction", "## Dasar", "Definition of flux", "## Contoh", "Electric example",
    "## F-1 Gauss", "First formula", "## F-2 Flux", "Second formula",
  ].join("\n\n");
  const content: OnlineReadingContent = {
    kind: "diktat", title: "Diktat", structured: false, locale: "id", revision: "fixture", resolveImage: () => undefined,
    data: { id: "id", courseId: "course", title: "Diktat", kind: "article", docCategory: "diktat", contentVersion: 1, body },
  };
  const items = readingNavigationItems(content);
  expect(items.map(({ slug, title }) => [slug, title])).toEqual([["0", "Dasar"], ["1", "Contoh"], ["2", "Daftar Rumus"]]);
  const [match] = findReadingSections(items, "Electric example");
  expect(match.slug).toBe("1");
  expect(match.target).toBeUndefined();
  expect(findReadingSections(items, "Second formula")).toMatchObject([{ slug: "2" }]);
});

test("PDF page previews render at most one aligned, bounded group of four pages", () => {
  expect(pdfThumbnailPages(1, 1)).toEqual([1]);
  expect(pdfThumbnailPages(6, 9)).toEqual([5, 6, 7, 8]);
  expect(pdfThumbnailPages(9, 9)).toEqual([9]);
  expect(pdfThumbnailPages(499, 501)).toEqual([497, 498, 499, 500]);
  expect(pdfThumbnailPages(1.5, 7)).toEqual([]);
  expect(pdfThumbnailPages(8, 7)).toEqual([]);
});
