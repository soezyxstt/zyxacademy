import { describe, expect, it, beforeAll, beforeEach } from "bun:test";
import { mock } from "bun:test";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
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

const client = createClient({ url: "file::memory:?cache=shared" });
const testDb = drizzle(client, { schema });

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
  beforeAll(async () => {
    await migrate(testDb, { migrationsFolder: "./drizzle" });
    await client.execute("PRAGMA foreign_keys = ON");
  });

  beforeEach(async () => {
    storageMap.clear();

    // Clean up tables
    await client.execute("DELETE FROM review_item_bundle");
    await client.execute("DELETE FROM review_bundle");
    await client.execute("DELETE FROM item_impor_bundle");
    await client.execute("DELETE FROM impor_bundle");
    await client.execute("DELETE FROM audit_mutasi");
    await client.execute("DELETE FROM penugasan_tutor");
    await client.execute("DELETE FROM tutor_courses");
    await client.execute("DELETE FROM pengguna_peran");
    await client.execute("DELETE FROM peran");
    await client.execute("DELETE FROM pengguna");
    await client.execute("DELETE FROM user");
    await client.execute("DELETE FROM mata_kuliah");
    await client.execute("DELETE FROM courses");

    // Set up course
    await client.execute({
      sql: "INSERT INTO courses (id, title, category, description) VALUES (?, ?, ?, ?)",
      args: ["course-008", "Fisika Dasar", "Fisika", "Deskripsi Fisika"],
    });
    await client.execute({
      sql: "INSERT INTO mata_kuliah (id, code, title, status, legacy_course_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0)",
      args: ["mk-008", "FIS-008", "Fisika Dasar", "active", "course-008"],
    });

    // Set up users and roles
    // 1. Admin
    await client.execute({
      sql: "INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at) VALUES (?, ?, ?, 1, 'admin', 0, 0)",
      args: ["user-admin-1", "Admin One", "admin1@example.test"],
    });
    await provisionPenggunaForNewUser({ id: "user-admin-1", role: "admin" });

    // 2. Assigned Tutor
    await client.execute({
      sql: "INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at) VALUES (?, ?, ?, 1, 'teacher', 0, 0)",
      args: ["user-tutor-assigned", "Tutor Assigned", "tutor_assigned@example.test"],
    });
    await provisionPenggunaForNewUser({ id: "user-tutor-assigned", role: "teacher" });
    await client.execute({
      sql: "INSERT INTO penugasan_tutor (id, pengguna_id, mata_kuliah_id, status, assignment_scope, created_at, updated_at) VALUES (?, ?, ?, 'active', 'course', 0, 0)",
      args: ["penugasan-1", "user-tutor-assigned", "mk-008"],
    });

    // 3. Unassigned Tutor
    await client.execute({
      sql: "INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at) VALUES (?, ?, ?, 1, 'teacher', 0, 0)",
      args: ["user-tutor-unassigned", "Tutor Unassigned", "tutor_unassigned@example.test"],
    });
    await provisionPenggunaForNewUser({ id: "user-tutor-unassigned", role: "teacher" });

    // 4. Student (murid)
    await client.execute({
      sql: "INSERT INTO user (id, name, email, email_verified, role, created_at, updated_at) VALUES (?, ?, ?, 1, 'student', 0, 0)",
      args: ["user-student-1", "Student One", "student1@example.test"],
    });
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

  it("performs idempotent upsert and enforces composite uniqueness", async () => {
    const { staged } = await stageFixtureBundle();

    // First review insert: changes_requested with notes
    const review1 = await upsertProductBlockReview({
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
    const { staged } = await stageFixtureBundle();

    await expect(
      upsertProductBlockReview({
        importId: staged.importId,
        reviewerId: "user-tutor-assigned",
        productId: "non-existent-product",
        blockId: "block-0",
        status: "approved",
      }),
    ).rejects.toThrow("PRODUCT_BLOCK_REVIEW_PRODUCT_NOT_FOUND");
  });

  it("rejects invalid block ID", async () => {
    const { staged } = await stageFixtureBundle();

    await expect(
      upsertProductBlockReview({
        importId: staged.importId,
        reviewerId: "user-tutor-assigned",
        productId: "article-008",
        blockId: "non-existent-block",
        status: "approved",
      }),
    ).rejects.toThrow("PRODUCT_BLOCK_REVIEW_BLOCK_NOT_FOUND");
  });

  it("rejects non-article target products", async () => {
    const { staged } = await stageFixtureBundle();

    // Diktat product target
    await expect(
      upsertProductBlockReview({
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
        importId: staged.importId,
        reviewerId: "user-tutor-assigned",
        productId: "question-008",
        blockId: "block-0",
        status: "approved",
      }),
    ).rejects.toThrow("PRODUCT_BLOCK_REVIEW_ARTICLE_REQUIRED");
  });

  it("enforces reviewer authorization and course access", async () => {
    const { staged } = await stageFixtureBundle();

    // Non-existent reviewer
    await expect(
      upsertProductBlockReview({
        importId: staged.importId,
        reviewerId: "user-does-not-exist",
        productId: "article-008",
        blockId: "block-0",
        status: "approved",
      }),
    ).rejects.toThrow("PRODUCT_BUNDLE_REVIEWER_NOT_FOUND");

    // Reviewer with student role (murid)
    await expect(
      upsertProductBlockReview({
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
        importId: staged.importId,
        reviewerId: "user-tutor-unassigned",
        productId: "article-008",
        blockId: "block-0",
        status: "approved",
      }),
    ).rejects.toThrow("PRODUCT_BUNDLE_REVIEW_COURSE_FORBIDDEN");

    // Admin reviewer succeeds even without course-specific assignment
    const adminReview = await upsertProductBlockReview({
      importId: staged.importId,
      reviewerId: "user-admin-1",
      productId: "article-008",
      blockId: "block-0",
      status: "approved",
    });
    expect(adminReview.status).toBe("approved");
  });

  it("rejects block reviews on non-draft imports", async () => {
    const { staged } = await stageFixtureBundle();

    // Manually mark import as published in database
    await client.execute({
      sql: "UPDATE impor_bundle SET status = 'published' WHERE id = ?",
      args: [staged.importId],
    });

    await expect(
      upsertProductBlockReview({
        importId: staged.importId,
        reviewerId: "user-admin-1",
        productId: "article-008",
        blockId: "block-0",
        status: "approved",
      }),
    ).rejects.toThrow("PRODUCT_BLOCK_REVIEW_DRAFT_REQUIRED");
  });

  it("enforces notes length limit (max 2000 chars)", async () => {
    const { staged } = await stageFixtureBundle();

    // Exactly 2000 characters should succeed
    const validNotes = "x".repeat(2000);
    const review = await upsertProductBlockReview({
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
    const { staged } = await stageFixtureBundle();

    // Reviewer adds a block review before bundle decision
    await upsertProductBlockReview({
      importId: staged.importId,
      reviewerId: "user-tutor-assigned",
      productId: "article-008",
      blockId: "block-0",
      status: "approved",
    });

    // Reviewer records bundle-level review decision
    const decision = await reviewProductBundle({
      importId: staged.importId,
      reviewerId: "user-tutor-assigned",
      decision: "approved",
      notes: "Bundle approved by tutor",
    });
    expect(decision.reviewerRole).toBe("tutor");

    // Subsequent block review attempts by this reviewer are rejected (immutable)
    await expect(
      upsertProductBlockReview({
        importId: staged.importId,
        reviewerId: "user-tutor-assigned",
        productId: "article-008",
        blockId: "block-0",
        status: "changes_requested",
      }),
    ).rejects.toThrow("PRODUCT_BLOCK_REVIEW_IMMUTABLE");

    await expect(
      upsertProductBlockReview({
        importId: staged.importId,
        reviewerId: "user-tutor-assigned",
        productId: "article-008",
        blockId: "block-1",
        status: "approved",
      }),
    ).rejects.toThrow("PRODUCT_BLOCK_REVIEW_IMMUTABLE");
  });

  it("removes all block reviews when bundle draft is discarded", async () => {
    const { staged } = await stageFixtureBundle();

    await upsertProductBlockReview({
      importId: staged.importId,
      reviewerId: "user-tutor-assigned",
      productId: "article-008",
      blockId: "block-0",
      status: "changes_requested",
    });
    await upsertProductBlockReview({
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
    const { staged } = await stageFixtureBundle("bundle-restage-test");

    // Tutor and Admin add block reviews on initial staged draft
    await upsertProductBlockReview({
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
    const { staged } = await stageFixtureBundle();

    // Reviewer has multiple block reviews: some pending, some changes_requested
    await upsertProductBlockReview({
      importId: staged.importId,
      reviewerId: "user-tutor-assigned",
      productId: "article-008",
      blockId: "block-0",
      status: "changes_requested",
      notes: "Block 0 needs revision",
    });
    await upsertProductBlockReview({
      importId: staged.importId,
      reviewerId: "user-tutor-assigned",
      productId: "article-008",
      blockId: "block-1",
      status: "pending",
      notes: "Still evaluating block 1",
    });

    // Reviewer decides to approve the overall bundle anyway (block reviews are advisory/informational)
    const reviewResult = await reviewProductBundle({
      importId: staged.importId,
      reviewerId: "user-tutor-assigned",
      decision: "approved",
      notes: "Approving overall bundle despite advisory block notes",
    });

    expect(reviewResult.reviewerRole).toBe("tutor");
    expect(reviewResult.status).toBe("draft");

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
      importId: staged.importId,
      reviewerId: "user-tutor-assigned",
      productId: "article-008",
      blockId: "block-0",
      status: "changes_requested",
      notes: "Advisory note",
    });
    await reviewProductBundle({
      importId: staged.importId,
      reviewerId: "user-tutor-assigned",
      decision: "approved",
      notes: "Bundle review note",
    });

    // Parsing staged product bundle verifies that artifact content and checksum in storage
    // remain completely pure and exclude any review metadata added in the database
    const parsedStaged = await parseStagedProductBundle(staged.importId);
    expect(parsedStaged.manifest.bundleChecksum).toBe(fixture.checksum);
    expect(parsedStaged.manifest.bundleId).toBe(fixture.bundleId);
    expect(parsedStaged.products).toHaveLength(7);
  });
});
