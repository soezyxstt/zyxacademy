import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { computeProductBundleChecksum, deterministicProductSerialization, parseProductBundle, productEntitySchema, type ProductEntity } from "@/lib/bundle/product-validator";
import { createProductBundleDraft, finalizeProductBundleDraft } from "@/lib/bundle/product-draft";
import { previewProduct } from "@/lib/bundle/product-preview";
import { solutionItemHash, validateSolutionReview } from "@/lib/solutions/review-contract";
import { evaluateProductBundleQualityPolicy } from "@/lib/bundle/product-review-gate";

const hash = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");
const ideaHash = "a".repeat(64);
const sourceHash = "b".repeat(64);
const part = (id: string, markdown: string) => [{ id, kind: "markdown", markdown }];
function product() {
  const entity = {
    id: "collection-1", productType: "solution_collection", courseId: "course-1", chapterId: "chapter-1", version: 1, status: "draft", schemaVersion: "solution_collection.v1", title: "Examples", sourceHash, generationHash: "0".repeat(64), creatorId: "author-1",
    ideaLinks: [{ id: "idea-1", version: 1, semanticHash: ideaHash, weight: 1, role: "primary" }],
    sourceRefs: [{ sourceId: "source-1", version: 1, checksum: sourceHash, excerptIds: ["excerpt-1"] }],
    collection: { schemaVersion: "solution_collection.v1", productType: "solution_collection", release: "released_learning_content", id: "collection-1", title: "Examples", course: { id: "course-1", title: "Course" }, chapter: { id: "chapter-1", title: "Chapter" }, items: [{
      id: "item-1", title: "Example", questionType: "numeric", discipline: "mathematics", template: "calculation", prompt: part("prompt-1", "Calculate."), options: [], answer: { parts: part("answer-1", "Two."), optionIds: [] }, strategy: part("strategy-1", "Add."), steps: [{ id: "step-1", operationMarkdown: "Add one and one.", reasonMarkdown: "Use addition." }], verification: part("verify-1", "Check the sum."), visuals: [], provenance: { problem: { kind: "original", attribution: "Author", sources: [] }, solution: { kind: "original", attribution: "Author", sources: [] } },
    }] },
  };
  return rehash(entity);
}
function rehash(value: any): any {
  const { generationHash: _, ...content } = value;
  return { ...content, generationHash: hash(deterministicProductSerialization(content)) };
}
function files(entity: any, profile: "product-bundle.v2" | "product-bundle.v4" | "product-bundle.v5" = "product-bundle.v5", mutateDependencies?: (deps: any[]) => any[]) {
  const deps = [
    { id: "dep-idea", upstreamEntityType: "idea", upstreamEntityId: "idea-1", upstreamVersion: 1, upstreamHash: ideaHash, downstreamEntityType: "solution_collection", downstreamEntityId: entity.id, downstreamVersion: 1, downstreamHash: entity.generationHash, freshness: "UP_TO_DATE" },
    { id: "dep-source", upstreamEntityType: "source_material", upstreamEntityId: "source-1", upstreamVersion: 1, upstreamHash: sourceHash, downstreamEntityType: "solution_collection", downstreamEntityId: entity.id, downstreamVersion: 1, downstreamHash: entity.generationHash, freshness: "UP_TO_DATE" },
  ];
  const dependencies = mutateDependencies ? mutateDependencies(deps) : deps;
  const encode = (value: unknown) => new TextEncoder().encode(`${deterministicProductSerialization(value)}\n`);
  const productsBytes = encode([entity]);
  const depsBytes = encode(dependencies);
  const result = new Map([["products.json", productsBytes], ["dependencies.json", depsBytes]]);
  const base = { bundleId: "bundle-1", bundleType: "product" as const, schemaVersion: profile, courseId: "course-1", creatorId: "author-1", createdAt: "2026-01-01T00:00:00Z", conflicts: [], entityFiles: [
    { path: "products.json", entityType: "products" as const, checksum: hash(productsBytes), stableIds: [entity.id] },
    { path: "dependencies.json", entityType: "dependencies" as const, checksum: hash(depsBytes), stableIds: dependencies.map((dep: any) => dep.id) },
  ] };
  result.set("manifest.json", encode({ ...base, bundleChecksum: computeProductBundleChecksum(base, result) }));
  return result;
}
function codes(result: ReturnType<typeof parseProductBundle>) { return result.success ? [] : result.issues.map(issue => issue.code); }

