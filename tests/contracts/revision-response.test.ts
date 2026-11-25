import { expect, test } from "bun:test";
import type { ValidRevisionProductBundle } from "@/lib/authoring/revision-artifact";
import { projectRevisionResponse, selectRevisionContent, summarizeRevisionImpact } from "@/lib/authoring/revision-response";

// The selector receives an admitted bundle. These units isolate parent/ID lookup from admission.
const bundle = { products: [
  { id: "article-1", productType: "article", sections: [
    { id: "section-a", title: "First", blocks: [{ id: "block-a", parts: [{ id: "part-a", kind: "markdown", markdown: "First explanation" }] }] },
    { id: "section-b", title: "Second", blocks: [{ id: "block-b", parts: [] }] },
  ] },
  { id: "article-2", productType: "article", sections: [{ id: "section-c", blocks: [{ id: "block-c" }] }] },
] , dependencies: [] } as unknown as ValidRevisionProductBundle;

test("targeted reads use exact parent IDs and never search across siblings", () => {
  const target = { entityType: "article", entityId: "article-1", sectionId: "section-a", blockId: "block-a" };
  const selection = selectRevisionContent(bundle, target);
  expect(selection.content).toEqual(bundle.products[0].productType === "article" ? bundle.products[0].sections[0].blocks[0] : null);
  for (const invalid of [
    { ...target, blockId: "block-b" }, { ...target, sectionId: "section-c", blockId: "block-c" },
    { ...target, entityType: "diktat" }, { ...target, sectionId: undefined },
    { ...target, itemId: "item-a" }, { ...target, entityId: "constructor" },
  ]) expect(() => selectRevisionContent(bundle, invalid)).toThrow();
  expect(() => selectRevisionContent({ ...bundle, products: [...bundle.products, bundle.products[0]] }, target)).toThrow("REVISION_TARGET_NOT_FOUND");
});

test("compact projection keeps successor execution and explicit deferred status, never approval or full content", () => {
  const context = { kind: "product", importId: "successor", revision: "b".repeat(64), version: 4, schemaVersion: "product-bundle.v4", status: "draft", scope: { courseId: "course", chapterId: "chapter" }, stagingRunId: "run-2", execution: { runToken: "opaque-test-token" }, bundle, reviewContext: { publicationReady: true }, reviewReuse: { token: "old-review" }, nextActions: ["authoring.get_edit_context"], draftLineage: { rootImportId: "root", previousImportId: "predecessor", impact: { changed: true, changedUnits: [{ entityId: "article-1", unitType: "block", unitId: "block-a", change: "changed" }] } } };
  expect(projectRevisionResponse(context)).toBe(context);
  const compact = projectRevisionResponse(context, { responseMode: "compact" });
  expect(compact).toMatchObject({ importId: "successor", revision: context.revision, execution: context.execution, contentScope: "none", evaluation: { review: "not_requested", readiness: "not_requested" }, impact: { counts: { changedUnits: 1 } } });
  expect(compact).not.toHaveProperty("bundle");
  expect(compact).not.toHaveProperty("reviewContext");
  expect(compact).not.toHaveProperty("reviewReuse");
  expect(JSON.stringify(compact)).not.toContain("First explanation");
  const target = { entityType: "article", entityId: "article-1", sectionId: "section-a", blockId: "block-a" };
  const selected = projectRevisionResponse({ ...context, selection: selectRevisionContent(bundle, target) }, { target });
  expect(selected).toHaveProperty("selection.content.id", "block-a");
  expect(selected).not.toHaveProperty("bundle");
  expect(JSON.stringify(selected)).not.toContain("block-b");
});

test("large impact summaries expose totals and truncation instead of silently claiming completeness", () => {
  const impact = summarizeRevisionImpact({ changed: true, changedUnits: Array.from({ length: 60 }, (_, index) => ({ entityId: "article", unitType: "block", unitId: `block-${index}`, change: "changed" })), evidenceInvalidations: [{ entityId: "diktat" }] });
  expect(impact).toMatchObject({ counts: { changedUnits: 60, evidenceInvalidations: 1 }, truncated: true });
  expect(impact?.changedUnits).toHaveLength(50);
});
