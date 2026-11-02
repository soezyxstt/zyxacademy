import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import { auditMutasiSchema, imporBundleSchema, itemImporBundleSchema, publikasiBundleSchema, reviewBundleSchema, uniqueBundleImportIdentitySchema } from "@/lib/bundle/contracts";
import {
  computeProductBundleChecksum,
  deterministicProductSerialization,
  productBundleManifestSchema,
  validateProductBundle,
  type ProductEntity,
} from "@/lib/bundle/product-validator";
import { createProductBundleDraft, finalizeProductBundleDraft, refreshDraftDependencies } from "@/lib/bundle/product-draft";
import { LIMIT_EPSILON_DELTA_GRAPH } from "../fixtures/product-learning/limit-epsilon-delta";
import { unchangedArticleSectionIds } from "@/lib/bundle/product-review-preservation";

const now = "2026-08-02T00:00:00.000Z";
const checksum = "b".repeat(64);
const baseImport = { id: "import-1", bundleId: "bundle-1", version: 1, checksum, status: "approved" as const, importedAt: now, approvedAt: now };

describe("Plan 004 bundle lifecycle contracts", () => {
  it("accepts a unique approved import and atomic publication", () => {
    expect(imporBundleSchema.parse(baseImport).status).toBe("approved");
    expect(uniqueBundleImportIdentitySchema.parse([baseImport])).toHaveLength(1);
    expect(itemImporBundleSchema.parse({ id: "item-1", importId: "import-1", entityType: "artikel", entityId: "artikel-1", entityChecksum: checksum })).toBeTruthy();
    expect(reviewBundleSchema.parse({ id: "review-1", importId: "import-1", reviewerId: "reviewer-1", decision: "approved", reviewedAt: now })).toBeTruthy();
    expect(auditMutasiSchema.parse({ id: "audit-1", bundleId: "bundle-1", actorId: "reviewer-1", action: "published", entityIds: ["artikel-1"], occurredAt: now })).toBeTruthy();
    expect(publikasiBundleSchema.parse({ id: "publication-1", bundleId: "bundle-1", approvedImportId: "import-1", approvedImportStatus: "approved", publishedEntityIds: ["artikel-1", "soal-1"], atomic: true, publishedAt: now })).toBeTruthy();
  });

  it("rejects duplicate bundle checksum and non-atomic or unapproved publication", () => {
    expect(uniqueBundleImportIdentitySchema.safeParse([baseImport, { ...baseImport, id: "import-2" }]).success).toBe(false);
    expect(imporBundleSchema.safeParse({ ...baseImport, status: "approved", approvedAt: null }).success).toBe(false);
    expect(publikasiBundleSchema.safeParse({ id: "publication-1", bundleId: "bundle-1", approvedImportId: "import-1", approvedImportStatus: "review", publishedEntityIds: ["artikel-1"], atomic: true, publishedAt: now }).success).toBe(false);
    expect(publikasiBundleSchema.safeParse({ id: "publication-1", bundleId: "bundle-1", approvedImportId: "import-1", approvedImportStatus: "approved", publishedEntityIds: ["artikel-1"], atomic: false, publishedAt: now }).success).toBe(false);
  });

  it("rejects unknown fields in import and publication records", () => {
    expect(imporBundleSchema.safeParse({ ...baseImport, extra: true }).success).toBe(false);
    expect(itemImporBundleSchema.safeParse({ id: "item-1", importId: "import-1", entityType: "unknown", entityId: "artikel-1", entityChecksum: checksum }).success).toBe(false);
    expect(reviewBundleSchema.safeParse({ id: "review-1", importId: "import-1", reviewerId: "reviewer-1", decision: "approved", reviewedAt: now, extra: true }).success).toBe(false);
    expect(publikasiBundleSchema.safeParse({ id: "publication-1", bundleId: "bundle-1", approvedImportId: "import-1", approvedImportStatus: "approved", publishedEntityIds: ["artikel-1"], atomic: true, publishedAt: now, extra: true }).success).toBe(false);
  });
});

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function createV3ArticleProduct(): ProductEntity {
  return {
    id: "article-v3",
    productType: "article",
    courseId: "course-1",
    chapterId: "chapter-1",
    version: 1,
    status: "draft",
    slug: "article-v3-slug",
    title: "Article V3 Title",
    schemaVersion: "1.0",
    sourceHash: HASH_B,
    generationHash: HASH_A,
    creatorId: "creator-1",
    curatorId: "curator-1",
    ideaLinks: [{ id: "idea-1", version: 1, semanticHash: HASH_A, weight: 1, role: "primary" }],
    sourceRefs: [{ sourceId: "source-1", version: 1, checksum: HASH_B, excerptIds: ["excerpt-1"] }],
    blocks: [],
    sections: [
      {
        id: "sec-overview",
        kind: "overview",
        title: "Overview",
        slug: "sec-overview",
        orderIndex: 0,
        learningObjective: "Tujuan overview",
        ideaIds: ["idea-1"],
        sourceRefs: [{ sourceId: "source-1", version: 1, checksum: HASH_B, excerptIds: ["excerpt-1"] }],
        blocks: [
          {
            id: "b-ov-1",
            blockType: "prior_knowledge_activation",
            title: "Aktivasi",
            orderIndex: 0,
            contentMarkdown: "Pengetahuan awal",
            ideaIds: ["idea-1"],
            sourceRefs: [{ sourceId: "source-1", version: 1, checksum: HASH_B, excerptIds: ["excerpt-1"] }],
          },
        ],
      },
      {
        id: "sec-topic",
        kind: "topic",
        learningSectionId: "ls-topic-1",
        title: "Topic Main",
        slug: "sec-topic",
        orderIndex: 1,
        learningObjective: "Tujuan topik",
        ideaIds: ["idea-1"],
        sourceRefs: [{ sourceId: "source-1", version: 1, checksum: HASH_B, excerptIds: ["excerpt-1"] }],
        blocks: [
          {
            id: "b-top-1",
            blockType: "explanation",
            title: "Penjelasan",
            orderIndex: 0,
            contentMarkdown: "Penjelasan topik lengkap",
            ideaIds: ["idea-1"],
            sourceRefs: [{ sourceId: "source-1", version: 1, checksum: HASH_B, excerptIds: ["excerpt-1"] }],
          },
          {
            id: "b-top-2",
            blockType: "retrieval_prompt",
            title: "Latihan",
            orderIndex: 1,
            contentMarkdown: "Soal pemahaman",
            ideaIds: ["idea-1"],
            sourceRefs: [{ sourceId: "source-1", version: 1, checksum: HASH_B, excerptIds: ["excerpt-1"] }],
          },
        ],
      },
      {
        id: "sec-summary",
        kind: "summary",
        title: "Summary",
        slug: "sec-summary",
        orderIndex: 2,
        learningObjective: "Tujuan rangkuman",
        ideaIds: ["idea-1"],
        sourceRefs: [{ sourceId: "source-1", version: 1, checksum: HASH_B, excerptIds: ["excerpt-1"] }],
        blocks: [
          {
            id: "b-sum-1",
            blockType: "summary",
            title: "Rangkuman",
            orderIndex: 0,
            contentMarkdown: "Poin rangkuman",
            ideaIds: ["idea-1"],
            sourceRefs: [{ sourceId: "source-1", version: 1, checksum: HASH_B, excerptIds: ["excerpt-1"] }],
          },
          {
            id: "b-sum-2",
            blockType: "retrieval_close",
            title: "Check Akhir",
            orderIndex: 1,
            contentMarkdown: "Penutup evaluasi",
            ideaIds: ["idea-1"],
            sourceRefs: [{ sourceId: "source-1", version: 1, checksum: HASH_B, excerptIds: ["excerpt-1"] }],
          },
        ],
      },
    ],
  };
}