describe("Product Bundle V5", () => {
  test("accepts one standalone collection and previews and revises its full items", () => {
    const result = parseProductBundle(files(product()));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(previewProduct(result.data.products[0]).sections[0].content).toContain("Check the sum.");
    const draft = createProductBundleDraft(result.data);
    const edited = draft.products[0];
    if (edited.productType !== "solution_collection") throw new Error("unexpected fixture");
    edited.collection.items[0].steps[0].reasonMarkdown = "Revised reason.";
    const revised = finalizeProductBundleDraft(result.data, draft);
    expect(revised.bundle.checksum).not.toBe(result.data.checksum);
    expect(revised.bundle.dependencies.every(dep => dep.downstreamHash === revised.bundle.products[0].generationHash)).toBe(true);
  });
  test("isolates profiles and rejects mismatched identity, hash and unlocked sources", () => {
    expect(codes(parseProductBundle(files(product(), "product-bundle.v2")))).toContain("PRODUCT_V5_PROFILE_MISMATCH");
    expect(codes(parseProductBundle(files(product(), "product-bundle.v4")))).toContain("PRODUCT_V5_PROFILE_MISMATCH");
    const mismatch = product(); mismatch.collection.chapter.id = "other";
    expect(codes(parseProductBundle(files(rehash(mismatch))))).toContain("PRODUCT_V5_ENVELOPE_MISMATCH");
    const stale = product(); stale.collection.items[0].title = "Changed";
    expect(codes(parseProductBundle(files(stale)))).toContain("PRODUCT_V5_GENERATION_HASH_MISMATCH");
    expect(codes(parseProductBundle(files(product(), "product-bundle.v5", deps => deps.slice(0, 1))))).toContain("PRODUCT_V5_DEPENDENCY_MISSING");
  });
  test("requires exact revision and complete item correctness, provenance and release decisions", () => {
    const parsed = productEntitySchema.parse(product()) as Extract<ProductEntity, { productType: "solution_collection" }>;
    const entry = { itemId: "item-1", itemHash: solutionItemHash(parsed.collection.items[0]), correctness: "approved", reasoning: "approved", problemProvenance: "approved", solutionProvenance: "approved", release: "approved" };
    const revision = "c".repeat(64);
    const review = { policy: "solution-collection-review.v1", revision, productId: parsed.id, items: [entry] };
    expect(validateSolutionReview({ product: parsed, revision, review, requireApproval: true })).toBeDefined();
    expect(() => validateSolutionReview({ product: parsed, revision: "d".repeat(64), review, requireApproval: true })).toThrow();
    expect(() => validateSolutionReview({ product: parsed, revision, review: { ...review, items: [] }, requireApproval: true })).toThrow();
    expect(() => validateSolutionReview({ product: parsed, revision, review: { ...review, items: [{ ...entry, release: "changes_requested" }] }, requireApproval: true })).toThrow();
    parsed.collection.items[0].provenance.solution.attribution = "Changed author";
    expect(() => validateSolutionReview({ product: parsed, revision, review, requireApproval: true })).toThrow();
  });
  test("rejects source figures until a collection delivery path exists", () => {
    const value = product();
    value.collection.items[0].visuals = [{ id: "figure-1", kind: "source_figure", label: "Figure", description: "Source figure", interactive: false, assetId: "d".repeat(64), materialId: "source-1", sourceChecksum: sourceHash, staticFallback: { type: "text", summary: "Figure", content: "Description" } }];
    expect(codes(parseProductBundle(files(rehash(value))))).toContain("PRODUCT_V5_SOURCE_FIGURE_UNSUPPORTED");
  });
  test("stages without an Article or Diktat and requires review before release", async () => {
    const result = parseProductBundle(files(product()));
    if (!result.success) throw new Error("invalid fixture");
    const quality = await evaluateProductBundleQualityPolicy({ bundle: result.data });
    expect(quality.valid).toBe(true);
    expect(quality.publicationReady).toBe(false);
    expect(quality.issues.map(issue => issue.code)).toEqual(["PRODUCT_V5_REVIEW_REQUIRED"]);
  });
});
