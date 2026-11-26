import { describe, expect, test } from "bun:test";
import { buildProductDraft, PRODUCT_DRAFT_LIMITS, productDraftInputSchema, type ProductDraftContext, type ProductDraftInput } from "@/lib/authoring/product-draft-builder";
import { createProductDraftToolSchema } from "@/lib/authoring/product-draft-service";
import { prepareProductDraftPreview } from "@/lib/authoring/product-draft-preview";
import { validateProductBundle } from "@/lib/bundle/product-validator";
import { solutionCollectionDraft } from "../helpers/product-draft-formats";

const context: ProductDraftContext = {
  bundleId: "typed-formats", courseId: "course", chapterId: "chapter", courseTitle: "Course", chapterTitle: "Chapter",
  creatorId: "author", createdAt: "2026-11-25T12:00:00Z", ideas: [{ id: "idea", version: 3, semanticHash: "a".repeat(64) }],
  sources: [{ sourceId: "source", version: 2, checksum: "b".repeat(64), excerptIds: ["excerpt"] }],
};
const refs = { ideaIds: ["idea"], sourceRefs: [{ sourceId: "source", excerptIds: ["excerpt"] }] };
function cards(): ProductDraftInput {
  return { products: [{ ...refs, productType: "flashcard_set", id: "set", title: "Pangkat" },
    ...Array.from({ length: 100 }, (_, index) => ({ ...refs, productType: "flashcard" as const, setId: "set", front: `Berapa ${index} kuadrat?`, back: `${index * index}` })),
  ] };
}
function built(input: ProductDraftInput, bound = context) {
  const result = buildProductDraft(input, bound);
  if (!result.success) throw new Error(JSON.stringify(result.issues));
  expect(validateProductBundle(result.bytes).success).toBe(true);
  return result;
}

describe("typed flashcard and V5 authoring", () => {
  test("builds 100 atomic cards in one bounded request, derives set membership and retains current Idea pins", () => {
    const input = cards(), result = built(input);
    expect(result.bundle.manifest.schemaVersion).toBe("product-bundle.v4");
    expect(result.bundle.products).toHaveLength(101);
    const set = result.bundle.products[0];
    if (set.productType !== "flashcard_set") throw new Error("Expected set");
    expect(set.cards).toEqual(result.bundle.products.slice(1).map(card => card.id));
    for (const card of result.bundle.products.slice(1)) expect(card).toMatchObject({ productType: "flashcard", atomic: true, setId: "set", ideaLinks: [{ ...context.ideas[0], weight: 1, role: "supporting" }] });
    expect(result.bytes).toEqual(built(input).bytes);
    expect(Buffer.byteLength(JSON.stringify(input))).toBeLessThan(PRODUCT_DRAFT_LIMITS.requestBytes);
  });
  test("preserves empty sets and standalone cards while rejecting missing or conflicting membership", () => {
    built({ products: [{ ...refs, productType: "flashcard_set", title: "Koleksi kosong" }] });
    built({ products: [{ ...refs, productType: "flashcard", front: "Satu tambah satu?", back: "Dua" }] });
    const input = cards();
    if (input.products[0].productType !== "flashcard_set") throw new Error("Expected set");
    input.products[0].cards = ["missing-card"];
    expect(buildProductDraft(input, context).success).toBe(false);
    input.products[0].cards = [];
    expect(buildProductDraft(input, context).success).toBe(false);
    const card = { ...refs, productType: "flashcard", front: "A? B?", back: "C" };
    expect(buildProductDraft({ products: [card] }, context).success).toBe(false);
    expect(buildProductDraft({ products: [{ ...card, ideaIds: ["idea", "second"] }] }, context).success).toBe(false);
    expect(buildProductDraft({ products: [{ ...card, atomic: false }] }, context).success).toBe(false);
  });
  test("builds V5 from authored items, assigning mechanical IDs and current server scope", () => {
    const input = solutionCollectionDraft(), before = structuredClone(input), result = built(input);
    expect(input).toEqual(before);
    expect(result.bundle.manifest.schemaVersion).toBe("product-bundle.v5");
    const product = result.bundle.products[0];
    if (product.productType !== "solution_collection") throw new Error("Expected collection");
    expect(product.collection).toMatchObject({ id: product.id, title: product.title, release: "released_learning_content", course: { id: "course", title: "Course" }, chapter: { id: "chapter", title: "Chapter" } });
    expect(product.collection.items[0].steps[0].id).toBeTruthy();
    expect(product.collection.items[0].prompt[0].id).toBeTruthy();
    expect(result.bundle.dependencies.every(edge => edge.downstreamHash === product.generationHash && edge.downstreamEntityType === "solution_collection")).toBe(true);
    expect(built(input).bytes).toEqual(result.bytes);
    built(input, { ...context, bundleId: "long".repeat(64) });
  });
  test("keeps V5 single-product scope, provenance, option and static-code checks authoritative", () => {
    const base = solutionCollectionDraft();
    const product = base.products[0];
    if (product.productType !== "solution_collection") throw new Error("Expected collection");
    expect(buildProductDraft({ products: [product, cards().products[0]] }, context).success).toBe(false);
    expect(buildProductDraft(base, { ...context, courseTitle: undefined }).success).toBe(false);
    expect(buildProductDraft({ products: [{ ...product, course: { id: "foreign" }, generationHash: "0".repeat(64) }] }, context).success).toBe(false);
    const badProvenance = structuredClone(product);
    badProvenance.items[0].provenance.problem.kind = "reproduced";
    expect(buildProductDraft({ products: [badProvenance] }, context).success).toBe(false);
    const badOptions = structuredClone(product);
    badOptions.items[0].questionType = "single_choice";
    expect(buildProductDraft({ products: [badOptions] }, context).success).toBe(false);
    const badContent = structuredClone(product);
    badContent.items[0].prompt = [{ kind: "markdown", markdown: "<!--__ZYX_V4_embedded-->" }];
    expect(buildProductDraft({ products: [badContent] }, context).success).toBe(false);
    const privateCoding = { ...product, items: [{ ...product.items[0], prompt: [{ kind: "coding_exercise", problemId: "private" }] }] };
    expect(buildProductDraft({ products: [privateCoding] }, context).success).toBe(false);
  });
  test("retains aggregate bounds, catalog acceptance and truthful local preview support", () => {
    for (const input of [cards(), solutionCollectionDraft()]) {
      expect(createProductDraftToolSchema.safeParse({ runToken: "run", bootstrapToken: "bootstrap", draftKey: "key", draft: input }).success).toBe(true);
      expect(prepareProductDraftPreview(input)).toMatchObject({ checks: { structure: "failed" }, issues: expect.arrayContaining([expect.objectContaining({ code: "PREVIEW_PROFILE_UNSUPPORTED" })]) });
    }
    const card = cards().products[1];
    expect(productDraftInputSchema.safeParse({ products: Array(257).fill(card) }).success).toBe(false);
    expect(buildProductDraft({ products: Array(100).fill({ ...card, back: "x".repeat(10_000) }) }, context).success).toBe(false);
    const diktat = { ...refs, productType: "diktat", title: "Review", units: [{ ideaIds: ["idea"], parts: [{ kind: "markdown", markdown: "Review." }] }] };
    expect(productDraftInputSchema.safeParse({ products: Array(17).fill(diktat) }).success).toBe(false);
  });
});