function buildTestBundleBytes(products: ProductEntity[], schemaVersion: "product-bundle.v2" | "product-bundle.v3" | "product-bundle.v4" = "product-bundle.v3"): Uint8Array {
  const encode = (value: unknown) => new TextEncoder().encode(`${deterministicProductSerialization(value)}\n`);
  const files = new Map<string, Uint8Array>();
  const productBytes = encode(products);
  const dependencyBytes = encode([]);
  files.set("entities/products.json", productBytes);
  files.set("entities/dependencies.json", dependencyBytes);
  const manifestBase = {
    bundleId: "bundle-test-1",
    bundleType: "product" as const,
    schemaVersion,
    courseId: "course-1",
    entityFiles: [
      { path: "entities/products.json", entityType: "products" as const, checksum: createHash("sha256").update(productBytes).digest("hex"), stableIds: products.map((p) => String(p.id)) },
      { path: "entities/dependencies.json", entityType: "dependencies" as const, checksum: createHash("sha256").update(dependencyBytes).digest("hex"), stableIds: [] },
    ],
    creatorId: "creator-1",
    curatorId: "curator-1",
    createdAt: "2026-08-03T00:00:00.000Z",
    conflicts: [],
  };
  const manifest = { ...manifestBase, bundleChecksum: computeProductBundleChecksum(manifestBase, files) };
  files.set("manifest.json", encode(manifest));
  return zipSync(Object.fromEntries(files));
}

