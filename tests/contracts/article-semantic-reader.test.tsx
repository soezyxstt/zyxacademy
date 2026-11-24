import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ArticleParts } from "@/components/course/article-parts";
import { semanticArticleParts } from "@/tests/fixtures/product-learning/article-semantics";
import { articlePartSearchEntries } from "@/lib/materials/article-parts";
import { searchArticleContent, type PublicSectionReadModel } from "@/lib/articles/structured-read-model";

describe("V4 semantic reader", () => {
 test("renders formulas and step reasons mathematically with stable anchors", () => {
  const html = renderToStaticMarkup(<ArticleParts parts={semanticArticleParts} />);
  expect(html).toContain('data-step-id="cancel-step"');
  expect(html).toContain('data-symbol-id="c"');
  expect(html).toContain('data-math-layout="cases"');
  expect(html).toContain('class="katex"');
  expect(html).not.toContain('class="katex-error"');
  expect(html).not.toContain("undefined");
 });
 test("search reaches the exact step instead of only its parent block", () => {
  const section: PublicSectionReadModel = { id: "s", slug: "s", title: "Syarat", sectionNumber: "1", sectionKind: "topic", orderIndex: 0, learningObjective: "Penalaran", estimatedReadingMinutes: 1, parentSectionId: null, blocks: [{ id: "b", blockKey: "b", blockType: "worked_example", title: "Faktorisasi", orderIndex: 0, content: "A compatibility projection", parts: semanticArticleParts }] };
  const result = searchArticleContent([section], "bernilai bukan nol");
  expect(result[0].elementId).toBe("cancel-step");
  expect(result[0].snippet).toContain("bernilai bukan nol");
  expect(articlePartSearchEntries(semanticArticleParts).find((entry) => entry.id === "defined")?.text).toContain("tersedia");
 });
});
