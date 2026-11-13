import { describe, expect, it, afterAll, beforeEach } from "bun:test";
import { mock, spyOn } from "bun:test";
import { createPostgresTestDb } from "../helpers/postgres";
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
    if (!data) throw new Error(`PRODUCT_BUNDLE_STORAGE_DOWNLOAD_UNAVAILABLE:${key}`);
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
mock.module("@/lib/storage", () => ({
  storage: mockStorage,
  STORAGE_PROVIDER_MODE: "memory",
}));

const {
  stageProductBundle,
  getProductBundleImport,
  listProductBlockReviews,
  upsertProductBlockReview,
  reviewProductBundle,
  discardProductBundleDraft,
  parseStagedProductBundle,
} = await import("@/lib/bundle/product-staging");

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function productBase(id: string, productType: ProductEntity["productType"]): Record<string, unknown> {
  return {
    id,
    productType,
    courseId: "course-008",
    chapterId: "chapter-008",
    version: 1,
    status: "draft",
    ideaLinks: [{ id: "idea-008", version: 1, semanticHash: HASH_A, weight: 1, role: "primary" }],
    sourceRefs: [{ sourceId: "source-008", version: 1, checksum: HASH_B, excerptIds: ["excerpt-008"] }],
    schemaVersion: "1.0",
    sourceHash: HASH_B,
    generationHash: HASH_A,
    creatorId: "creator-008",
    curatorId: "curator-008",
  };
}

function validProducts(): Record<string, unknown>[] {
  return [
    {
      ...productBase("article-008", "article"),
      slug: "article-008",
      title: "Article",
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
        id: `block-${orderIndex}`,
        blockType,
        orderIndex,
        content: `${blockType} content`,
      })),
    },
    {
      ...productBase("diktat-008", "diktat"),
      title: "Diktat",
      contentMarkdown: "# Diktat",
      sourceArticleId: "article-008",
      sourceArticleVersion: 1,
      sourceArticleHash: HASH_A,
    },
    {
      ...productBase("question-008", "question"),
      questionType: "multiple_choice",
      prompt: "What is velocity?",
      options: [
        { id: "a", text: "Displacement over time", isCorrect: true },
        { id: "b", text: "Distance only", isCorrect: false },
      ],
      difficulty: "medium",
      cognitiveLevel: "understand",
      reasoningPattern: "definition",
      itbSource: { referenceId: "itb-ref-008", eventName: "UTS Fisika Dasar ITB 2024" },
      itbCuration: [
        {
          referenceId: "itb-ref-008",
          dimensions: {
            difficulty: "similar",
            format: "similar",
            terminology: "similar",
            reasoningPattern: "similar",
          },
          curatorNote: "Curation fixture",
        },
      ],
    },
    {
      ...productBase("solution-008", "solution"),
      questionId: "question-008",
      content: "Because velocity is displacement over time.",
    },
    {
      ...productBase("set-008", "flashcard_set"),
      title: "Set",
      cards: ["flashcard-008"],
    },
    {
      ...productBase("flashcard-008", "flashcard"),
      front: "What is velocity?",
      back: "Displacement over time",
      atomic: true,
    },
    {
      ...productBase("blueprint-008", "assessment_blueprint"),
      title: "Quiz",
      assessmentType: "quiz",
      chapterIds: ["chapter-008"],
      questionIds: ["question-008"],
    },
  ];
}

function validDependencies(): ProductDependency[] {
  return [
    {
      id: "dependency-diktat-article",
      upstreamEntityType: "product",
      upstreamEntityId: "article-008",
      upstreamVersion: 1,
      upstreamHash: HASH_A,
      downstreamEntityType: "diktat",
      downstreamEntityId: "diktat-008",
      downstreamVersion: 1,
      downstreamHash: HASH_A,
      freshness: "UP_TO_DATE",
    },
  ];
}

function sha(bytes: Uint8Array): string {
  return Bun.CryptoHasher.hash("sha256", bytes, "hex");
}

function buildBundleZip(
  products = validProducts(),
  dependencies: ProductDependency[] = validDependencies(),
  bundleId = "product-bundle-008",
): { bytes: Uint8Array; checksum: string; bundleId: string; validation: Extract<ReturnType<typeof validateProductBundle>, { success: true }>["data"] } {
  const encode = (value: unknown) => new TextEncoder().encode(`${deterministicProductSerialization(value)}\n`);
  const files = new Map<string, Uint8Array>();
  const productBytes = encode(products);
  const dependencyBytes = encode(dependencies);
  files.set("entities/products.json", productBytes);
  files.set("entities/dependencies.json", dependencyBytes);

  const manifestBase = {
    bundleId,
    bundleType: "product" as const,
    schemaVersion: "product-bundle.v2" as const,
    courseId: "course-008",
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
    creatorId: "creator-008",
    curatorId: "curator-008",
    createdAt: "2026-08-03T00:00:00.000Z",
    conflicts: [],
  };

  const checksum = computeProductBundleChecksum(manifestBase, files);
  const manifest = { ...manifestBase, bundleChecksum: checksum };
  files.set("manifest.json", encode(manifest));

  const zipBytes = zipSync(Object.fromEntries(files));
  const validation = validateProductBundle(zipBytes);
  if (!validation.success) {
    throw new Error(`Fixture validation failed: ${JSON.stringify(validation.issues)}`);
  }

  return {
    bytes: zipBytes,
    checksum,
    bundleId,
    validation: validation.data,
  };
}