describe("Product Bundle V3 contract", () => {
  it("supports product-bundle.v3 manifest schemaVersion", () => {
    const manifestV3 = {
      bundleId: "b-1",
      bundleType: "product" as const,
      schemaVersion: "product-bundle.v3" as const,
      courseId: "c-1",
      entityFiles: [
        { path: "entities/products.json", entityType: "products" as const, checksum: HASH_A, stableIds: ["p-1"] },
        { path: "entities/dependencies.json", entityType: "dependencies" as const, checksum: HASH_B, stableIds: [] },
      ],
      creatorId: "cr-1",
      createdAt: now,
      bundleChecksum: HASH_A,
      conflicts: [],
    };
    expect(productBundleManifestSchema.safeParse(manifestV3).success).toBe(true);

    const manifestInvalid = { ...manifestV3, schemaVersion: "product-bundle.v5" };
    expect(productBundleManifestSchema.safeParse(manifestInvalid).success).toBe(false);
  });

  it("validates valid V3 article product bundle successfully", () => {
    const article = createV3ArticleProduct();
    const zipBytes = buildTestBundleBytes([article], "product-bundle.v3");
    const result = validateProductBundle(zipBytes);
    expect(result.success).toBe(true);
  });

  it("finalizes V3 article draft and locks identity fields while allowing content edits", () => {
    const article = createV3ArticleProduct();
    const zipBytes = buildTestBundleBytes([article], "product-bundle.v3");
    const parsed = validateProductBundle(zipBytes);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const draft = createProductBundleDraft(parsed.data);
    const draftArticle = draft.products[0];
    if (draftArticle.productType !== "article") throw new Error("expected article");

    draftArticle.title = "Updated V3 Title";
    draftArticle.sections[0].title = "Updated Overview Title";
    draftArticle.sections[0].blocks[0].contentMarkdown = "Updated overview content markdown";

    const finalized = finalizeProductBundleDraft(parsed.data, draft);
    const finalizedArticle = finalized.bundle.products[0];
    if (finalizedArticle.productType === "article") {
      expect(finalizedArticle.title).toBe("Updated V3 Title");
      expect(finalizedArticle.sections[0].title).toBe("Updated Overview Title");
      expect(finalizedArticle.sections[0].blocks[0].contentMarkdown).toBe("Updated overview content markdown");
      expect(finalizedArticle.slug).toBe("article-v3-slug");
    }
  });

  it("marks a Diktat dependency stale after its source Article changes", () => {
    const article = createV3ArticleProduct();
    const diktat = {
      ...article,
      id: "diktat-v3",
      productType: "diktat" as const,
      title: "Diktat V3",
      contentMarkdown: "Ringkasan materi yang diturunkan dari artikel.",
      sourceArticleId: article.id,
      sourceArticleVersion: article.version,
      sourceArticleHash: article.generationHash,
    } as ProductEntity;
    const dependencies = refreshDraftDependencies([
      {
        id: "dep-article-diktat",
        upstreamEntityType: "product",
        upstreamEntityId: article.id,
        upstreamVersion: article.version,
        upstreamHash: HASH_A,
        downstreamEntityType: "diktat",
        downstreamEntityId: diktat.id,
        downstreamVersion: diktat.version,
        downstreamHash: HASH_A,
        freshness: "UP_TO_DATE",
      },
    ], [article, diktat], new Set([article.id]));

    expect(dependencies[0].freshness).toBe("STALE");
    expect(dependencies[0].upstreamHash).toBe(article.generationHash);
    expect(dependencies[0].downstreamHash).toBe(diktat.generationHash);
  });

  it("preserves approval only for unchanged Article sections", () => {
    const parsed = validateProductBundle(buildTestBundleBytes([createV3ArticleProduct()]));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const article = parsed.data.products[0];
    if (article.productType !== "article") throw new Error("expected article");
    const editedArticle: ProductEntity = {
      ...article,
      sections: article.sections.map((section) => section.id === "sec-topic"
        ? { ...section, learningObjective: "Tujuan topik yang sudah diperbarui" }
        : section),
    };
    const next = { ...parsed.data, products: [editedArticle] };

    expect([...unchangedArticleSectionIds(parsed.data, next)].sort()).toEqual(["sec-overview", "sec-summary"]);
  });

  it.each(["block", "pedagogy", "part"])("invalidates only sections depending on changed visuals through %s bindings", (binding) => {
    const parsed = validateProductBundle(buildTestBundleBytes([createV3ArticleProduct()]));
    if (!parsed.success) throw new Error("expected valid fixture");
    const article = parsed.data.products[0];
    if (article.productType !== "article") throw new Error("expected article");
    const section = article.sections[1];
    article.visuals = [{
      id: "visual-bound", kind: "epsilon_delta_graph", label: "Limit linear", description: "Nilai mendekati nol",
      bounds: { xMin: -3, xMax: 3, yMin: -3, yMax: 3 },
      limitPoint: 0, limitValue: 0, defaultDelta: 1, defaultEpsilon: 1,
      functionModel: { kind: "linear", m: 1, b: 0 },
      staticFallback: { type: "text", summary: "Limit", content: "Nilai mendekati nol." },
    }];
    if (binding === "block") section.blocks[0].visualIds = ["visual-bound"];
    if (binding === "part") Object.assign(section.blocks[0], { parts: [{ id: "part-visual", kind: "visual_ref", visualId: "visual-bound" }] });
    if (binding === "pedagogy") {
      section.pedagogy = {
        objectives: [{ id: "objective", description: "Memahami limit", explanationBlockIds: ["b-top-1"], formativeCheckBlockIds: ["b-top-2"] }],
        prerequisites: [], symbols: [], timeEstimate: { readingMinutes: 1, examplesMinutes: 0, practiceMinutes: 1 },
        visualRequirement: { status: "required", visualIds: ["visual-bound"] },
      };
    }
    const next = structuredClone(parsed.data);
    const nextArticle = next.products[0];
    if (nextArticle.productType !== "article" || !nextArticle.visuals) throw new Error("expected visual registry");
    nextArticle.visuals[0].description = "Penjelasan visual direvisi";
    expect([...unchangedArticleSectionIds(parsed.data, next)].sort()).toEqual(["sec-overview", "sec-summary"]);

    nextArticle.visuals = [...article.visuals, { ...article.visuals[0], id: "visual-unrelated" }];
    expect(unchangedArticleSectionIds(parsed.data, next).size).toBe(3);

    nextArticle.visuals = [];
    expect(unchangedArticleSectionIds(parsed.data, next).has("sec-topic")).toBe(false);
    expect(unchangedArticleSectionIds(next, parsed.data).has("sec-topic")).toBe(false);

    nextArticle.visuals = structuredClone(article.visuals);
    const nextSection = nextArticle.sections[1];
    delete nextSection.blocks[0].visualIds;
    if (binding === "part") Object.assign(nextSection.blocks[0], { parts: [] });
    if (nextSection.pedagogy) nextSection.pedagogy.visualRequirement = { status: "not_required", reason: "Tujuan direvisi" };
    expect(unchangedArticleSectionIds(parsed.data, next).has("sec-topic")).toBe(false);
  });

  it("rejects V3 article with duplicate section IDs or invalid section hierarchy", () => {
    const dupSection = createV3ArticleProduct();
    if (dupSection.productType === "article") {
      dupSection.sections[1].id = dupSection.sections[0].id;
    }
    const dupResult = validateProductBundle(buildTestBundleBytes([dupSection]));
    expect(dupResult.success).toBe(false);
    if (!dupResult.success) {
      expect(dupResult.issues[0]?.code).toBe("PRODUCT_SECTION_INVALID");
    }
  });

  it("rejects V3 section IDs reused by another Article in the same bundle", () => {
    const first = createV3ArticleProduct();
    const second = createV3ArticleProduct();
    second.id = "article-v3-second";
    if (second.productType === "article") second.slug = "article-v3-second";
    const result = validateProductBundle(buildTestBundleBytes([first, second]));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues[0]?.code).toBe("PRODUCT_SECTION_INVALID");
  });
});


