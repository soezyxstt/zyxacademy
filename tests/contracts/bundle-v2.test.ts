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

function buildTestBundleBytes(products: ProductEntity[], schemaVersion: "product-bundle.v2" | "product-bundle.v3" = "product-bundle.v3"): Uint8Array {
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

    const manifestInvalid = { ...manifestV3, schemaVersion: "product-bundle.v4" };
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
