import { contractChromiumPath } from "../helpers/chromium";
import { describe, expect, test, beforeEach, afterAll } from "bun:test";
import { mock } from "bun:test";
import type { ArticleDocument } from "@/lib/materials/article-contract";
import { EIGENVALUES_ARTICLE_FIXTURE } from "../fixtures/product-learning/eigenvalues";
import { TCP_HANDSHAKE_ARTICLE_FIXTURE } from "../fixtures/product-learning/tcp-handshake";
import { createPostgresTestDb } from "../helpers/postgres";
import { and, eq } from "drizzle-orm";
import { zipSync } from "fflate";
import * as schema from "@/db/schema";
import {
  computeProductBundleChecksum,
  deterministicProductSerialization,
  validateProductBundle,
  type ProductDependency,
  type ProductEntity,
} from "@/lib/bundle/product-validator";
import { provisionPenggunaForNewUser } from "@/lib/auth/authorization";
import { stageProductBundle, reviewProductBundle } from "@/lib/bundle/product-staging";
import { assertLiveProductBundleDependencies, publishProductBundle as publishProductBundleService, withdrawProductBundle } from "@/lib/bundle/product-publication";
import { evaluateProductBundleQualityPolicy } from "@/lib/bundle/product-review-gate";
import {
  QUALITY_POLICY_VERSION,
  computePedagogyContentFingerprint,
} from "@/lib/materials/quality-policy";
import { LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL } from "../fixtures/product-learning/human-rubric-cases";
import {
  LIMIT_ARTICLE_FIXTURE,
  LIMIT_EPSILON_DELTA_GRAPH,
} from "../fixtures/product-learning/limit-epsilon-delta";
import { compileArticleProduct } from "@/lib/materials/compiler";
import {
  canDownloadProductDiktat,
  compileProductDiktatHtml,
} from "@/lib/bundle/product-diktat-pdf";
import { inspectProductDiktatPdf } from "@/lib/compute/product-diktat-inspector";
import { chromium } from "playwright";


// Each fixture acts on the revision it just read, matching the service's caller contract.
async function publishProductBundle(input: Omit<Parameters<typeof publishProductBundleService>[0], "expectedRevision"> & { expectedRevision?: string }) {
  const [row] = await testDb.select({ checksum: schema.imporBundle.checksum }).from(schema.imporBundle).where(eq(schema.imporBundle.id, input.importId));
  return publishProductBundleService({ ...input, expectedRevision: input.expectedRevision ?? row?.checksum ?? "" });
}

const storageMap = new Map<string, Uint8Array>();
const mockStorage = {
  upload: async (
    file: Uint8Array | Buffer | { arrayBuffer: () => Promise<ArrayBuffer> },
    filename: string,
    _mimeType: string,
    options?: { key?: string; metadata?: Record<string, unknown> },
  ) => {
    const key = options?.key ?? filename;
    let bytes: Uint8Array;
    if (file instanceof Uint8Array) {
      bytes = file;
    } else if (Buffer.isBuffer(file)) {
      bytes = new Uint8Array(file);
    } else {
      bytes = new Uint8Array(await file.arrayBuffer());
    }
    storageMap.set(key, bytes);
    return { url: `memory://${key}`, key, size: bytes.byteLength };
  },
  delete: async (key: string) => {
    storageMap.delete(key);
  },
  getUrl: (key: string) => `memory://${key}`,
  exists: async (key: string) => storageMap.has(key),
  download: async (key: string) => {
    const data = storageMap.get(key);
    if (!data)
      throw new Error(
        `PRODUCT_BUNDLE_STORAGE_DOWNLOAD_UNAVAILABLE:${key}`,
      );
    return data;
  },
  copy: async (sourceKey: string, destKey: string) => {
    const data = storageMap.get(sourceKey);
    if (!data) throw new Error(`Source not found: ${sourceKey}`);
    storageMap.set(destKey, data);
    return { url: `memory://${destKey}`, key: destKey };
  },
};

const { client, testDb } = await createPostgresTestDb();

mock.module("@/db", () => ({ db: testDb }));
mock.module("@/lib/storage", () => ({ storage: mockStorage }));
mock.module("@/lib/vector-sync-dispatch", () => ({ dispatchVectorSync: async () => undefined }));

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function sha(bytes: Uint8Array): string {
  return Bun.CryptoHasher.hash("sha256", bytes, "hex");
}

function buildBundleZip(
  products: ProductEntity[],
  dependencies: ProductDependency[] = [],
  bundleId = "product-bundle-cp2",
  schemaVersion: "product-bundle.v2" | "product-bundle.v3" = "product-bundle.v3",
): {
  bytes: Uint8Array;
  checksum: string;
  bundleId: string;
  validation: Extract<
    ReturnType<typeof validateProductBundle>,
    { success: true }
  >["data"];
} {
  const encode = (value: unknown) =>
    new TextEncoder().encode(
      `${deterministicProductSerialization(value)}\n`,
    );
  const files = new Map<string, Uint8Array>();
  const productBytes = encode(products);
  const dependencyBytes = encode(dependencies);
  files.set("entities/products.json", productBytes);
  files.set("entities/dependencies.json", dependencyBytes);

  const manifestBase = {
    bundleId,
    bundleType: "product" as const,
    schemaVersion,
    courseId: "course-cp2",
    entityFiles: [
      {
        path: "entities/products.json",
        entityType: "products" as const,
        checksum: sha(productBytes),
        stableIds: products.map((product) => String(product.id)),
      },
      {
        path: "entities/dependencies.json",
        entityType: "dependencies" as const,
        checksum: sha(dependencyBytes),
        stableIds: dependencies.map((dependency) => dependency.id),
      },
    ],
    creatorId: "user-admin-1",
    curatorId: "user-admin-1",
    createdAt: "2026-09-05T00:00:00.000Z",
    conflicts: [],
  };

  const checksum = computeProductBundleChecksum(manifestBase, files);
  const manifest = { ...manifestBase, bundleChecksum: checksum };
  files.set("manifest.json", encode(manifest));

  const zipBytes = zipSync(Object.fromEntries(files));
  const validation = validateProductBundle(zipBytes);
  if (!validation.success) {
    throw new Error(
      `Fixture validation failed: ${JSON.stringify(validation.issues)}`,
    );
  }

  return {
    bytes: zipBytes,
    checksum,
    bundleId,
    validation: validation.data,
  };
}

function createV3Article(
  articleId = "article-cp2-001",
  customText?: string,
  fixture: ArticleDocument = LIMIT_ARTICLE_FIXTURE,
): Extract<ProductEntity, { productType: "article" }> {
  const cloned = structuredClone(fixture);
  const clonedGraph = structuredClone(LIMIT_EPSILON_DELTA_GRAPH);
  const sourceRef = {
    sourceId: "source-cp2-001",
    version: 1,
    checksum: HASH_B,
    excerptIds: ["ex-cp2-1"],
  };

  return {
    id: articleId,
    productType: "article",
    slug: `${articleId}-slug`,
    title: cloned.title,
    courseId: "course-cp2",
    version: 1,
    status: "draft",
    ideaLinks: [
      {
        id: "idea-limit-cp2",
        version: 1,
        semanticHash: HASH_A,
        weight: 1,
        role: "primary",
      },
    ],
    sourceRefs: [sourceRef],
    schemaVersion: "1.0",
    sourceHash: HASH_B,
    generationHash: cloned.generationHash,
    creatorId: "user-admin-1",
    curatorId: "user-admin-1",
    blocks: [],
    sections: cloned.sections.map((s) => ({
      id: s.id,
      kind: s.kind,
      learningSectionId: s.kind === "topic" ? "ls-limit-cp2" : undefined,
      parentSectionId: s.parentSectionId,
      title: s.title,
      slug: s.slug,
      orderIndex: s.orderIndex,
      learningObjective: s.learningObjective,
      ideaIds: ["idea-limit-cp2"],
      sourceRefs: [sourceRef],
      pedagogy: s.pedagogy ? structuredClone(s.pedagogy) : undefined,
      blocks: s.blocks.map((b) => ({
        id: b.id,
        blockType: b.blockType,
        title: b.title,
        orderIndex: b.orderIndex,
        contentMarkdown:
          customText && b.id === "block-ed-exp-def" ? customText : b.content,
        ideaIds: ["idea-limit-cp2"],
        sourceRefs: [sourceRef],
        workedExamplePayload: b.workedExamplePayload
          ? structuredClone(b.workedExamplePayload)
          : undefined,
        formativeCheckPayload: b.formativeCheckPayload
          ? structuredClone(b.formativeCheckPayload)
          : undefined,
      })),
    })),
    visuals: fixture === LIMIT_ARTICLE_FIXTURE ? [clonedGraph] : structuredClone(fixture.visuals),
  };
}