describe("Product Block Review Service Integration Contract", () => {
  afterAll(async () => { await client.close(); });

  beforeEach(async () => {
    storageMap.clear();
    await client.exec('TRUNCATE TABLE "user", pengguna, courses, mata_kuliah, peran CASCADE');
    for (const id of ["creator-008", "curator-008"]) {
      await client.query('INSERT INTO "user" (id, name, email, role) VALUES ($1, $2, $3, $4)', [id, id, `${id}@example.invalid`, "teacher"]);
      await provisionPenggunaForNewUser({ id, role: "teacher" });
    }

    // Set up course
    await client.query(`INSERT INTO courses (id, title, category, description) VALUES ($1, $2, $3, $4)`, ["course-008", "Fisika Dasar", "Fisika", "Deskripsi Fisika"]);
    await client.query(`INSERT INTO mata_kuliah (id, code, title, status, legacy_course_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, TIMESTAMPTZ '1970-01-01 00:00:00+00', TIMESTAMPTZ '1970-01-01 00:00:00+00')`, ["mk-008", "FIS-008", "Fisika Dasar", "active", "course-008"]);

    // Set up users and roles
    // 1. Admin
    await client.query(`INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at) VALUES ($1, $2, $3, true, 'admin', TIMESTAMPTZ '1970-01-01 00:00:00+00', TIMESTAMPTZ '1970-01-01 00:00:00+00')`, ["user-admin-1", "Admin One", "admin1@example.test"]);
    await provisionPenggunaForNewUser({ id: "user-admin-1", role: "admin" });

    // 2. Assigned Tutor
    await client.query(`INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at) VALUES ($1, $2, $3, true, 'teacher', TIMESTAMPTZ '1970-01-01 00:00:00+00', TIMESTAMPTZ '1970-01-01 00:00:00+00')`, ["user-tutor-assigned", "Tutor Assigned", "tutor_assigned@example.test"]);
    await provisionPenggunaForNewUser({ id: "user-tutor-assigned", role: "teacher" });
    await client.query(`INSERT INTO penugasan_tutor (id, pengguna_id, mata_kuliah_id, status, assignment_scope, created_at, updated_at) VALUES ($1, $2, $3, 'active', 'course', TIMESTAMPTZ '1970-01-01 00:00:00+00', TIMESTAMPTZ '1970-01-01 00:00:00+00')`, ["penugasan-1", "user-tutor-assigned", "mk-008"]);

    // 3. Unassigned Tutor
    await client.query(`INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at) VALUES ($1, $2, $3, true, 'teacher', TIMESTAMPTZ '1970-01-01 00:00:00+00', TIMESTAMPTZ '1970-01-01 00:00:00+00')`, ["user-tutor-unassigned", "Tutor Unassigned", "tutor_unassigned@example.test"]);
    await provisionPenggunaForNewUser({ id: "user-tutor-unassigned", role: "teacher" });

    // 4. Student (murid)
    await client.query(`INSERT INTO "user" (id, name, email, email_verified, role, created_at, updated_at) VALUES ($1, $2, $3, true, 'student', TIMESTAMPTZ '1970-01-01 00:00:00+00', TIMESTAMPTZ '1970-01-01 00:00:00+00')`, ["user-student-1", "Student One", "student1@example.test"]);
    await provisionPenggunaForNewUser({ id: "user-student-1", role: "student" });
  });

  async function stageFixtureBundle(bundleId = "product-bundle-008") {
    const fixture = buildBundleZip(validProducts(), validDependencies(), bundleId);
    const staged = await stageProductBundle({
      runId: "run-001",
      bundleId: fixture.bundleId,
      courseId: "course-008",
      checksum: fixture.checksum,
      bytes: fixture.bytes,
      requestedBy: "user-admin-1",
      bundle: fixture.validation,
    });
    return { staged, fixture };
  }

  async function reviewFixtureBundle(staged: { importId: string }, fixture: ReturnType<typeof buildBundleZip>, reviewerId: string, notes: string) {
    const { executePedagogicReview } = await import("@/lib/bundle/product-pedagogic-review");
    const { productPedagogyFingerprint } = await import("@/lib/bundle/product-review-gate");
    const { PEDAGOGIC_CRITERION_IDS, QUALITY_POLICY_VERSION } = await import("@/lib/materials/quality-policy");
    return executePedagogicReview({ importId: staged.importId, reviewerId, decision: "approved", notes, expectedRevision: fixture.checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: productPedagogyFingerprint(fixture.validation.products), criteria: PEDAGOGIC_CRITERION_IDS.map(criterionId => ({ criterionId, status: "met", contentAnchors: [{ targetType: "document", targetId: "article-008" }], reason: "Reviewed the Article" })), sectionDecisions: [] });
  }

  it("publishes an Article-only legacy revision through real staging, local evidence and shared review without creating a Diktat", async () => {
    await testDb.insert(schema.chapters).values({ id: "legacy-chapter-008", courseId: "course-008", title: "Bab", orderIndex: 1 });
    await testDb.insert(schema.bab).values({ id: "chapter-008", legacyChapterId: "legacy-chapter-008", mataKuliahId: "mk-008", code: "B1", title: "Bab", orderIndex: 1 });
    await testDb.insert(schema.ide).values({ id: "idea-008", mataKuliahId: "mk-008", babId: "chapter-008", stableKey: "idea-008", code: "I1", canonicalStatement: "Ide", conciseExplanation: "Penjelasan", semanticHash: HASH_A, generationHash: HASH_A, status: "published", creatorId: "creator-008" });
    await testDb.insert(schema.sumberMateri).values({ id: "source-008", mataKuliahId: "mk-008", title: "Sumber", canonicalUriOrR2Key: "fixture/source", checksum: HASH_B, status: "active", creatorId: "creator-008" });
    await testDb.insert(schema.potonganSumber).values({ id: "excerpt-008", sumberMateriId: "source-008", sourceVersion: 1, content: "Sumber", startOffset: 0, endOffset: 6, checksum: HASH_B });
    const products = validProducts().filter(product => product.productType === "article");
    products[0].chapterId = "legacy-chapter-008";
    products[0].visuals = [(await import("../fixtures/product-learning/limit-epsilon-delta")).LIMIT_EPSILON_DELTA_GRAPH];
    const blocks = products[0].blocks as Array<{ blockType: string; content: string }>;
    blocks[0].content = `\n${blocks[0].content}`;
    blocks[blocks.length - 1].content += "\n ";
    blocks.find(block => block.blockType === "retrieval_prompt")!.content = JSON.stringify({ content: "Pertanyaan publik", formativeCheckPayload: { checkKind: "multiple_choice", answer: "private-answer-sentinel", explanation: "private-feedback-sentinel", options: [{ id: "a", text: "Pilihan publik A", isCorrect: true }, { id: "b", text: "Pilihan publik B", isCorrect: false }] } });
    const fixture = buildBundleZip(products, [], "article-only-publication");
    const runId = "mcp-run-00000000-0000-4000-8000-000000000001";
    const staged = await stageProductBundle({ runId, bundleId: fixture.bundleId, courseId: "course-008", checksum: fixture.checksum, bytes: fixture.bytes, requestedBy: "user-admin-1", bundle: fixture.validation });
    const inspection = spyOn(await import("@/lib/compute/pdf-inspection"), "inspectPdfText").mockResolvedValue({ pageCount: 1, text: "Synthetic parser boundary fixture" });
    mock.module("@/lib/vector-sync-dispatch", () => ({ dispatchVectorSync: () => {} }));
    try {
      const { generateProductDiktatPdfEvidence } = await import("@/lib/compute/product-diktat-inspector");
      const evidence = await generateProductDiktatPdfEvidence({ importId: staged.importId, requestedBy: "user-admin-1", exactLegacyDraft: { runId, expectedChecksum: fixture.checksum, articleId: "article-008" }, verifyReadback: true, renderer: async html => { expect(html).toContain("explanation content"); return new TextEncoder().encode("%PDF-1.7 synthetic renderer boundary fixture"); } });
      expect(evidence).toMatchObject({ productId: "article-008", status: "ready" });
      await reviewFixtureBundle(staged, fixture, "user-admin-1", "Reviewed the exact Article-only revision");
      const { publishProductBundle } = await import("@/lib/bundle/product-publication");
      expect((await publishProductBundle({ importId: staged.importId, publishedBy: "user-admin-1", expectedRevision: fixture.checksum })).published).toBe(true);
      expect((await getProductBundleImport(staged.importId))?.status).toBe("published");
      expect(await testDb.select().from(schema.diktatMateri)).toHaveLength(0);
      expect((await testDb.select().from(schema.artikel))[0].status).toBe("published");
      const { getCanonicalPublishedTextProduct } = await import("@/lib/articles/structured-repository");
      const publicArticle = await getCanonicalPublishedTextProduct("course-008", "article-008");
      expect(publicArticle?.contentMarkdown).toContain("Pertanyaan publik");
      expect(publicArticle?.contentMarkdown).toContain("Pilihan publik A");
      const indexed = JSON.stringify(await testDb.select().from(schema.vectorSyncQueue));
      expect(indexed).toContain("Pertanyaan publik");
      for (const secret of ["private-answer-sentinel", "private-feedback-sentinel", "isCorrect", "formativeCheckPayload"]) {
        expect(publicArticle?.contentMarkdown).not.toContain(secret);
        expect(indexed).not.toContain(secret);
      }
      const { canonicalOutboxPayload } = await import("@/lib/vectorize/outbox");
      const [articleJob] = await testDb.select().from(schema.vectorSyncQueue);
      const upsert = canonicalOutboxPayload(articleJob);
      if (upsert.operation !== "upsert") throw new Error("Expected publication upsert");
      expect(articleJob.courseId).toBe("course-008");
      expect(upsert.metadata).toMatchObject({ courseId: "mk-008", chapterId: "chapter-008" });
      expect((await testDb.select().from(schema.artikel))[0].contentMarkdown).toContain("__ZYX_V3_ARTICLE_VISUALS__");
      const { vectorStore } = await import("@/lib/vector-store");
      const query = spyOn(vectorStore, "query").mockImplementation(async namespace => namespace === "mk-008_published_articles" ? [{ id: upsert.vectorId, score: 1, metadata: { ...upsert.metadata } }] : []);
      try {
        const { retrieveCanonicalEvidence } = await import("@/lib/zyra/canonical-runtime");
        const retrieval = await retrieveCanonicalEvidence({ courseId: "course-008", chapterId: "chapter-008", isEnrolled: true }, "Pertanyaan");
        expect(retrieval.sources).toHaveLength(1);
        expect(retrieval.rejected).toHaveLength(0);
        expect(retrieval.sources[0].content).not.toContain("__ZYX_V3_ARTICLE_VISUALS__");
      } finally { query.mockRestore(); }
      const { eq } = await import("drizzle-orm");
      const { rehydrateCanonicalSourceIds } = await import("@/lib/zyra/canonical-runtime");
      const { createVersionedVectorId } = await import("@/lib/vectorize/contracts");
      const sourceId = createVersionedVectorId("article", "article-008", 1);
      expect((await rehydrateCanonicalSourceIds({ courseId: "course-008", isEnrolled: true }, [sourceId])).sources).toHaveLength(1);
      let historical = blocks.find(block => block.blockType === "retrieval_prompt")!.content;
      for (let encoding = 0; encoding < 3; encoding++) {
        await testDb.update(schema.artikel).set({ contentMarkdown: `Teks awal\n\n${historical}\n\nTeks akhir` }).where(eq(schema.artikel.id, "article-008"));
        expect(await getCanonicalPublishedTextProduct("course-008", "article-008")).toBeNull();
        expect((await rehydrateCanonicalSourceIds({ courseId: "course-008", isEnrolled: true }, [sourceId])).sources).toHaveLength(0);
        historical = JSON.stringify(historical);
      }
      await testDb.update(schema.artikel).set({ contentMarkdown: 'Intro\n\n{"content":"Question","answer":"private","isCorrect":true}' }).where(eq(schema.artikel.id, "article-008"));
      expect(await getCanonicalPublishedTextProduct("course-008", "article-008")).toBeNull();
      expect((await rehydrateCanonicalSourceIds({ courseId: "course-008", isEnrolled: true }, [sourceId])).sources).toHaveLength(0);
    } finally { inspection.mockRestore(); }
  });

  it("withdraws historical V2 object or array block text using vector identity without public projection", async () => {
    const products = validProducts().filter(product => product.productType === "article");
    const blocks = products[0].blocks as Array<{ content: string }>;
    blocks[0].content = JSON.stringify({ legacy: "Arbitrary historical object" });
    blocks[1].content = JSON.stringify([{ legacy: "Arbitrary historical array" }]);
    const fixture = buildBundleZip(products, [], "historical-opaque-withdrawal");
    const staged = await stageProductBundle({ runId: "old-run", bundleId: fixture.bundleId, courseId: "course-008", checksum: fixture.checksum, bytes: fixture.bytes, requestedBy: "user-admin-1", bundle: fixture.validation });
    const { eq } = await import("drizzle-orm");
    // Historical publication accepted these blocks as literal text. Seed only
    // that historical state; new publication correctly refuses opaque payloads.
    await testDb.update(schema.imporBundle).set({ status: "published" }).where(eq(schema.imporBundle.id, staged.importId));
    await testDb.update(schema.itemImporBundle).set({ status: "published" }).where(eq(schema.itemImporBundle.imporBundleId, staged.importId));
    await testDb.insert(schema.artikel).values({ id: "article-008", mataKuliahId: "mk-008", slug: "historical-opaque", title: "Historical", contentMarkdown: blocks.map(block => block.content).join("\n\n"), status: "published", sourceHash: HASH_B, generationHash: HASH_A, creatorId: "creator-008" });
    mock.module("@/lib/vector-sync-dispatch", () => ({ dispatchVectorSync: () => {} }));
    const { withdrawProductBundle } = await import("@/lib/bundle/product-publication");
    expect(await withdrawProductBundle({ importId: staged.importId, withdrawnBy: "user-admin-1", expectedRevision: fixture.checksum })).toMatchObject({ withdrawn: true, productCount: 1, vectorJobCount: 1 });
    expect((await testDb.select().from(schema.artikel))[0].status).toBe("withdrawn");
    expect((await getProductBundleImport(staged.importId))?.status).toBe("withdrawn");
    const job = (await testDb.select().from(schema.vectorSyncQueue))[0];
    expect(job).toMatchObject({ action: "delete", namespace: "published_articles", payload: { entityType: "article", entityId: "article-008", version: 1 } });
    expect(JSON.stringify(job.payload)).not.toContain("Arbitrary historical");
  });

  it("restaging away a linked Diktat invalidates historical Article-owned PDF fallback evidence", async () => {
    const products = validProducts().filter(product => product.productType === "article" || product.productType === "diktat");
    products.find(product => product.productType === "diktat")!.generationHash = HASH_B;
    const first = buildBundleZip(products, validDependencies().map(dependency => ({ ...dependency, downstreamHash: HASH_B })), "article-topology-change");
    const staged = await stageProductBundle({ runId: "run-topology", bundleId: first.bundleId, courseId: "course-008", checksum: first.checksum, bytes: first.bytes, requestedBy: "user-admin-1", bundle: first.validation });
    await testDb.insert(schema.buktiPdfBundle).values({ id: "article-fallback", imporBundleId: staged.importId, productId: "article-008", articleVersion: 1, articleHash: HASH_A, diktatHash: HASH_B, rendererVersion: "legacy", printProfile: "a4-self-study-readable-v3", status: "ready", storageKey: "historical.pdf", pageCount: 1 });
    const next = buildBundleZip(products.filter(product => product.productType === "article"), [], first.bundleId);
    await stageProductBundle({ runId: "run-topology", bundleId: next.bundleId, courseId: "course-008", checksum: next.checksum, bytes: next.bytes, requestedBy: "user-admin-1", bundle: next.validation, expectedPreviousChecksum: first.checksum });
    expect((await testDb.select().from(schema.buktiPdfBundle))[0].status).toBe("stale");
  });

  it("claims item review and discard against the caller revision and the final review under the transaction lock", async () => {
    const { staged, fixture } = await stageFixtureBundle("review-race");
    const input = { importId: staged.importId, reviewerId: "user-admin-1", productId: "article-008", blockId: "block-0", status: "approved" as const, expectedRevision: fixture.checksum };
    await expect(upsertProductBlockReview({ ...input, expectedRevision: "0".repeat(64) })).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
    await expect(discardProductBundleDraft({ importId: staged.importId, actorId: "user-admin-1", expectedRevision: "0".repeat(64) })).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
    const originalTransaction = testDb.transaction.bind(testDb);
    const race = spyOn(testDb, "transaction").mockImplementationOnce(async (callback: any) => {
      await testDb.insert(schema.reviewBundle).values({ id: "final-before-item-lock", imporBundleId: staged.importId, reviewerId: "user-admin-1", status: "approved", reviewedAt: new Date() });
      return originalTransaction(callback);
    });
    try {
      await expect(upsertProductBlockReview(input)).rejects.toThrow("PRODUCT_BLOCK_REVIEW_IMMUTABLE");
      expect(await listProductBlockReviews(staged.importId, "user-admin-1")).toHaveLength(0);
      expect((await getProductBundleImport(staged.importId))?.checksum).toBe(fixture.checksum);
    } finally { race.mockRestore(); }
  });

  it("requires an exact checksum, full anchored rubric and explicit decisions for shared Article review", async () => {
    const { staged, fixture } = await stageFixtureBundle("strict-review");
    const { executePedagogicReview } = await import("@/lib/bundle/product-pedagogic-review");
    const { productPedagogyFingerprint } = await import("@/lib/bundle/product-review-gate");
    const { PEDAGOGIC_CRITERION_IDS, QUALITY_POLICY_VERSION } = await import("@/lib/materials/quality-policy");
    const base = { importId: staged.importId, reviewerId: "user-admin-1", decision: "approved" as const, expectedRevision: fixture.checksum, policyVersion: QUALITY_POLICY_VERSION, contentFingerprint: productPedagogyFingerprint(fixture.validation.products), criteria: PEDAGOGIC_CRITERION_IDS.map(criterionId => ({ criterionId, status: "met" as const, contentAnchors: [{ targetType: "document" as const, targetId: "article-008" }], reason: "Reviewed the Article" })), sectionDecisions: [] };
    for (const expectedRevision of [undefined, 2, "0".repeat(64)]) await expect(executePedagogicReview({ ...base, expectedRevision })).rejects.toThrow("PRODUCT_BUNDLE_STALE_CONTEXT");
    await expect(executePedagogicReview({ ...base, criteria: [] })).rejects.toThrow("RUBRIC_CRITERION_MISSING");
    await expect(executePedagogicReview({ ...base, sectionDecisions: undefined })).rejects.toThrow("PRODUCT_BUNDLE_REVIEW_CONTEXT_REQUIRED");
    await expect(reviewProductBundle({ importId: staged.importId, reviewerId: "user-admin-1", decision: "approved", expectedRevision: fixture.checksum })).rejects.toThrow("PRODUCT_BUNDLE_PEDAGOGIC_REVIEW_REQUIRED");
    expect(await listProductBlockReviews(staged.importId, "user-admin-1")).toHaveLength(0);
    expect((await executePedagogicReview(base)).ok).toBe(true);
  });

  it("performs idempotent upsert and enforces composite uniqueness", async () => {
    const { staged, fixture } = await stageFixtureBundle();

    // First review insert: changes_requested with notes
    const review1 = await upsertProductBlockReview({
      expectedRevision: fixture.checksum,
      importId: staged.importId,
      reviewerId: "user-tutor-assigned",
      productId: "article-008",
      blockId: "block-0",
      status: "changes_requested",
      notes: "Please improve explanation",
    });

    expect(review1.productId).toBe("article-008");
    expect(review1.blockId).toBe("block-0");
    expect(review1.status).toBe("changes_requested");
    expect(review1.notes).toBe("Please improve explanation");

    // Check listProductBlockReviews returns exactly 1 row
    const reviewsAfterFirst = await listProductBlockReviews(staged.importId, "user-tutor-assigned");
    expect(reviewsAfterFirst).toHaveLength(1);
    expect(reviewsAfterFirst[0].status).toBe("changes_requested");
    expect(reviewsAfterFirst[0].notes).toBe("Please improve explanation");

    // Second review upsert on the same block: update to approved
    const review2 = await upsertProductBlockReview({
      expectedRevision: fixture.checksum,
      importId: staged.importId,
      reviewerId: "user-tutor-assigned",
      productId: "article-008",
      blockId: "block-0",
      status: "approved",
      notes: "Looks good now",
    });

    expect(review2.id).toBe(review1.id);
    expect(review2.status).toBe("approved");
    expect(review2.notes).toBe("Looks good now");

    // Verify still exactly 1 row exists (composite uniqueness)
    const reviewsAfterSecond = await listProductBlockReviews(staged.importId, "user-tutor-assigned");
    expect(reviewsAfterSecond).toHaveLength(1);
    expect(reviewsAfterSecond[0].id).toBe(review1.id);
    expect(reviewsAfterSecond[0].status).toBe("approved");
    expect(reviewsAfterSecond[0].notes).toBe("Looks good now");

    // Multiple distinct blocks for the same reviewer work independently
    await upsertProductBlockReview({
      expectedRevision: fixture.checksum,
      importId: staged.importId,
      reviewerId: "user-tutor-assigned",
      productId: "article-008",
      blockId: "block-1",
      status: "pending",
    });
    const reviewsAll = await listProductBlockReviews(staged.importId, "user-tutor-assigned");
    expect(reviewsAll).toHaveLength(2);
  });

  it("rejects invalid product ID", async () => {
    const { staged, fixture } = await stageFixtureBundle();

    await expect(
      upsertProductBlockReview({
        expectedRevision: fixture.checksum,
        importId: staged.importId,
        reviewerId: "user-tutor-assigned",
        productId: "non-existent-product",
        blockId: "block-0",
        status: "approved",
      }),
    ).rejects.toThrow("PRODUCT_BLOCK_REVIEW_PRODUCT_NOT_FOUND");
  });

  it("rejects invalid block ID", async () => {
    const { staged, fixture } = await stageFixtureBundle();

    await expect(
      upsertProductBlockReview({
        expectedRevision: fixture.checksum,
        importId: staged.importId,
        reviewerId: "user-tutor-assigned",
        productId: "article-008",
        blockId: "non-existent-block",
        status: "approved",
      }),
    ).rejects.toThrow("PRODUCT_BLOCK_REVIEW_BLOCK_NOT_FOUND");
  });

  it("rejects non-article target products", async () => {
    const { staged, fixture } = await stageFixtureBundle();

    // Diktat product target
    await expect(
      upsertProductBlockReview({
        expectedRevision: fixture.checksum,
        importId: staged.importId,
        reviewerId: "user-tutor-assigned",
        productId: "diktat-008",
        blockId: "block-0",
        status: "approved",
      }),
    ).rejects.toThrow("PRODUCT_BLOCK_REVIEW_ARTICLE_REQUIRED");

    // Question product target
    await expect(
      upsertProductBlockReview({
        expectedRevision: fixture.checksum,
        importId: staged.importId,
        reviewerId: "user-tutor-assigned",
        productId: "question-008",
        blockId: "block-0",
        status: "approved",
      }),
    ).rejects.toThrow("PRODUCT_BLOCK_REVIEW_ARTICLE_REQUIRED");
  });

  it("enforces reviewer authorization and course access", async () => {
    const { staged, fixture } = await stageFixtureBundle();

    // Non-existent reviewer
    await expect(
      upsertProductBlockReview({
        expectedRevision: fixture.checksum,
        importId: staged.importId,
        reviewerId: "user-does-not-exist",
        productId: "article-008",
        blockId: "block-0",
        status: "approved",
      }),
    ).rejects.toThrow("PRODUCT_BUNDLE_REVIEW_FORBIDDEN");

    // Reviewer with student role (murid)
    await expect(
      upsertProductBlockReview({
        expectedRevision: fixture.checksum,
        importId: staged.importId,
        reviewerId: "user-student-1",
        productId: "article-008",
        blockId: "block-0",
        status: "approved",
      }),
    ).rejects.toThrow("PRODUCT_BUNDLE_REVIEW_FORBIDDEN");

    // Reviewer with tutor role but not assigned to this course
    await expect(
      upsertProductBlockReview({
        expectedRevision: fixture.checksum,
        importId: staged.importId,
        reviewerId: "user-tutor-unassigned",
        productId: "article-008",
        blockId: "block-0",
        status: "approved",
      }),
    ).rejects.toThrow("PRODUCT_BUNDLE_REVIEW_COURSE_FORBIDDEN");

    // Admin reviewer succeeds even without course-specific assignment
    const adminReview = await upsertProductBlockReview({
      expectedRevision: fixture.checksum,
      importId: staged.importId,
      reviewerId: "user-admin-1",
      productId: "article-008",
      blockId: "block-0",
      status: "approved",
    });
    expect(adminReview.status).toBe("approved");
  });

  for (const assignment of ["canonical", "legacy", "new-canonical-denial"] as const) it(`rejects a tutor review after ${assignment} access changes between preflight and transaction`, async () => {
    const { staged, fixture } = await stageFixtureBundle(`tutor-revocation-${assignment}`);
    const { eq } = await import("drizzle-orm");
    const { dualWriteTutorAssignment, revokeCanonicalTutorCourseAssignments } = await import("@/lib/migrasi/repository-kompatibilitas");
    if (assignment !== "canonical") {
      await testDb.delete(schema.penugasanTutor).where(eq(schema.penugasanTutor.penggunaId, "user-tutor-assigned"));
      await testDb.insert(schema.tutorCourses).values({ id: "revocation-legacy", tutorId: "user-tutor-assigned", courseId: "course-008" });
    }
    const originalTransaction = testDb.transaction.bind(testDb);
    const race = spyOn(testDb, "transaction").mockImplementationOnce(async callback => {
      await originalTransaction(async tx => {
        if (assignment === "new-canonical-denial") await dualWriteTutorAssignment(tx, { id: "revocation-legacy", tutorId: "user-tutor-assigned", courseId: "course-008", status: "revoked" });
        else {
          await revokeCanonicalTutorCourseAssignments(tx, "user-tutor-assigned");
          if (assignment === "legacy") await tx.delete(schema.tutorCourses).where(eq(schema.tutorCourses.tutorId, "user-tutor-assigned"));
        }
      });
      return originalTransaction(callback);
    });
    try {
      await expect(upsertProductBlockReview({ importId: staged.importId, reviewerId: "user-tutor-assigned", expectedRevision: fixture.checksum, productId: "article-008", blockId: "block-0", status: "approved" })).rejects.toThrow("PRODUCT_BUNDLE_REVIEW_COURSE_FORBIDDEN");
      expect(await listProductBlockReviews(staged.importId, "user-tutor-assigned")).toHaveLength(0);
    } finally { race.mockRestore(); }
  });

  it("rejects block reviews on non-draft imports", async () => {
    const { staged, fixture } = await stageFixtureBundle();

    // Manually mark import as published in database
    await client.query(`UPDATE impor_bundle SET status = 'published' WHERE id = $1`, [staged.importId]);

    await expect(
      upsertProductBlockReview({
        expectedRevision: fixture.checksum,
        importId: staged.importId,
        reviewerId: "user-admin-1",
        productId: "article-008",
        blockId: "block-0",
        status: "approved",
      }),
    ).rejects.toThrow("PRODUCT_BLOCK_REVIEW_DRAFT_REQUIRED");
  });

  it("enforces notes length limit (max 2000 chars)", async () => {
    const { staged, fixture } = await stageFixtureBundle();

    // Exactly 2000 characters should succeed
    const validNotes = "x".repeat(2000);
    const review = await upsertProductBlockReview({
      expectedRevision: fixture.checksum,
      importId: staged.importId,
      reviewerId: "user-admin-1",
      productId: "article-008",
      blockId: "block-0",
      status: "changes_requested",
      notes: validNotes,
    });
    expect(review.notes).toHaveLength(2000);

    // 2001 characters should fail
    const longNotes = "x".repeat(2001);
    await expect(
      upsertProductBlockReview({
        expectedRevision: fixture.checksum,
        importId: staged.importId,
        reviewerId: "user-admin-1",
        productId: "article-008",
        blockId: "block-0",
        status: "changes_requested",
        notes: longNotes,
      }),
    ).rejects.toThrow("PRODUCT_BLOCK_REVIEW_NOTES_LIMIT");
  });

  it("freezes block reviews once a whole-bundle decision has been recorded", async () => {
    const { staged, fixture } = await stageFixtureBundle();

    // Reviewer adds a block review before bundle decision
    await upsertProductBlockReview({
      expectedRevision: fixture.checksum,
      importId: staged.importId,
      reviewerId: "user-tutor-assigned",
      productId: "article-008",
      blockId: "block-0",
      status: "approved",
    });

    // Reviewer records bundle-level review decision
    const decision = await reviewFixtureBundle(staged, fixture, "user-tutor-assigned", "Bundle approved by tutor");
    expect(decision.ok).toBe(true);

    // Subsequent block review attempts by this reviewer are rejected (immutable)
    await expect(
      upsertProductBlockReview({
        expectedRevision: fixture.checksum,
        importId: staged.importId,
        reviewerId: "user-tutor-assigned",
        productId: "article-008",
        blockId: "block-0",
        status: "changes_requested",
      }),
    ).rejects.toThrow("PRODUCT_BLOCK_REVIEW_IMMUTABLE");

    await expect(
      upsertProductBlockReview({
        expectedRevision: fixture.checksum,
        importId: staged.importId,
        reviewerId: "user-tutor-assigned",
        productId: "article-008",
        blockId: "block-1",
        status: "approved",
      }),
    ).rejects.toThrow("PRODUCT_BLOCK_REVIEW_IMMUTABLE");
  });

  it("removes all block reviews when bundle draft is discarded", async () => {
    const { staged, fixture } = await stageFixtureBundle();

    await upsertProductBlockReview({
      expectedRevision: fixture.checksum,
      importId: staged.importId,
      reviewerId: "user-tutor-assigned",
      productId: "article-008",
      blockId: "block-0",
      status: "changes_requested",
    });
    await upsertProductBlockReview({
      expectedRevision: fixture.checksum,
      importId: staged.importId,
      reviewerId: "user-admin-1",
      productId: "article-008",
      blockId: "block-1",
      status: "approved",
    });

    const tutorReviewsBefore = await listProductBlockReviews(staged.importId, "user-tutor-assigned");
    expect(tutorReviewsBefore).toHaveLength(1);

    // Discard bundle draft
    const discardResult = await discardProductBundleDraft({
      importId: staged.importId,
      actorId: "user-admin-1",
    });
    expect(discardResult.discarded).toBe(true);

    // Verify import is deleted and block reviews are cleaned up
    const importRow = await getProductBundleImport(staged.importId);
    expect(importRow).toBeNull();

    const tutorReviewsAfter = await listProductBlockReviews(staged.importId, "user-tutor-assigned");
    expect(tutorReviewsAfter).toHaveLength(0);

    const adminReviewsAfter = await listProductBlockReviews(staged.importId, "user-admin-1");
    expect(adminReviewsAfter).toHaveLength(0);
  });

  it("clears block reviews when restaging a changed artifact for the same bundleId", async () => {
    const { staged, fixture } = await stageFixtureBundle("bundle-restage-test");

    // Tutor and Admin add block reviews on initial staged draft
    await upsertProductBlockReview({
      expectedRevision: fixture.checksum,
      importId: staged.importId,
      reviewerId: "user-tutor-assigned",
      productId: "article-008",
      blockId: "block-0",
      status: "changes_requested",
      notes: "Change introduction",
    });

    const reviewsBefore = await listProductBlockReviews(staged.importId, "user-tutor-assigned");
    expect(reviewsBefore).toHaveLength(1);

    // Create modified bundle with changed content
    const modifiedProducts = validProducts();
    (modifiedProducts[0] as { title: string }).title = "Article Modified";
    const modifiedFixture = buildBundleZip(modifiedProducts, validDependencies(), "bundle-restage-test");

    // Restage updated artifact
    const restaged = await stageProductBundle({
      runId: "run-002",
      bundleId: "bundle-restage-test",
      courseId: "course-008",
      checksum: modifiedFixture.checksum,
      expectedPreviousChecksum: fixture.checksum,
      bytes: modifiedFixture.bytes,
      requestedBy: "user-admin-1",
      bundle: modifiedFixture.validation,
    });

    expect(restaged.replaced).toBe(true);
    expect(restaged.checksum).toBe(modifiedFixture.checksum);

    // Verify block reviews have been cleared upon restaging
    const reviewsAfter = await listProductBlockReviews(restaged.importId, "user-tutor-assigned");
    expect(reviewsAfter).toHaveLength(0);
  });

  it("keeps pending and changes_requested block reviews informational without preventing reviewProductBundle approval", async () => {
    const { staged, fixture } = await stageFixtureBundle();

    // Reviewer has multiple block reviews: some pending, some changes_requested
    await upsertProductBlockReview({
      expectedRevision: fixture.checksum,
      importId: staged.importId,
      reviewerId: "user-tutor-assigned",
      productId: "article-008",
      blockId: "block-0",
      status: "changes_requested",
      notes: "Block 0 needs revision",
    });
    await upsertProductBlockReview({
      expectedRevision: fixture.checksum,
      importId: staged.importId,
      reviewerId: "user-tutor-assigned",
      productId: "article-008",
      blockId: "block-1",
      status: "pending",
      notes: "Still evaluating block 1",
    });

    // Reviewer decides to approve the overall bundle anyway (block reviews are advisory/informational)
    const reviewResult = await reviewFixtureBundle(staged, fixture, "user-tutor-assigned", "Approving overall bundle despite advisory block notes");
    expect(reviewResult.ok).toBe(true);

    const importData = await getProductBundleImport(staged.importId);
    expect(importData).not.toBeNull();
    expect(importData?.reviews).toHaveLength(1);
    expect(importData?.reviews[0].status).toBe("approved");

    // Block reviews are still preserved and intact for audit/lineage
    const blockReviews = await listProductBlockReviews(staged.importId, "user-tutor-assigned");
    expect(blockReviews).toHaveLength(2);
  });

  it("ensures serialized Product Bundle checksum remains valid and excludes review metadata", async () => {
    const { staged, fixture } = await stageFixtureBundle();

    // Stage artifact checksum matches fixture checksum
    expect(staged.checksum).toBe(fixture.checksum);

    // Add block reviews and a bundle review
    await upsertProductBlockReview({
      expectedRevision: fixture.checksum,
      importId: staged.importId,
      reviewerId: "user-tutor-assigned",
      productId: "article-008",
      blockId: "block-0",
      status: "changes_requested",
      notes: "Advisory note",
    });
    await reviewFixtureBundle(staged, fixture, "user-tutor-assigned", "Bundle review note");

    // Parsing staged product bundle verifies that artifact content and checksum in storage
    // remain completely pure and exclude any review metadata added in the database
    const parsedStaged = await parseStagedProductBundle(staged.importId);
    expect(parsedStaged.manifest.bundleChecksum).toBe(fixture.checksum);
    expect(parsedStaged.manifest.bundleId).toBe(fixture.bundleId);
    expect(parsedStaged.products).toHaveLength(7);
  });
});
