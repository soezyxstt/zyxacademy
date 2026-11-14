import { expect, test } from "bun:test";
import { findStalePdfEvidenceProductIds } from "@/lib/bundle/product-review-preservation";

test("legacy PDF evidence expires when content changes without changing declared hashes", () => {
  const article = { id: "a", productType: "article", generationHash: "same", title: "Article", sections: [{ id: "s", content: "before" }] };
  const diktat = { id: "d", productType: "diktat", generationHash: "same", sourceArticleId: "a", contentMarkdown: "before" };
  const bundle = (products: unknown[]) => ({ products }) as any;
  expect([...findStalePdfEvidenceProductIds(bundle([article, diktat]), bundle([structuredClone(article), structuredClone(diktat)]))]).toEqual([]);
  expect([...findStalePdfEvidenceProductIds(bundle([article, diktat]), bundle([{ ...article, sections: [{ id: "s", content: "changed" }] }, diktat]))].sort()).toEqual(["a", "d"]);
  expect([...findStalePdfEvidenceProductIds(bundle([article, diktat]), bundle([article, { ...diktat, contentMarkdown: "changed" }]))].sort()).toEqual(["a", "d"]);
});