function createDiktat(
  article: Extract<ProductEntity, { productType: "article" }>,
  diktatId = "diktat-cp2-001",
  generationHash = HASH_A,
): Extract<ProductEntity, { productType: "diktat" }> {
  return {
    id: diktatId,
    productType: "diktat",
    title: `Diktat: ${article.title}`,
    courseId: article.courseId,
    version: 1,
    status: "draft",
    ideaLinks: structuredClone(article.ideaLinks),
    sourceRefs: structuredClone(article.sourceRefs),
    schemaVersion: "1.0",
    sourceHash: article.sourceHash,
    generationHash,
    creatorId: "user-admin-1",
    curatorId: "user-admin-1",
    contentMarkdown: "# Diktat Limit\n\nRangkuman materi kalkulus limit.",
    sourceArticleId: article.id,
    sourceArticleVersion: article.version,
    sourceArticleHash: article.generationHash,
  };
}

function createDiktatDependency(
  article: Extract<ProductEntity, { productType: "article" }>,
  diktat: Extract<ProductEntity, { productType: "diktat" }>,
): ProductDependency {
  return {
    id: `dep-${diktat.id}-${article.id}`,
    upstreamEntityType: "product",
    upstreamEntityId: article.id,
    upstreamVersion: article.version,
    upstreamHash: article.generationHash,
    downstreamEntityType: "diktat",
    downstreamEntityId: diktat.id,
    downstreamVersion: diktat.version,
    downstreamHash: diktat.generationHash,
    freshness: "UP_TO_DATE",
  };
}

function loadNormalizedCp7Rehearsal(runName: string): {
  article: Extract<ProductEntity, { productType: "article" }>;
  diktat: Extract<ProductEntity, { productType: "diktat" }>;
} {
  const fixtures: Record<string, ArticleDocument> = {
    "limit-a": LIMIT_ARTICLE_FIXTURE,
    "limit-b": LIMIT_ARTICLE_FIXTURE,
    eigen: EIGENVALUES_ARTICLE_FIXTURE,
    tcp: TCP_HANDSHAKE_ARTICLE_FIXTURE,
  };
  const fixture = fixtures[runName];
  if (!fixture) throw new Error(`REHEARSAL_FIXTURE_MISSING:${runName}`);
  const article = createV3Article(`article-${runName}`, undefined, fixture);
  const diktat = createDiktat(article, `diktat-${runName}`);
  diktat.contentMarkdown = article.sections.map((section, index) =>
    `${index === Math.ceil(article.sections.length / 2) ? "<!-- page-break -->\n\n" : ""}## ${section.title}\n\n${section.blocks.map(block => block.contentMarkdown).join("\n\n")}`,
  ).join("\n\n");

  const sourceRef = {
    sourceId: "source-cp2-001",
    version: 1,
    checksum: HASH_B,
    excerptIds: ["ex-cp2-1"],
  };
  const ideaLink = {
    id: "idea-limit-cp2",
    version: 1,
    semanticHash: HASH_A,
    weight: 1,
    role: "primary" as const,
  };

  article.courseId = "course-cp2";
  article.chapterId = "bab-cp2-001";
  article.creatorId = "user-admin-1";
  article.curatorId = "user-admin-1";
  article.ideaLinks = [ideaLink];
  article.sourceRefs = [sourceRef];
  article.sourceHash = HASH_B;
  article.sections = article.sections.map((section) => ({
    ...section,
    learningSectionId: section.kind === "topic" ? "ls-limit-cp2" : undefined,
    ideaIds: [ideaLink.id],
    sourceRefs: [sourceRef],
    blocks: section.blocks.map((block) => ({
      ...block,
      ideaIds: [ideaLink.id],
      sourceRefs: [sourceRef],
    })),
  }));

  diktat.courseId = article.courseId;
  diktat.chapterId = article.chapterId;
  diktat.creatorId = "user-admin-1";
  diktat.curatorId = "user-admin-1";
  diktat.ideaLinks = structuredClone(article.ideaLinks);
  diktat.sourceRefs = structuredClone(article.sourceRefs);
  diktat.sourceHash = article.sourceHash;
  diktat.sourceArticleId = article.id;
  diktat.sourceArticleVersion = article.version;
  diktat.sourceArticleHash = article.generationHash;

  return { article, diktat };
}