describe("Product Bundle V4 pilot", () => {
  it("rejects missing parts, unresolved visuals, and legacy manifests carrying V4", () => {
    const article = createV3ArticleProduct();
    if (article.productType !== "article") throw new Error("expected article");
    article.schemaVersion = "article.v4";
    const missing = validateProductBundle(buildTestBundleBytes([article], "product-bundle.v4"));
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.issues[0].code).toBe("PRODUCT_ARTICLE_PARTS_REQUIRED");
    for (const block of article.sections.flatMap((section) => section.blocks)) {
      block.parts = [{ id: `${block.id}-text`, kind: "markdown", markdown: block.contentMarkdown }];
      block.contentMarkdown = "";
    }
    article.sections[0].blocks[0].parts = [{ id: "unresolved", kind: "visual_ref", visualId: "missing-visual" }];
    const unresolved = validateProductBundle(buildTestBundleBytes([article], "product-bundle.v4"));
    expect(unresolved.success).toBe(false);
    if (!unresolved.success) expect(unresolved.issues[0].code).toBe("ARTICLE_PART_VISUAL_MISSING");
    expect(validateProductBundle(buildTestBundleBytes([article], "product-bundle.v3")).success).toBe(false);
  });

  it("materializes ordered parts and keeps publication blocked until trusted verification", () => {
    const article = createV3ArticleProduct();
    if (article.productType !== "article") throw new Error("expected article");
    article.schemaVersion = "article.v4";
    for (const block of article.sections.flatMap((section) => section.blocks)) {
      block.parts = [{ id: `${block.id}-text`, kind: "markdown", markdown: block.contentMarkdown }];
      block.contentMarkdown = "";
    }
    const result = validateProductBundle(buildTestBundleBytes([article], "product-bundle.v4"));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.publicationBlocked).toBe(true);
    expect(result.data.issues[0].code).toBe("PRODUCT_V4_VERIFICATION_REQUIRED");
    const normalized = result.data.products[0];
    if (normalized.productType !== "article") throw new Error("expected article");
    expect(normalized.sections[0].blocks[0].contentMarkdown.length).toBeGreaterThan(0);
    const draft = createProductBundleDraft(result.data);
    const edited = draft.products[0];
    if (edited.productType !== "article") throw new Error("expected article");
    edited.sections[0].blocks[0].parts = [{ id: "replacement", kind: "markdown", markdown: "Updated authoritative explanation" }];
    const finalized = finalizeProductBundleDraft(result.data, draft);
    const updated = finalized.bundle.products[0];
    if (updated.productType !== "article") throw new Error("expected article");
    expect(updated.sections[0].blocks[0].contentMarkdown).toBe("Updated authoritative explanation");
    expect(updated.sections[0].blocks[0].parts?.[0].id).toBe("replacement");
  });
});


