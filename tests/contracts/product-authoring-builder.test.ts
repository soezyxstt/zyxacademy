import { describe, expect, test } from "bun:test";
import { buildProductDraft, PRODUCT_DRAFT_LIMITS, type ProductDraftContext, type ProductDraftInput } from "@/lib/authoring/product-draft-builder";
import { validateProductBundle } from "@/lib/bundle/product-validator";
import { buildLocalVerificationFixture } from "../../scripts/authoring/local-verification-fixture";

const context: ProductDraftContext = {
  bundleId: "draft-builder-test", courseId: "course", chapterId: "chapter", creatorId: "authorized-author", createdAt: "2026-11-25T12:00:00Z",
  ideas: [{ id: "idea", version: 3, semanticHash: "a".repeat(64) }],
  sources: [{ sourceId: "source", version: 2, checksum: "b".repeat(64), excerptIds: ["excerpt"] }],
};
function simpleDiktat(): ProductDraftInput {
  return { products: [{ productType: "diktat", title: "Pangkat", ideaIds: ["idea"], sourceRefs: [{ sourceId: "source", excerptIds: ["excerpt"] }],
    units: [{ ideaIds: ["idea"], parts: [{ kind: "math_unit", latex: "x^2", meaningMarkdown: "Hasil kali sebuah bilangan dengan dirinya.",
      symbolDefinitions: [{ latex: "x", meaningMarkdown: "Bilangan yang dikalikan." }, { latex: "2", meaningMarkdown: "Pangkat dua." }],
    }] }],
  }] };
}

function articleFixture() {
  const product = buildLocalVerificationFixture().bundle.products.find(item => item.productType === "article")!;
  if (product.productType !== "article") throw new Error("Expected Article fixture");
  const article: Extract<ProductDraftInput["products"][number], { productType: "article" }> = {
    productType: "article", id: product.id, title: product.title, slug: product.slug, visuals: product.visuals,
    ideaIds: product.ideaLinks.map(idea => idea.id),
    sourceRefs: product.sourceRefs.map(({ sourceId, excerptIds }) => ({ sourceId, excerptIds })),
    sections: product.sections.map(({ orderIndex: _order, sourceRefs: _sources, ...section }) => ({ ...section,
      blocks: section.blocks.map(({ orderIndex: _index, contentMarkdown: _markdown, visualIds: _visuals, sourceRefs: _blockSources, ideaIds: _ideas, ...block }) => ({ ...block, parts: block.parts! })),
    })),
  };
  const bound: ProductDraftContext = { ...context, courseId: product.courseId, chapterId: product.chapterId,
    ideas: product.ideaLinks.map(({ id, version, semanticHash }) => ({ id, version, semanticHash })), sources: product.sourceRefs,
  };
  return { article, bound };
}

