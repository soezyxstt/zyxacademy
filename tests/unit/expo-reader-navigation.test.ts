import { expect, test } from "bun:test";
import { bindPdfAnnotations, pdfOutline } from "@/apps/mobile-native/features/student/courses/pdf-reader-model";
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
        parts: [{ id: "p1", kind: "markdown", markdown: "Visible flux text <!-- hidden reference -->" }],
      }] },
      { id: "s2", slug: "second", title: "Gradient", blocks: [{ id: "b2", blockType: "text", content: "Second part" }] },
    ] },
  };
  const entries = readingNavigationItems(content);
  expect(findReadingSections(entries, " FLUX ")).toMatchObject([{ id: "s1", slug: "first", snippet: "Part one Visible flux text" }]);
  expect(findReadingSections(entries, "private-answer")).toEqual([]);
  expect(findReadingSections(entries, "hidden reference")).toEqual([]);
  expect(findReadingSections(entries, "")).toHaveLength(2);
});
