import { expect, test } from "bun:test";
import { addSelectedFallback, type DemoCatalogue } from "@/lib/demo/catalogue";

test("absent product selections do not become catalogue documents", () => {
  const catalogue: DemoCatalogue = { chapters: [{ id: "first", title: "First", orderIndex: 1 }], materials: [] };
  expect(addSelectedFallback(catalogue, {}, { article: "First", diktat: "First" }).materials).toEqual([]);
  expect(addSelectedFallback(catalogue, { articleId: "fictional-article" }, { article: "Article", diktat: "First" }).materials.map(item => item.id)).toEqual(["fictional-article"]);
});