describe("initial Product authoring builder", () => {
  test("builds a deterministic canonical ZIP with bound metadata and generated nested IDs", () => {
    const input = simpleDiktat();
    const original = structuredClone(input);
    const result = buildProductDraft(input, context);
    expect(result.success).toBe(true);
    if (!result.success) throw new Error(JSON.stringify(result.issues));
    expect(input).toEqual(original);
    expect(validateProductBundle(result.bytes).success).toBe(true);
    const product = result.bundle.products[0];
    expect(product).toMatchObject({ creatorId: context.creatorId, courseId: context.courseId, version: 1, status: "draft",
      sourceRefs: context.sources, ideaLinks: [{ ...context.ideas[0], weight: 1, role: "supporting" }],
    });
    expect(result.bundle.dependencies.map(dependency => dependency.upstreamEntityType)).toEqual(["idea", "source_material"]);
    expect(result.bundle.dependencies.every(dependency => dependency.downstreamHash === product.generationHash)).toBe(true);
    if (product.productType !== "diktat") throw new Error("Expected Diktat");
    const part = product.units![0].parts[0];
    expect(part.id).toBeTruthy();
    if (part.kind !== "math_unit") throw new Error("Expected math part");
    expect(new Set(part.symbolDefinitions!.map(symbol => symbol.id)).size).toBe(2);
    const repeat = buildProductDraft(input, context);
    expect(repeat.success).toBe(true);
    if (repeat.success) {
      expect(repeat.bundle.checksum).toBe(result.bundle.checksum);
      expect(repeat.bytes).toEqual(result.bytes);
    }
  });

  test("collects out-of-context Idea and excerpt errors without inventing references", () => {
    const input = simpleDiktat();
    input.products[0].ideaIds = ["unknown-idea"];
    input.products[0].sourceRefs[0].excerptIds = ["unknown-excerpt"];
    const result = buildProductDraft(input, context);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.map(issue => issue.code)).toEqual(["PRODUCT_DRAFT_SOURCE_OUT_OF_SCOPE", "PRODUCT_DRAFT_IDEA_OUT_OF_SCOPE"]);
  });

  test("reports invalid author refs when scoped lookups return no matches", () => {
    const absent = buildProductDraft(simpleDiktat(), { ...context, ideas: [], sources: [] });
    expect(absent.success).toBe(false);
    if (!absent.success) expect(absent.issues.map(issue => issue.code)).toEqual(["PRODUCT_DRAFT_SOURCE_OUT_OF_SCOPE", "PRODUCT_DRAFT_IDEA_OUT_OF_SCOPE"]);
    const missingExcerpt = buildProductDraft(simpleDiktat(), { ...context, sources: [{ ...context.sources[0], excerptIds: [] }] });
    expect(missingExcerpt.success).toBe(false);
    if (!missingExcerpt.success) expect(missingExcerpt.issues.map(issue => issue.code)).toEqual(["PRODUCT_DRAFT_SOURCE_OUT_OF_SCOPE"]);
  });

  test("inherits selected source and Idea refs while preserving nested source closure", () => {
    const { article, bound } = articleFixture();
    const inherited = buildProductDraft({ products: [article] }, bound);
    if (!inherited.success) throw new Error(JSON.stringify(inherited.issues));
    const built = inherited.bundle.products[0];
    if (built.productType !== "article") throw new Error("Expected Article");
    for (const section of built.sections) {
      expect(section.sourceRefs).toEqual(built.sourceRefs);
      for (const block of section.blocks) {
        expect(block.sourceRefs).toEqual(section.sourceRefs);
        expect(block.ideaIds).toEqual(section.ideaIds);
      }
    }
    const extraExcerpt = "known-but-not-selected";
    const extendedContext = { ...bound, sources: bound.sources.map(source => ({ ...source, excerptIds: [...source.excerptIds, extraExcerpt] })) };
    const selection = [{ sourceId: article.sourceRefs[0].sourceId, excerptIds: [extraExcerpt] }];
    const sectionInput = structuredClone(article);
    sectionInput.sections[0].sourceRefs = selection;
    const sectionResult = buildProductDraft({ products: [sectionInput] }, extendedContext);
    expect(sectionResult.success).toBe(false);
    if (!sectionResult.success) expect(sectionResult.issues.some(issue => issue.code === "PRODUCT_SECTION_REFERENCE_INVALID")).toBe(true);
    const blockInput = structuredClone(article);
    blockInput.sections[0].blocks[0].sourceRefs = selection;
    const blockResult = buildProductDraft({ products: [blockInput] }, extendedContext);
    expect(blockResult.success).toBe(false);
    if (!blockResult.success) expect(blockResult.issues.some(issue => issue.code === "PRODUCT_BLOCK_REFERENCE_INVALID")).toBe(true);
  });

  test("rejects unknown Ideas in nested sections and blocks", () => {
    const { article, bound } = articleFixture();
    const sectionInput = structuredClone(article);
    sectionInput.sections[0].ideaIds = [...sectionInput.sections[0].ideaIds, "unknown-idea"];
    const sectionResult = buildProductDraft({ products: [sectionInput] }, bound);
    expect(sectionResult.success).toBe(false);
    if (!sectionResult.success) expect(sectionResult.issues.some(issue => issue.code === "PRODUCT_SECTION_REFERENCE_INVALID")).toBe(true);
    const blockInput = structuredClone(article);
    blockInput.sections[0].blocks[0].ideaIds = ["unknown-idea"];
    const blockResult = buildProductDraft({ products: [blockInput] }, bound);
    expect(blockResult.success).toBe(false);
    if (!blockResult.success) expect(blockResult.issues.some(issue => issue.code === "PRODUCT_BLOCK_REFERENCE_INVALID")).toBe(true);
  });

  test("rejects caller-supplied authority fields and enforces the request bound", () => {
    const input = simpleDiktat();
    const result = buildProductDraft({ products: [{ ...input.products[0], creatorId: "someone-else", generationHash: "c".repeat(64) }] }, context);
    expect(result.success).toBe(false);
    const oversized = buildProductDraft({ products: [{ ...input.products[0], title: "x".repeat(PRODUCT_DRAFT_LIMITS.requestBytes) }] }, context);
    expect(oversized.success).toBe(false);
    if (!oversized.success) expect(oversized.issues[0].code).toBe("PRODUCT_DRAFT_REQUEST_TOO_LARGE");
  });

  test("keeps the canonical formula and coverage checks after ID assignment", () => {
    const input = simpleDiktat();
    const diktat = input.products[0];
    if (diktat.productType !== "diktat") throw new Error("Expected Diktat");
    diktat.units[0].parts = [{ kind: "math_unit", latex: "x", relations: [{ latex: "x", meaningMarkdown: "Bilangan." }], meaningMarkdown: "Bilangan." }];
    const result = buildProductDraft(input, context);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues.some(issue => issue.message.includes("ARTICLE_MATH_REPRESENTATION_AMBIGUOUS"))).toBe(true);
  });

  test("assembles Article and derived Diktat in either order and binds exact lineage", () => {
    const fixture = buildLocalVerificationFixture().bundle;
    const inputs = fixture.products.map(product => {
      const common = { id: product.id, productType: product.productType, title: "title" in product ? product.title : "", ideaIds: product.ideaLinks.map(idea => idea.id),
        sourceRefs: product.sourceRefs.map(({ sourceId, excerptIds }) => ({ sourceId, excerptIds })),
      };
      if (product.productType === "article") return { ...common, productType: "article" as const, slug: product.slug, visuals: product.visuals,
        sections: product.sections.map(({ orderIndex: _order, ...section }) => ({ ...section,
          sourceRefs: section.sourceRefs.map(({ sourceId, excerptIds }) => ({ sourceId, excerptIds })),
          blocks: section.blocks.map(({ orderIndex: _index, contentMarkdown: _markdown, visualIds: _visuals, ...block }) => ({ ...block, parts: block.parts!, sourceRefs: block.sourceRefs.map(({ sourceId, excerptIds }) => ({ sourceId, excerptIds })) })),
        })),
      };
      if (product.productType !== "diktat") throw new Error("Unexpected fixture product");
      return { ...common, productType: "diktat" as const, sourceArticleId: product.sourceArticleId,
        units: product.units!.map(unit => ({ ...unit, parts: unit.parts.map(part => {
          if (part.kind !== "visual_ref") return part;
          const { staticSnapshot: _snapshot, ...rest } = part;
          return rest;
        }) })),
      };
    }).reverse();
    const first = fixture.products[0];
    const bound = { ...context, courseId: first.courseId, chapterId: first.chapterId,
      ideas: first.ideaLinks.map(({ id, version, semanticHash }) => ({ id, version, semanticHash })), sources: first.sourceRefs,
    };
    const result = buildProductDraft({ products: inputs }, bound);
    if (!result.success) throw new Error(JSON.stringify(result.issues));
    expect(validateProductBundle(result.bytes).success).toBe(true);
    const article = result.bundle.products.find(product => product.productType === "article")!;
    const diktat = result.bundle.products.find(product => product.productType === "diktat")!;
    expect(diktat.productType === "diktat" && diktat.sourceArticleHash).toBe(article.generationHash);
    expect(result.bundle.dependencies.find(dependency => dependency.upstreamEntityType === "product")).toMatchObject({ upstreamHash: article.generationHash, downstreamHash: diktat.generationHash });
  });
});