describe("CP2 Publication Integration Contract", () => {
  afterAll(async () => { await client.close(); });

  beforeEach(async () => {
    storageMap.clear();

    await client.exec('TRUNCATE TABLE "user", courses, mata_kuliah, peran CASCADE');

    // Setup course
    await client.query("INSERT INTO courses (id, title, category, description) VALUES ($1, $2, $3, $4)", ["course-cp2", "Kalkulus CP2", "Matematika", "Deskripsi Kalkulus"]);
    await client.query("INSERT INTO mata_kuliah (id, code, title, status, legacy_course_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, now(), now())", ["mk-cp2", "KAL-CP2", "Kalkulus CP2", "active", "course-cp2"]);

    // Setup admin users
    await client.query("INSERT INTO \"user\" (id, name, email, email_verified, role, created_at, updated_at) VALUES ($1, $2, $3, true, 'admin', now(), now())", ["user-admin-1", "Admin One", "admin1@example.test"]);
    await provisionPenggunaForNewUser({ id: "user-admin-1", role: "admin" });

    await client.query("INSERT INTO \"user\" (id, name, email, email_verified, role, created_at, updated_at) VALUES ($1, $2, $3, true, 'admin', now(), now())", ["user-other-admin", "Other Admin", "other@example.test"]);
    await provisionPenggunaForNewUser({
      id: "user-other-admin",
      role: "admin",
    });

    // Setup Chapter
    await testDb.insert(schema.bab).values({
      id: "bab-cp2-001",
      mataKuliahId: "mk-cp2",
      code: "BAB-1",
      title: "Bab 1 Limit",
      orderIndex: 0,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Setup Bagian Pembelajaran
    await testDb.insert(schema.bagianPembelajaran).values({
      id: "ls-limit-cp2",
      mataKuliahId: "mk-cp2",
      babId: "bab-cp2-001",
      stableKey: "key-ls-limit",
      title: "Bagian Pembelajaran Limit",
      slug: "ls-limit-slug",
      orderIndex: 0,
      learningObjective: "Tujuan pembelajaran limit",
      version: 1,
      status: "published",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Setup published Idea
    await testDb.insert(schema.ide).values({
      id: "idea-limit-cp2",
      mataKuliahId: "mk-cp2",
      babId: "bab-cp2-001",
      stableKey: "key-idea-limit",
      code: "IDE-01",
      canonicalStatement: "Definisi Limit",
      conciseExplanation: "Penjelasan Limit",
      knowledgeKind: "definition",
      instructionalRole: "core",
      difficultyMetadata: {},
      version: 1,
      status: "published",
      sourcePolicy: "source_grounded",
      schemaVersion: "1.0",
      semanticHash: HASH_A,
      generationHash: HASH_A,
      creatorId: "user-admin-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Setup active Source Material and Excerpt
    await testDb.insert(schema.sumberMateri).values({
      id: "source-cp2-001",
      mataKuliahId: "mk-cp2",
      babId: "bab-cp2-001",
      sourceType: "markdown",
      title: "Buku Sumber Limit",
      canonicalUriOrR2Key: "courses/source-1.md",
      version: 1,
      checksum: HASH_B,
      status: "active",
      creatorId: "user-admin-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await testDb.insert(schema.potonganSumber).values({
      id: "ex-cp2-1",
      sumberMateriId: "source-cp2-001",
      sourceVersion: 1,
      content: "Kutipan teks limit.",
      startOffset: 0,
      endOffset: 100,
      checksum: HASH_B,
      embeddingEligible: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  async function stageTestBundle(
    article: Extract<ProductEntity, { productType: "article" }>,
    diktat: Extract<ProductEntity, { productType: "diktat" }>,
    bundleId = "bundle-cp2-001",
    runId = "run-001",
  ) {
    const dep = createDiktatDependency(article, diktat);
    const fixture = buildBundleZip([article, diktat], [dep], bundleId);
    const staged = await stageProductBundle({
      runId,
      bundleId: fixture.bundleId,
      courseId: "course-cp2",
      checksum: fixture.checksum,
      bytes: fixture.bytes,
      requestedBy: "user-admin-1",
      bundle: fixture.validation,
    });
    return { staged, fixture };
  }

  async function seedApprovalRecords(params: {
    importId: string;
    article: Extract<ProductEntity, { productType: "article" }>;
    diktat?: Extract<ProductEntity, { productType: "diktat" }>;
    reviewerId?: string;
    pedagogicReviewerId?: string;
    pdfStatus?: "ready" | "stale" | "pending" | "failed";
    preservePdfEvidence?: boolean;
  }) {
    const reviewerId = params.reviewerId ?? "user-admin-1";
    const pedagogicReviewerId = params.pedagogicReviewerId ?? reviewerId;
    const pdfStatus = params.pdfStatus ?? "ready";
    const now = new Date();

    // 1. Admin review bundle
    await testDb.insert(schema.reviewBundle).values({
      id: `rev-bundle-${params.importId}`,
      imporBundleId: params.importId,
      reviewerId,
      status: "approved",
      reviewedAt: now,
      createdAt: now,
    });

    // 2. Section reviews
    for (const section of params.article.sections) {
      await testDb.insert(schema.reviewItemBundle).values({
        id: `rev-sec-${params.importId}-${section.id}`,
        imporBundleId: params.importId,
        reviewerId,
        productId: params.article.id,
        targetType: "article_section",
        targetId: section.id,
        status: "approved",
        createdAt: now,
        updatedAt: now,
      });
    }

    // 3. Eight-criterion pedagogic review
    const fp = computePedagogyContentFingerprint({
      article: params.article as unknown as Record<string, unknown>,
      diktat: params.diktat
        ? (params.diktat as unknown as Record<string, unknown>)
        : undefined,
    });
    await testDb.insert(schema.reviewPedagogiBundle).values({
      id: `rev-ped-${params.importId}`,
      imporBundleId: params.importId,
      reviewerId: pedagogicReviewerId,
      contentFingerprint: fp,
      policyVersion: QUALITY_POLICY_VERSION,
      status: "approved",
      rubric: {
        criteria: LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL.criteria.map((criterion) => ({
          ...criterion,
          contentAnchors: [
            { targetType: "document" as const, targetId: params.article.id },
          ],
        })),
      },
      exceptions: [],
      notes: "Memenuhi semua 8 kriteria.",
      createdAt: now,
    });

    // 4. PDF evidence
    if (params.preservePdfEvidence) return;
    const pdfProductId = params.diktat ? params.diktat.id : params.article.id;
    await testDb.insert(schema.buktiPdfBundle).values({
      id: `pdf-${params.importId}-${pdfProductId}`,
      imporBundleId: params.importId,
      productId: pdfProductId,
      articleVersion: params.article.version,
      articleHash: params.article.generationHash,
      diktatHash: params.diktat ? params.diktat.generationHash : params.article.generationHash,
      rendererVersion: "zyx-pdf-v1",
      printProfile: "a4_standard",
      status: pdfStatus,
      storageKey: `courses/course-cp2/materials/${pdfProductId}.pdf`,
      pageCount: 3,
      createdAt: now,
      updatedAt: now,
    });
  }

  test("publishes the same Article-owned legacy PDF accepted by the shared gate", async () => {
    const article = createV3Article("article-legacy-pdf-owner");
    const diktat = createDiktat(article, "diktat-legacy-pdf-owner");
    const { staged, fixture } = await stageTestBundle(article, diktat, "bundle-legacy-pdf-owner");
    await seedApprovalRecords({ importId: staged.importId, article, diktat });
    const key = "courses/course-cp2/materials/legacy-article.pdf";
    await testDb.update(schema.buktiPdfBundle).set({ productId: article.id, storageKey: key }).where(eq(schema.buktiPdfBundle.imporBundleId, staged.importId));
    const quality = await evaluateProductBundleQualityPolicy([article, diktat], { imporBundleId: staged.importId, publisherId: "user-admin-1", tx: testDb });
    expect(quality.publicationReady).toBe(true);
    await publishProductBundle({ importId: staged.importId, publishedBy: "user-admin-1", expectedRevision: fixture.checksum });
    const [published] = await testDb.select().from(schema.diktatMateri).where(eq(schema.diktatMateri.id, diktat.id));
    expect(published.fileKey).toBe(key);
  });

  for (const failure of ["missing-approval", "failed-pdf", "missing-section"] as const) {
    test(`does not create a legacy approval when ${failure} blocks publication`, async () => {
      const article = createV3Article();
      const diktat = createDiktat(article);
      const { staged } = await stageTestBundle(article, diktat);
      await seedApprovalRecords({ importId: staged.importId, article, diktat });
      await testDb.delete(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, staged.importId));
      if (failure === "missing-approval") await testDb.delete(schema.reviewPedagogiBundle).where(eq(schema.reviewPedagogiBundle.imporBundleId, staged.importId));
      if (failure === "failed-pdf") await testDb.update(schema.buktiPdfBundle).set({ status: "failed" }).where(eq(schema.buktiPdfBundle.imporBundleId, staged.importId));
      if (failure === "missing-section") await testDb.delete(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.imporBundleId, staged.importId));
      await expect(publishProductBundle({ importId: staged.importId, publishedBy: "user-admin-1" })).rejects.toThrow();
      expect(await testDb.select().from(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, staged.importId))).toHaveLength(0);
    });
  }
  test("requires an explicit bundle approval in addition to the current pedagogic approval", async () => {
    const article = createV3Article();
    const diktat = createDiktat(article);
    const { staged } = await stageTestBundle(article, diktat);

    await seedApprovalRecords({
      importId: staged.importId,
      article,
      diktat,
    });

    await testDb.delete(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, staged.importId));
    await expect(publishProductBundle({ importId: staged.importId, publishedBy: "user-admin-1" })).rejects.toThrow("PRODUCT_BUNDLE_ADMIN_APPROVAL_REQUIRED");
    await testDb.insert(schema.reviewBundle).values({ id: `rev-bundle-${staged.importId}`, imporBundleId: staged.importId, reviewerId: "user-admin-1", status: "approved" });
    const pubResult = await publishProductBundle({
      importId: staged.importId,
      publishedBy: "user-admin-1",
    });

    expect(pubResult.published).toBe(true);
    expect(pubResult.productCount).toBe(2);

    // Verify artikel row
    const [articleRow] = await testDb
      .select()
      .from(schema.artikel)
      .where(eq(schema.artikel.id, article.id));
    expect(articleRow).toBeDefined();
    expect(articleRow.status).toBe("published");
    expect(articleRow.structureStatus).toBe("structured");

    // Verify bagian artikel rows
    const sectionRows = await testDb
      .select()
      .from(schema.bagianArtikel)
      .where(eq(schema.bagianArtikel.artikelId, article.id));
    expect(sectionRows).toHaveLength(article.sections.length);
    expect(sectionRows[0].status).toBe("published");

    // Verify diktat row
    const [diktatRow] = await testDb
      .select()
      .from(schema.diktatMateri)
      .where(eq(schema.diktatMateri.id, diktat.id));
    expect(diktatRow).toBeDefined();
    expect(diktatRow.status).toBe("published");
    expect(diktatRow.fileKey).toBe(`courses/course-cp2/materials/${diktat.id}.pdf`);

    // Verify import status
    const [importRow] = await testDb
      .select()
      .from(schema.imporBundle)
      .where(eq(schema.imporBundle.id, staged.importId));
    expect(importRow.status).toBe("published");

    // Verify vectorSyncQueue
    const vectorRows = await testDb.select().from(schema.vectorSyncQueue);
    expect(vectorRows.length).toBeGreaterThan(0);
  });

  test("whole-bundle review cannot auto-approve Article sections", async () => {
    const article = createV3Article("article-auto-approve");
    const diktat = createDiktat(article, "diktat-auto-approve");
    const { staged } = await stageTestBundle(
      article,
      diktat,
      "bundle-auto-approve",
    );

    // Prior to bundle approval, no sections are reviewed
    const beforeReviews = await testDb
      .select()
      .from(schema.reviewItemBundle)
      .where(eq(schema.reviewItemBundle.imporBundleId, staged.importId));
    expect(beforeReviews).toHaveLength(0);

    // Admin approves the bundle overall
    await expect(reviewProductBundle({
      importId: staged.importId,
      reviewerId: "user-admin-1",
      decision: "approved",
      expectedRevision: staged.checksum,
      notes: "Approve bundle",
    })).rejects.toThrow("PRODUCT_BUNDLE_PEDAGOGIC_REVIEW_REQUIRED");

    // No section decision is inferred from the whole-bundle request.
    const afterReviews = await testDb
      .select()
      .from(schema.reviewItemBundle)
      .where(eq(schema.reviewItemBundle.imporBundleId, staged.importId));
    expect(afterReviews).toHaveLength(0);
  });

  test("whole-bundle review preserves existing explicit section decisions", async () => {
    const article = createV3Article("article-cr-preserve");
    const diktat = createDiktat(article, "diktat-cr-preserve");
    const { staged } = await stageTestBundle(
      article,
      diktat,
      "bundle-cr-preserve",
    );

    const firstSection = article.sections[0];
    await testDb.insert(schema.reviewItemBundle).values({
      id: `rev-sec-${staged.importId}-${firstSection.id}`,
      imporBundleId: staged.importId,
      reviewerId: "user-admin-1",
      productId: article.id,
      blockId: firstSection.id,
      targetType: "article_section",
      targetId: firstSection.id,
      status: "changes_requested",
      notes: "Needs improvement",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Admin approves the bundle overall
    await expect(reviewProductBundle({
      importId: staged.importId,
      reviewerId: "user-admin-1",
      decision: "approved",
      expectedRevision: staged.checksum,
      notes: "Approve bundle",
    })).rejects.toThrow("PRODUCT_BUNDLE_PEDAGOGIC_REVIEW_REQUIRED");

    const reviews = await testDb
      .select()
      .from(schema.reviewItemBundle)
      .where(eq(schema.reviewItemBundle.imporBundleId, staged.importId));
    expect(reviews).toHaveLength(1);

    const crReview = reviews.find((r) => r.targetId === firstSection.id);
    expect(crReview?.status).toBe("changes_requested");

    expect(reviews.filter((r) => r.targetId !== firstSection.id)).toHaveLength(0);
  });

  test("publication is idempotent on retry without duplicating records", async () => {
    const article = createV3Article("article-idempotent");
    const diktat = createDiktat(article, "diktat-idempotent");
    const { staged } = await stageTestBundle(
      article,
      diktat,
      "bundle-idempotent",
    );

    await seedApprovalRecords({
      importId: staged.importId,
      article,
      diktat,
    });

    // First publish
    const firstPub = await publishProductBundle({
      importId: staged.importId,
      publishedBy: "user-admin-1",
    });
    expect(firstPub.published).toBe(true);

    const initialArticleCount = (
      await testDb.select().from(schema.artikel)
    ).length;
    const initialSectionCount = (
      await testDb.select().from(schema.bagianArtikel)
    ).length;
    const initialVectorCount = (
      await testDb.select().from(schema.vectorSyncQueue)
    ).length;

    // Retry publication
    const retryPub = await publishProductBundle({
      importId: staged.importId,
      publishedBy: "user-admin-1",
    });
    expect(retryPub.published).toBe(false);

    const afterArticleCount = (
      await testDb.select().from(schema.artikel)
    ).length;
    const afterSectionCount = (
      await testDb.select().from(schema.bagianArtikel)
    ).length;
    const afterVectorCount = (
      await testDb.select().from(schema.vectorSyncQueue)
    ).length;

    expect(afterArticleCount).toBe(initialArticleCount);
    expect(afterSectionCount).toBe(initialSectionCount);
    expect(afterVectorCount).toBe(initialVectorCount);
  });

  test("blocks publication when reviewer context does not match publisher", async () => {
    const article = createV3Article("article-wrong-actor");
    const diktat = createDiktat(article, "diktat-wrong-actor");
    const { staged } = await stageTestBundle(
      article,
      diktat,
      "bundle-wrong-actor",
    );

    await seedApprovalRecords({
      importId: staged.importId,
      article,
      diktat,
      reviewerId: "user-admin-1",
      pedagogicReviewerId: "user-other-admin",
    });

    await expect(
      publishProductBundle({
        importId: staged.importId,
        publishedBy: "user-admin-1",
      }),
    ).rejects.toThrow(
      "PRODUCT_BUNDLE_PUBLICATION_BLOCKED:REVIEWER_CONTEXT_MISMATCH",
    );
  });

  test("blocks publication when PDF evidence is stale", async () => {
    const article = createV3Article("article-stale-pdf");
    const diktat = createDiktat(article, "diktat-stale-pdf");
    const { staged } = await stageTestBundle(
      article,
      diktat,
      "bundle-stale-pdf",
    );

    await seedApprovalRecords({
      importId: staged.importId,
      article,
      diktat,
      pdfStatus: "stale",
    });

    await expect(
      publishProductBundle({
        importId: staged.importId,
        publishedBy: "user-admin-1",
      }),
    ).rejects.toThrow("PRODUCT_BUNDLE_PUBLICATION_BLOCKED:PDF_EVIDENCE_STALE");
  });

  test("restaging identical content preserves review and PDF evidence", async () => {
    const article = createV3Article("article-preserve");
    const diktat = createDiktat(article, "diktat-preserve");
    const bundleId = "bundle-preserve-test";

    // Stage first time
    const { staged: staged1, fixture } = await stageTestBundle(
      article,
      diktat,
      bundleId,
      "run-001",
    );

    await seedApprovalRecords({
      importId: staged1.importId,
      article,
      diktat,
    });

    // Restage identical bundle under run-002
    await stageProductBundle({
      runId: "run-002",
      bundleId,
      courseId: "course-cp2",
      checksum: fixture.checksum,
      bytes: fixture.bytes,
      requestedBy: "user-admin-1",
      bundle: fixture.validation,
      preserveUnchangedItemReviews: true,
    });

    // Verify pedagogic review is preserved
    const [pedReview] = await testDb
      .select()
      .from(schema.reviewPedagogiBundle)
      .where(eq(schema.reviewPedagogiBundle.imporBundleId, staged1.importId));
    expect(pedReview).toBeDefined();
    expect(pedReview.status).toBe("approved");

    // Verify PDF evidence remains ready
    const [pdfEvidence] = await testDb
      .select()
      .from(schema.buktiPdfBundle)
      .where(eq(schema.buktiPdfBundle.imporBundleId, staged1.importId));
    expect(pdfEvidence).toBeDefined();
    expect(pdfEvidence.status).toBe("ready");
  });

  test("restaging changed content marks PDF evidence stale and invalidates old review", async () => {
    const article1 = createV3Article("article-staleness");
    const diktat1 = createDiktat(article1, "diktat-staleness");
    const bundleId = "bundle-staleness-test";

    // Stage first version
    const { staged: staged1 } = await stageTestBundle(
      article1,
      diktat1,
      bundleId,
      "run-001",
    );

    await seedApprovalRecords({
      importId: staged1.importId,
      article: article1,
      diktat: diktat1,
    });

    // Modify article text to produce content change
    const article2 = createV3Article(
      "article-staleness",
      "Perubahan teks artikel baru yang mengubah konten pedagogis secara material.",
    );
    article2.generationHash = "9".repeat(64);
    const diktat2 = createDiktat(article2, "diktat-staleness", "e".repeat(64));
    const dep2 = createDiktatDependency(article2, diktat2);
    const fixture2 = buildBundleZip([article2, diktat2], [dep2], bundleId);

    // Restage changed bundle under run-002
    await stageProductBundle({
      runId: "run-002",
      bundleId,
      courseId: "course-cp2",
      checksum: fixture2.checksum,
      expectedPreviousChecksum: staged1.checksum,
      bytes: fixture2.bytes,
      requestedBy: "user-admin-1",
      bundle: fixture2.validation,
      preserveUnchangedItemReviews: true,
    });

    // Verify old pedagogic review was invalidated and deleted
    const pedReviews = await testDb
      .select()
      .from(schema.reviewPedagogiBundle)
      .where(eq(schema.reviewPedagogiBundle.imporBundleId, staged1.importId));
    expect(pedReviews).toHaveLength(0);

    // Verify PDF evidence was marked stale
    const [pdfEvidence] = await testDb
      .select()
      .from(schema.buktiPdfBundle)
      .where(eq(schema.buktiPdfBundle.imporBundleId, staged1.importId));
    expect(pdfEvidence).toBeDefined();
    expect(pdfEvidence.status).toBe("stale");
  });

  test("mid-transaction failure via testFailureAfter triggers rollback of all changes", async () => {
    const article = createV3Article("article-rollback");
    const diktat = createDiktat(article, "diktat-rollback");
    const { staged } = await stageTestBundle(
      article,
      diktat,
      "bundle-rollback",
    );

    await seedApprovalRecords({
      importId: staged.importId,
      article,
      diktat,
    });

    // Injected failure after inserting article
    await expect(
      publishProductBundle({
        importId: staged.importId,
        publishedBy: "user-admin-1",
        testFailureAfter: "article",
      }),
    ).rejects.toThrow("PRODUCT_BUNDLE_TEST_FAILURE:article");

    // Verify artikel was rolled back
    const articleRows = await testDb
      .select()
      .from(schema.artikel)
      .where(eq(schema.artikel.id, article.id));
    expect(articleRows).toHaveLength(0);

    // Verify publikasi was not recorded
    const pubRows = await testDb
      .select()
      .from(schema.publikasiBundle)
      .where(eq(schema.publikasiBundle.imporBundleId, staged.importId));
    expect(pubRows).toHaveLength(0);

    // Verify import remains in draft
    const [importRow] = await testDb
      .select()
      .from(schema.imporBundle)
      .where(eq(schema.imporBundle.id, staged.importId));
    expect(importRow.status).toBe("draft");
  });

  test("preserves backwards compatibility for V2 legacy articles during compilation and publishing", async () => {
    const v2Article: Extract<ProductEntity, { productType: "article" }> = {
      id: "article-legacy-v2",
      productType: "article",
      slug: "article-legacy-v2-slug",
      title: "Artikel Kalkulus V2 Tanpa Bagian",
      courseId: "course-cp2",
      version: 1,
      status: "draft",
      ideaLinks: [
        {
          id: "idea-limit-cp2",
          version: 1,
          semanticHash: HASH_A,
          weight: 1,
          role: "primary",
        },
      ],
      sourceRefs: [
        {
          sourceId: "source-cp2-001",
          version: 1,
          checksum: HASH_B,
          excerptIds: ["ex-cp2-1"],
        },
      ],
      schemaVersion: "1.0",
      sourceHash: HASH_B,
      generationHash: HASH_C,
      creatorId: "user-admin-1",
      curatorId: "user-admin-1",
      blocks: [
        "prior_knowledge_activation",
        "problem_introduction",
        "explanation",
        "verbal_representation",
        "mathematical_representation",
        "analogy",
        "worked_example",
        "misconception",
        "application",
        "retrieval_prompt",
        "summary",
        "retrieval_close",
      ].map((blockType, orderIndex) => ({
        id: `block-v2-${orderIndex}`,
        blockType,
        orderIndex,
        content: `${blockType} Penjelasan dasar tanpa section untuk V2 materi limit kalkulus.`,
      })),
      sections: [],
    };

    const fixture = buildBundleZip(
      [v2Article],
      [],
      "bundle-legacy-v2",
      "product-bundle.v2",
    );
    const staged = await stageProductBundle({
      runId: "run-legacy-001",
      bundleId: fixture.bundleId,
      courseId: "course-cp2",
      checksum: fixture.checksum,
      bytes: fixture.bytes,
      requestedBy: "user-admin-1",
      bundle: fixture.validation,
    });

    await seedApprovalRecords({
      importId: staged.importId,
      article: v2Article,
    });

    const pubResult = await publishProductBundle({
      importId: staged.importId,
      publishedBy: "user-admin-1",
    });

    expect(pubResult.published).toBe(true);

    const [articleRow] = await testDb
      .select()
      .from(schema.artikel)
      .where(eq(schema.artikel.id, v2Article.id));
    expect(articleRow).toBeDefined();
    expect(articleRow.structureStatus).toBe("legacy_unreviewed");
    expect(articleRow.status).toBe("published");

    // Legacy article document remains readable and compilable
    const compilation = compileArticleProduct(v2Article);
    expect(compilation.article.blocks).toHaveLength(12);
    expect(compilation.markdown).toContain("Penjelasan dasar tanpa section");
  });

  test("persisted review selection deterministically selects current matching row over adversarial old and wrong-actor rows", async () => {
    const bundleId = "bundle-adversarial-reviews";
    const article = createV3Article("article-adversarial");
    const diktat = createDiktat(article, "diktat-adversarial");
    const { staged } = await stageTestBundle(article, diktat, bundleId);

    const publisherId = "user-admin-1";
    const wrongActorId = "user-other-admin";
    const currentFp = computePedagogyContentFingerprint({
      article: article as unknown as Record<string, unknown>,
      diktat: diktat as unknown as Record<string, unknown>,
    });
    const oldFp = "1".repeat(64);
    const oldPolicyVersion = "0.9.0-draft";

    // Seed all prerequisite approvals (bundle review, section reviews, PDF evidence)
    await seedApprovalRecords({
      importId: staged.importId,
      article,
      diktat,
    });

    // Delete the default pedagogic review so we can insert multiple rows in ADVERSARIAL insertion order:
    await testDb
      .delete(schema.reviewPedagogiBundle)
      .where(eq(schema.reviewPedagogiBundle.imporBundleId, staged.importId));

    // 1. The valid, approved current row is inserted FIRST with an older timestamp.
    await testDb.insert(schema.reviewPedagogiBundle).values({
      id: "ped-review-adversarial-valid-first",
      imporBundleId: staged.importId,
      reviewerId: publisherId,
      contentFingerprint: currentFp,
      policyVersion: QUALITY_POLICY_VERSION,
      status: "approved",
      rubric: { criteria: LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL.criteria },
      exceptions: [],
      notes: "Valid approved review inserted early.",
      createdAt: new Date(Date.now() - 50000),
    });

    // 2. An adversarial row with WRONG ACTOR, but matching fingerprint and policy version, inserted second.
    await testDb.insert(schema.reviewPedagogiBundle).values({
      id: "ped-review-adversarial-wrong-actor",
      imporBundleId: staged.importId,
      reviewerId: wrongActorId,
      contentFingerprint: currentFp,
      policyVersion: QUALITY_POLICY_VERSION,
      status: "rejected",
      rubric: { criteria: LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL.criteria },
      exceptions: [],
      notes: "Adversarial review from unauthorized actor.",
      createdAt: new Date(Date.now() - 30000),
    });

    // 3. A stale row with matching publisherId and policy, but OLD FINGERPRINT, inserted third.
    await testDb.insert(schema.reviewPedagogiBundle).values({
      id: "ped-review-adversarial-stale-fingerprint",
      imporBundleId: staged.importId,
      reviewerId: publisherId,
      contentFingerprint: oldFp,
      policyVersion: QUALITY_POLICY_VERSION,
      status: "rejected",
      rubric: { criteria: LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL.criteria },
      exceptions: [],
      notes: "Stale review with old fingerprint.",
      createdAt: new Date(Date.now() - 20000),
    });

    // 4. A stale row with matching publisherId and fingerprint, but OLD POLICY VERSION, inserted fourth.
    await testDb.insert(schema.reviewPedagogiBundle).values({
      id: "ped-review-adversarial-old-policy",
      imporBundleId: staged.importId,
      reviewerId: publisherId,
      contentFingerprint: currentFp,
      policyVersion: oldPolicyVersion,
      status: "pending",
      rubric: { criteria: LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL.criteria },
      exceptions: [],
      notes: "Stale review with old policy version.",
      createdAt: new Date(Date.now() - 10000),
    });

    // 1. Evaluate with publisherId:
    // PROVE: Despite adversarial rows inserted after the valid row,
    // deterministic selection identifies the valid current row for publisherId and authorizes publication.
    const evalResult = await evaluateProductBundleQualityPolicy([article, diktat], {
      imporBundleId: staged.importId,
      publisherId,
      tx: testDb,
    });
    expect(evalResult.publicationReady).toBe(true);
    expect(evalResult.issues).toHaveLength(0);

    // Publication succeeds!
    const pubResult = await publishProductBundle({
      importId: staged.importId,
      publishedBy: publisherId,
    });
    expect(pubResult.published).toBe(true);

    // 2. PROVE: If evaluated with an actor whose row is NOT approved or wrong,
    // the stale or wrong-actor row does NOT authorize publication.
    const evalWrongActor = await evaluateProductBundleQualityPolicy([article, diktat], {
      imporBundleId: staged.importId,
      publisherId: wrongActorId,
      tx: testDb,
    });
    expect(evalWrongActor.publicationReady).toBe(false);
    const rejectedIssue = evalWrongActor.issues.find(
      (i) => i.code === "PEDAGOGIC_REVIEW_REJECTED",
    );
    expect(rejectedIssue).toBeDefined();

    // 3. PROVE: If the valid row is removed, deterministic fallback chooses the most relevant row
    // and emits the concrete mismatch diagnostic, rather than arbitrary DB ordering.
    await testDb
      .delete(schema.reviewPedagogiBundle)
      .where(eq(schema.reviewPedagogiBundle.id, "ped-review-adversarial-valid-first"));

    const evalFallback = await evaluateProductBundleQualityPolicy([article, diktat], {
      imporBundleId: staged.importId,
      publisherId,
      tx: testDb,
    });
    expect(evalFallback.publicationReady).toBe(false);
    const issueCodes = evalFallback.issues.map((i) => i.code);
    expect(
      issueCodes.includes("POLICY_VERSION_MISMATCH") ||
        issueCodes.includes("FINGERPRINT_MISMATCH"),
    ).toBe(true);
  });

  test("Diktat-only restage marks its ready evidence stale and publication remains blocked until a current Diktat PDF exists", async () => {
    const bundleId = "bundle-diktat-only-staleness";
    const article1 = createV3Article("article-diktat-staleness");
    const diktat1 = createDiktat(article1, "diktat-only-staleness");
    const dep1 = createDiktatDependency(article1, diktat1);
    const fixture1 = buildBundleZip([article1, diktat1], [dep1], bundleId);

    const staged1 = await stageProductBundle({
      runId: "run-diktat-001",
      bundleId,
      courseId: "course-cp2",
      checksum: fixture1.checksum,
      bytes: fixture1.bytes,
      requestedBy: "user-admin-1",
      bundle: fixture1.validation,
    });

    // Seed approved review and ready PDF evidence owned by Diktat
    await seedApprovalRecords({
      importId: staged1.importId,
      article: article1,
      diktat: diktat1,
    });

    // Verify initially publication is ready
    const preCheck = await evaluateProductBundleQualityPolicy([article1, diktat1], {
      imporBundleId: staged1.importId,
      publisherId: "user-admin-1",
      tx: testDb,
    });
    expect(preCheck.publicationReady).toBe(true);

    // Perform a Diktat-only edit: Article is identical, only Diktat is changed (generationHash changed)
    const article2 = structuredClone(article1);
    const diktat2 = createDiktat(article2, "diktat-only-staleness", "7".repeat(64));
    const dep2 = createDiktatDependency(article2, diktat2);
    const fixture2 = buildBundleZip([article2, diktat2], [dep2], bundleId);

    // Restage changed Diktat under run-diktat-002
    await stageProductBundle({
      runId: "run-diktat-002",
      bundleId,
      courseId: "course-cp2",
      checksum: fixture2.checksum,
      expectedPreviousChecksum: staged1.checksum,
      bytes: fixture2.bytes,
      requestedBy: "user-admin-1",
      bundle: fixture2.validation,
      preserveUnchangedItemReviews: true,
    });

    // Verify Diktat PDF evidence in DB is now marked stale
    const [diktatPdfEvidence] = await testDb
      .select()
      .from(schema.buktiPdfBundle)
      .where(
        and(
          eq(schema.buktiPdfBundle.imporBundleId, staged1.importId),
          eq(schema.buktiPdfBundle.productId, diktat2.id),
        ),
      );
    expect(diktatPdfEvidence).toBeDefined();
    expect(diktatPdfEvidence.status).toBe("stale");

    // A content revision requires fresh semantic approval; retain the actual
    // stale PDF row to prove that current review cannot bypass its gate.
    await testDb.delete(schema.reviewBundle).where(eq(schema.reviewBundle.imporBundleId, staged1.importId));
    await testDb.delete(schema.reviewItemBundle).where(eq(schema.reviewItemBundle.imporBundleId, staged1.importId));
    await testDb.delete(schema.reviewPedagogiBundle).where(eq(schema.reviewPedagogiBundle.imporBundleId, staged1.importId));
    await seedApprovalRecords({ importId: staged1.importId, article: article2, diktat: diktat2, preservePdfEvidence: true });

    // Attempt publication: MUST be blocked because PDF evidence is stale
    let pubError: any = null;
    try {
      await publishProductBundle({
        importId: staged1.importId,
        publishedBy: "user-admin-1",
      });
    } catch (err) {
      pubError = err;
    }
    expect(pubError).toBeDefined();
    expect(String(pubError?.message)).toContain("PRODUCT_BUNDLE_PUBLICATION_BLOCKED:PDF_EVIDENCE_STALE");

    // Also verify direct evaluation reports PDF_EVIDENCE_STALE targeting the Diktat product ID
    const evalResult = await evaluateProductBundleQualityPolicy([article2, diktat2], {
      imporBundleId: staged1.importId,
      publisherId: "user-admin-1",
      tx: testDb,
    });
    expect(evalResult.publicationReady).toBe(false);
    const staleIssue = evalResult.issues.find((i) => i.code === "PDF_EVIDENCE_STALE");
    expect(staleIssue).toBeDefined();
    expect(staleIssue?.target.targetId).toBe(diktat2.id);

    // Record fresh Diktat PDF evidence with matching diktatHash and ready status
    await testDb
      .update(schema.buktiPdfBundle)
      .set({
        status: "ready",
        diktatHash: diktat2.generationHash,
        articleHash: article2.generationHash,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.buktiPdfBundle.imporBundleId, staged1.importId),
          eq(schema.buktiPdfBundle.productId, diktat2.id),
        ),
      );

    // Publication now succeeds!
    const successResult = await publishProductBundle({
      importId: staged1.importId,
      publishedBy: "user-admin-1",
    });
    expect(successResult.published).toBe(true);
  });

  test("runs four tracked fixture rehearsals through stage, review, real PDF, publish, and download gates", async () => {
    const browser = await chromium.launch({ executablePath: contractChromiumPath(), args: ["--no-sandbox"] });

    try {
      for (const runName of ["limit-a", "limit-b", "eigen", "tcp"]) {
        const { article, diktat } = loadNormalizedCp7Rehearsal(runName);
        const html = compileProductDiktatHtml({ article, diktat });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "load" });
        const pdfBytes = new Uint8Array(
          await page.pdf({ format: "A4", printBackground: true }),
        );
        await page.close();

        const inspected = await inspectProductDiktatPdf(pdfBytes);
        expect(inspected.pageCount).toBeGreaterThanOrEqual(2);
        expect(inspected.pageCount).toBeLessThanOrEqual(4);
        expect(inspected.text.replace(/\s+/g, " ")).toContain(
          diktat.title.replace(/\s+/g, " "),
        );

        const { staged } = await stageTestBundle(
          article,
          diktat,
          `bundle-cp7-${runName}`,
          `run-cp7-${runName}`,
        );
        await seedApprovalRecords({
          importId: staged.importId,
          article,
          diktat,
          pdfStatus: "ready",
        });

        const evidenceKey = `courses/course-cp2/materials/${diktat.id}.pdf`;
        storageMap.set(evidenceKey, pdfBytes);
        const published = await publishProductBundle({
          importId: staged.importId,
          publishedBy: "user-admin-1",
        });
        expect(published.published).toBe(true);

        const [publishedDiktat] = await testDb
          .select()
          .from(schema.diktatMateri)
          .where(eq(schema.diktatMateri.id, diktat.id));
        expect(publishedDiktat?.status).toBe("published");
        expect(publishedDiktat?.fileKey).toBe(evidenceKey);
        expect(storageMap.get(evidenceKey)?.byteLength).toBe(pdfBytes.byteLength);
        expect(canDownloadProductDiktat({ role: "admin", enrolled: false })).toBe(
          true,
        );
        expect(canDownloadProductDiktat({ role: "student", enrolled: true })).toBe(
          true,
        );
        expect(canDownloadProductDiktat({ role: "student", enrolled: false })).toBe(
          false,
        );
      }
    } finally {
      await browser.close();
    }
  });

  test("persisted PDF evidence selection deterministically elects current-lineage Diktat artifact over adversarial newer wrong-lineage rows", async () => {
    const bundleId = "bundle-adversarial-pdf";
    const article = createV3Article("article-adv-pdf");
    const diktat = createDiktat(article, "diktat-adv-pdf");
    const { staged } = await stageTestBundle(article, diktat, bundleId);
    const publisherId = "user-admin-1";

    await seedApprovalRecords({
      importId: staged.importId,
      article,
      diktat,
    });

    // Delete seeded PDF evidence so we can insert adversarial rows with multiple lineages
    await testDb
      .delete(schema.buktiPdfBundle)
      .where(eq(schema.buktiPdfBundle.imporBundleId, staged.importId));

    const wrongArticleHash = "2".repeat(64);
    const wrongDiktatHash = "3".repeat(64);

    // 1. Insert VALID current-lineage row with an OLDER timestamp
    await testDb.insert(schema.buktiPdfBundle).values({
      id: `pdf-${staged.importId}-valid-older`,
      imporBundleId: staged.importId,
      productId: diktat.id,
      articleVersion: article.version,
      articleHash: article.generationHash,
      diktatHash: diktat.generationHash,
      rendererVersion: "zyx-pdf-v1",
      printProfile: "a4_standard",
      status: "ready",
      storageKey: `courses/course-cp2/materials/${diktat.id}-valid.pdf`,
      pageCount: 3,
      createdAt: new Date(Date.now() - 50000),
      updatedAt: new Date(Date.now() - 50000),
    });

    // 2. Insert ADVERSARIAL wrong-lineage row with a NEWER timestamp and status failed
    await testDb.insert(schema.buktiPdfBundle).values({
      id: `pdf-${staged.importId}-adversarial-newer-failed`,
      imporBundleId: staged.importId,
      productId: diktat.id,
      articleVersion: article.version,
      articleHash: wrongArticleHash,
      diktatHash: wrongDiktatHash,
      rendererVersion: "zyx-pdf-v1",
      printProfile: "a4_standard",
      status: "failed",
      storageKey: `courses/course-cp2/materials/${diktat.id}-wrong.pdf`,
      failureCode: "COMPILE_ERROR",
      pageCount: null,
      createdAt: new Date(Date.now() - 10000),
      updatedAt: new Date(Date.now() - 10000),
    });

    // 3. Insert ADVERSARIAL legacy article-keyed row with current lineage and newest timestamp
    // (PROVE: article-ID row never outranks Diktat-owned evidence)
    await testDb.insert(schema.buktiPdfBundle).values({
      id: `pdf-${staged.importId}-legacy-article-newest`,
      imporBundleId: staged.importId,
      productId: article.id,
      articleVersion: article.version,
      articleHash: article.generationHash,
      diktatHash: diktat.generationHash,
      rendererVersion: "zyx-pdf-v1",
      printProfile: "a4_standard",
      status: "pending",
      storageKey: `courses/course-cp2/materials/${article.id}.pdf`,
      pageCount: 3,
      createdAt: new Date(Date.now()),
      updatedAt: new Date(Date.now()),
    });

    // Positive case:
    // PROVE: Despite newer adversarial rows (failed wrong-lineage and pending article-owned),
    // deterministic election selects the valid older current-lineage Diktat row.
    const evalResult = await evaluateProductBundleQualityPolicy([article, diktat], {
      imporBundleId: staged.importId,
      publisherId,
      tx: testDb,
    });
    expect(evalResult.publicationReady).toBe(true);
    expect(evalResult.issues).toHaveLength(0);

    // Publication succeeds!
    const pubResult = await publishProductBundle({
      importId: staged.importId,
      publishedBy: publisherId,
    });
    expect(pubResult.published).toBe(true);

    // Negative case (no current-lineage row exists):
    // Delete the valid current-lineage row.
    await testDb
      .delete(schema.buktiPdfBundle)
      .where(eq(schema.buktiPdfBundle.id, `pdf-${staged.importId}-valid-older`));

    // PROVE: Fallback selects the target-product row and reports concrete lineage mismatch diagnostics
    const negEval = await evaluateProductBundleQualityPolicy([article, diktat], {
      imporBundleId: staged.importId,
      publisherId,
      tx: testDb,
    });
    expect(negEval.publicationReady).toBe(false);
    const issueCodes = negEval.issues.map((i) => i.code);
    expect(
      issueCodes.includes("PDF_LINEAGE_HASH_MISMATCH") ||
        issueCodes.includes("PDF_EVIDENCE_FAILED"),
    ).toBe(true);
    const targetIssue = negEval.issues.find((i) => i.target.targetType === "pdf");
    expect(targetIssue?.target.targetId).toBe(diktat.id);
  });
  async function stageV2Products(products: ProductEntity[], bundleId: string) {
    const fixture = buildBundleZip(products, [], bundleId, "product-bundle.v2");
    const staged = await stageProductBundle({ runId: `run-${bundleId}`, bundleId, courseId: "course-cp2", checksum: fixture.checksum, bytes: fixture.bytes, requestedBy: "user-admin-1", bundle: fixture.validation });
    const article = products.find((product): product is Extract<ProductEntity, { productType: "article" }> => product.productType === "article");
    if (article) await seedApprovalRecords({ importId: staged.importId, article });
    else await testDb.insert(schema.reviewBundle).values({ id: `approval-${bundleId}`, imporBundleId: staged.importId, reviewerId: "user-admin-1", status: "approved" });
    return staged.importId;
  }

  function cardProducts(setVersion = 1, front = "Apa itu limit?"): ProductEntity[] {
    const common = {
      courseId: "course-cp2", chapterId: "bab-cp2-001", version: 1, status: "draft" as const,
      ideaLinks: [{ id: "idea-limit-cp2", version: 1, semanticHash: HASH_A, weight: 1, role: "primary" as const }],
      sourceRefs: [{ sourceId: "source-cp2-001", version: 1, checksum: HASH_B, excerptIds: ["ex-cp2-1"] }],
      schemaVersion: "1.0", sourceHash: HASH_B, generationHash: HASH_C, creatorId: "user-admin-1", curatorId: "user-admin-1",
    };
    return [
      { ...common, id: "shared-set", productType: "flashcard_set", version: setVersion, title: "Limit", cards: ["shared-card"] },
      { ...common, id: "shared-card", productType: "flashcard", setId: "shared-set", front, back: "Nilai yang didekati", atomic: true },
    ];
  }

  function legacyArticle(): Extract<ProductEntity, { productType: "article" }> {
    const template = createV3Article("shared-article");
    return {
      ...template, visuals: [], sections: [],
      blocks: ["prior_knowledge_activation", "problem_introduction", "explanation", "verbal_representation", "mathematical_representation", "analogy", "worked_example", "misconception", "application", "retrieval_prompt", "summary", "retrieval_close"].map((blockType, orderIndex) => ({
        id: `shared-block-${orderIndex}`, blockType, orderIndex,
        content: `${blockType} Penjelasan dasar tanpa section untuk V2 materi limit kalkulus.`,
      })),
    };
  }

  test("retains shared canonical rows and vector jobs until the final published owner withdraws", async () => {
    const products = [legacyArticle(), ...cardProducts()];
    const first = await stageV2Products(products, "shared-owner-a");
    const second = await stageV2Products(products, "shared-owner-b");
    await publishProductBundle({ importId: first, publishedBy: "user-admin-1" });
    await publishProductBundle({ importId: second, publishedBy: "user-admin-1" });
    const before = await testDb.select().from(schema.vectorSyncQueue);
    expect(before.filter((row) => row.action === "upsert")).toHaveLength(2);
    expect((await withdrawProductBundle({ importId: first, withdrawnBy: "user-admin-1", expectedRevision: (await testDb.select({ checksum: schema.imporBundle.checksum }).from(schema.imporBundle).where(eq(schema.imporBundle.id, first)))[0].checksum })).vectorJobCount).toBe(0);
    expect((await testDb.select().from(schema.artikel).where(eq(schema.artikel.id, "shared-article")))[0].status).toBe("published");
    expect((await testDb.select().from(schema.flashcard).where(eq(schema.flashcard.id, "shared-card")))[0].status).toBe("published");
    expect(await testDb.select().from(schema.vectorSyncQueue)).toHaveLength(before.length);
    expect((await withdrawProductBundle({ importId: second, withdrawnBy: "user-admin-1", expectedRevision: (await testDb.select({ checksum: schema.imporBundle.checksum }).from(schema.imporBundle).where(eq(schema.imporBundle.id, second)))[0].checksum })).vectorJobCount).toBe(1);
    expect((await testDb.select().from(schema.artikel).where(eq(schema.artikel.id, "shared-article")))[0].status).toBe("withdrawn");
    expect((await testDb.select().from(schema.flashcard).where(eq(schema.flashcard.id, "shared-card")))[0].status).toBe("retired");
    expect((await testDb.select().from(schema.vectorSyncQueue)).filter((row) => row.action === "delete")).toHaveLength(1);
    const third = await stageV2Products(products, "shared-owner-c");
    await expect(publishProductBundle({ importId: third, publishedBy: "user-admin-1" })).rejects.toThrow("PRODUCT_BUNDLE_VERSION_CONFLICT");
  });

  test("rejects a changed Article with the same declared hash and detects tampered stored sections", async () => {
    const article = createV3Article("article-projection");
    const diktat = createDiktat(article, "diktat-projection");
    const first = await stageTestBundle(article, diktat, "projection-original");
    await seedApprovalRecords({ importId: first.staged.importId, article, diktat });
    await publishProductBundle({ importId: first.staged.importId, publishedBy: "user-admin-1" });
    const matching = await stageTestBundle(article, diktat, "projection-matching");
    await seedApprovalRecords({ importId: matching.staged.importId, article, diktat });
    expect((await publishProductBundle({ importId: matching.staged.importId, publishedBy: "user-admin-1" })).published).toBe(true);

    const changed = structuredClone(article);
    changed.sections[0].blocks[0].title = "Judul blok yang berbeda";
    const changedDraft = await stageTestBundle(changed, diktat, "projection-changed");
    await seedApprovalRecords({ importId: changedDraft.staged.importId, article: changed, diktat });
    const oldBlocks = await testDb.select().from(schema.blokArtikel).where(eq(schema.blokArtikel.artikelId, article.id));
    await expect(publishProductBundle({ importId: changedDraft.staged.importId, publishedBy: "user-admin-1" })).rejects.toThrow(`PRODUCT_BUNDLE_VERSION_CONFLICT:${article.id}`);
    expect(await testDb.select().from(schema.blokArtikel).where(eq(schema.blokArtikel.artikelId, article.id))).toEqual(oldBlocks);

    const identical = await stageTestBundle(article, diktat, "projection-tampered");
    await seedApprovalRecords({ importId: identical.staged.importId, article, diktat });
    await testDb.update(schema.bagianArtikel).set({ learningObjective: "Isi yang berubah" }).where(and(eq(schema.bagianArtikel.artikelId, article.id), eq(schema.bagianArtikel.sectionKey, article.sections[0].id)));
    await expect(publishProductBundle({ importId: identical.staged.importId, publishedBy: "user-admin-1" })).rejects.toThrow(`PRODUCT_BUNDLE_VERSION_CONFLICT:${article.id}`);
  });

  test("rejects Diktat content changes hidden behind unchanged declared hashes and preserves the original PDF", async () => {
    const article = createV3Article("diktat-binding-article");
    const diktat = createDiktat(article, "diktat-binding");
    const first = await stageTestBundle(article, diktat, "diktat-binding-first");
    await seedApprovalRecords({ importId: first.staged.importId, article, diktat });
    await publishProductBundle({ importId: first.staged.importId, publishedBy: "user-admin-1" });
    const original = (await testDb.select().from(schema.diktatMateri).where(eq(schema.diktatMateri.id, diktat.id)))[0];
    const changed = { ...diktat, contentMarkdown: `${diktat.contentMarkdown}\n\nIsi yang berbeda.` };
    const second = await stageTestBundle(article, changed, "diktat-binding-changed");
    await seedApprovalRecords({ importId: second.staged.importId, article, diktat: changed });
    await expect(publishProductBundle({ importId: second.staged.importId, publishedBy: "user-admin-1" })).rejects.toThrow(`PRODUCT_BUNDLE_VERSION_CONFLICT:${diktat.id}`);
    expect((await testDb.select().from(schema.diktatMateri).where(eq(schema.diktatMateri.id, diktat.id)))[0]).toEqual(original);
  });

  test("rejects a V2 Article with an unchanged hash and a different block identity", async () => {
    const article = legacyArticle();
    const first = await stageV2Products([article], "legacy-projection-first");
    await publishProductBundle({ importId: first, publishedBy: "user-admin-1" });
    const changed = structuredClone(article);
    changed.blocks[0].id = "different-block-id";
    const second = await stageV2Products([changed], "legacy-projection-changed");
    await expect(publishProductBundle({ importId: second, publishedBy: "user-admin-1" })).rejects.toThrow(`PRODUCT_BUNDLE_VERSION_CONFLICT:${article.id}`);
    const blocks = await testDb.select().from(schema.blokArtikel).where(eq(schema.blokArtikel.artikelId, article.id));
    expect(blocks).toHaveLength(article.blocks.length);
    expect(blocks.some((block) => block.blockKey === "different-block-id")).toBe(false);
  });

  test("does not reuse a flashcard with different content or a different set version", async () => {
    const first = await stageV2Products(cardProducts(), "cards-original");
    await publishProductBundle({ importId: first, publishedBy: "user-admin-1" });
    const changed = await stageV2Products(cardProducts(1, "Bagaimana limit bekerja?"), "cards-changed");
    await expect(publishProductBundle({ importId: changed, publishedBy: "user-admin-1" })).rejects.toThrow("PRODUCT_BUNDLE_VERSION_CONFLICT:shared-card");
    const nextSet = await stageV2Products(cardProducts(2), "cards-next-set");
    await expect(publishProductBundle({ importId: nextSet, publishedBy: "user-admin-1" })).rejects.toThrow("PRODUCT_BUNDLE_VERSION_CONFLICT:shared-card");
    expect(await testDb.select().from(schema.setFlashcard).where(eq(schema.setFlashcard.id, "shared-set:v2"))).toHaveLength(0);
    expect((await testDb.select().from(schema.flashcard).where(eq(schema.flashcard.id, "shared-card")))[0].setFlashcardId).toBe("shared-set");
    await testDb.update(schema.flashcard).set({ status: "retired" }).where(eq(schema.flashcard.id, "shared-card"));
    const retired = await stageV2Products(cardProducts(), "cards-retired");
    await expect(publishProductBundle({ importId: retired, publishedBy: "user-admin-1" })).rejects.toThrow("PRODUCT_BUNDLE_VERSION_CONFLICT:shared-card");
  });

  test("readiness and publication reject Ideas and sources from another canonical course", async () => {
    await testDb.insert(schema.mataKuliah).values({ id: "other-course", code: "OTHER", title: "Other course", status: "active" });
    const products = cardProducts();
    const importId = await stageV2Products(products, "foreign-trace");
    const readiness = { courseId: "course-cp2", products, dependencies: [] };
    await testDb.update(schema.ide).set({ mataKuliahId: "other-course" }).where(eq(schema.ide.id, "idea-limit-cp2"));
    await expect(assertLiveProductBundleDependencies(readiness)).rejects.toThrow("PRODUCT_BUNDLE_IDEA_NOT_PUBLISHED");
    await expect(publishProductBundle({ importId, publishedBy: "user-admin-1" })).rejects.toThrow("PRODUCT_BUNDLE_IDEA_NOT_PUBLISHED");
    await testDb.update(schema.ide).set({ mataKuliahId: "mk-cp2" }).where(eq(schema.ide.id, "idea-limit-cp2"));
    await testDb.update(schema.sumberMateri).set({ mataKuliahId: "other-course" }).where(eq(schema.sumberMateri.id, "source-cp2-001"));
    await expect(assertLiveProductBundleDependencies(readiness)).rejects.toThrow("PRODUCT_BUNDLE_SOURCE_MISMATCH");
    await expect(publishProductBundle({ importId, publishedBy: "user-admin-1" })).rejects.toThrow("PRODUCT_BUNDLE_SOURCE_MISMATCH");
  });
});