describe("V4 draft integration invariants", () => {
  function article() {
    const value = createV3ArticleProduct();
    if (value.productType !== "article") throw new Error("expected article");
    value.schemaVersion = "article.v4";
    for (const block of value.sections.flatMap((section) => section.blocks)) {
      block.parts = [{ id: `${block.id}-part`, kind: "markdown", markdown: block.contentMarkdown }];
      block.contentMarkdown = "";
    }
    return value;
  }

  it("rejects part anchors reused by different blocks before Diktat authoring", () => {
    const value = article();
    const blocks = value.sections.flatMap((section) => section.blocks);
    blocks[1].parts![0].id = blocks[0].parts![0].id;
    const result = validateProductBundle(buildTestBundleBytes([value], "product-bundle.v4"));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues[0].code).toBe("ARTICLE_PART_ID_DUPLICATE");
  });

  it("hashes canonical visual references before returning an edited draft", () => {
    const value = article();
    value.visuals = [{ ...structuredClone(LIMIT_EPSILON_DELTA_GRAPH), id: "visual-a" }, { ...structuredClone(LIMIT_EPSILON_DELTA_GRAPH), id: "visual-b" }];
    value.sections[0].blocks[0].parts!.push({ id: "visual-part", kind: "visual_ref", visualId: "visual-a" });
    const parsed = validateProductBundle(buildTestBundleBytes([value], "product-bundle.v4"));
    if (!parsed.success) throw new Error(JSON.stringify(parsed.issues));
    const draft = createProductBundleDraft(parsed.data);
    const edited = draft.products[0];
    if (edited.productType !== "article") throw new Error("expected article");
    const part = edited.sections[0].blocks[0].parts!.find((part) => part.kind === "visual_ref");
    if (!part || part.kind !== "visual_ref") throw new Error("expected visual");
    part.visualId = "visual-b";
    const finalized = finalizeProductBundleDraft(parsed.data, draft);
    const second = finalizeProductBundleDraft(finalized.bundle, createProductBundleDraft(finalized.bundle));
    expect(second.bundle.products[0].generationHash).toBe(finalized.bundle.products[0].generationHash);
    const updated = finalized.bundle.products[0];
    if (updated.productType !== "article") throw new Error("expected article");
    expect(updated.sections[0].blocks[0].visualIds).toEqual(["visual-b"]);
  });
});
