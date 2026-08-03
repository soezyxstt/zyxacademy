import { describe, expect, test } from "bun:test";
import { zipSync } from "fflate";
import { computeProductBundleChecksum, deterministicProductSerialization, validateProductBundle, type ProductDependency, type ProductEntity } from "@/lib/bundle/product-validator";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function productBase(id: string, productType: ProductEntity["productType"]): Record<string, unknown> {
  return {
    id,
    productType,
    courseId: "course-008",
    chapterId: "chapter-008",
    version: 1,
    status: "published",
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
    { ...productBase("article-008", "article"), slug: "article-008", title: "Article", blocks: [{ id: "block-008", blockType: "concept", orderIndex: 0, content: "Article block" }] },
    { ...productBase("diktat-008", "diktat"), title: "Diktat", contentMarkdown: "# Diktat" },
    { ...productBase("question-008", "question"), questionType: "multiple_choice", prompt: "What is velocity?", options: ["A", "B"], difficulty: "medium", cognitiveLevel: "understand", reasoningPattern: "definition" },
    { ...productBase("solution-008", "solution"), questionId: "question-008", content: "Because velocity is displacement over time." },
    { ...productBase("set-008", "flashcard_set"), title: "Set", cards: ["flashcard-008"] },
    { ...productBase("flashcard-008", "flashcard"), front: "What is velocity?", back: "Displacement over time", atomic: true },
    { ...productBase("blueprint-008", "assessment_blueprint"), title: "Quiz", assessmentType: "quiz", chapterIds: ["chapter-008"], questionIds: ["question-008"] },
  ];
}

function buildFiles(products = validProducts(), dependencies: ProductDependency[] = []): Map<string, Uint8Array> {
  const encode = (value: unknown) => new TextEncoder().encode(`${deterministicProductSerialization(value)}\n`);
  const files = new Map<string, Uint8Array>();
  const productBytes = encode(products);
  const dependencyBytes = encode(dependencies);
  files.set("entities/products.json", productBytes);
  files.set("entities/dependencies.json", dependencyBytes);
  const manifestBase = {
    bundleId: "product-bundle-008",
    bundleType: "product" as const,
    schemaVersion: "product-bundle.v2" as const,
    courseId: "course-008",
    entityFiles: [
      { path: "entities/products.json", entityType: "products" as const, checksum: sha(productBytes), stableIds: products.map((product) => String(product.id)) },
      { path: "entities/dependencies.json", entityType: "dependencies" as const, checksum: sha(dependencyBytes), stableIds: dependencies.map((dependency) => dependency.id) },
    ],
    creatorId: "creator-008",
    curatorId: "curator-008",
    createdAt: "2026-08-03T00:00:00.000Z",
    conflicts: [],
  };
  const manifest = { ...manifestBase, bundleChecksum: computeProductBundleChecksum(manifestBase, files) };
  files.set("manifest.json", encode(manifest));
  return files;
}

function sha(bytes: Uint8Array): string {
  return Bun.CryptoHasher.hash("sha256", bytes, "hex");
}

function archive(files: ReadonlyMap<string, Uint8Array>): Uint8Array {
  return zipSync(Object.fromEntries(files));
}

describe("Plan 008 Product Bundle V2", () => {
  test("validates every product type with traceability and deterministic checksum", () => {
    const files = buildFiles();
    const result = validateProductBundle(archive(files));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.products).toHaveLength(7);
    expect(result.data.products.every((product) => product.ideaLinks.length > 0 && product.sourceRefs.length > 0)).toBe(true);
    expect(result.data.publicationBlocked).toBe(false);
  });

  test("marks stale dependencies as publication blocked without silently accepting them", () => {
    const dependency: ProductDependency = { id: "dependency-008", upstreamEntityType: "idea", upstreamEntityId: "idea-008", upstreamVersion: 1, upstreamHash: HASH_A, downstreamEntityType: "article", downstreamEntityId: "article-008", downstreamVersion: 1, downstreamHash: HASH_A, freshness: "NEEDS_REVIEW" };
    const result = validateProductBundle(archive(buildFiles(validProducts(), [dependency])));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.publicationBlocked).toBe(true);
      expect(result.data.issues[0]?.code).toBe("PRODUCT_DEPENDENCY_NEEDS_REVIEW");
    }
  });

  test("rejects holdout leakage and duplicate product versions", () => {
    const leaky = validProducts();
    (leaky[0] as { title: string }).title = "HOLDOUT_CANARY";
    const leak = validateProductBundle(archive(buildFiles(leaky)));
    expect(leak.success).toBe(false);
    if (!leak.success) expect(leak.issues[0]?.code).toBe("PRODUCT_HOLDOUT_LEAK");

    const duplicate = [...validProducts(), validProducts()[0]];
    const duplicateResult = validateProductBundle(archive(buildFiles(duplicate)));
    expect(duplicateResult.success).toBe(false);
    if (!duplicateResult.success) expect(duplicateResult.issues[0]?.code).toBe("PRODUCT_STABLE_ID_MISMATCH");
  });

  test("rejects missing flashcard and assessment product links", () => {
    const missingCard = validProducts();
    (missingCard.find((product) => product.productType === "flashcard_set") as { cards: string[] }).cards = ["missing-card"];
    const cardResult = validateProductBundle(archive(buildFiles(missingCard)));
    expect(cardResult.success).toBe(false);
    if (!cardResult.success) expect(cardResult.issues[0]?.code).toBe("PRODUCT_FLASHCARD_LINK_MISSING");

    const missingQuestion = validProducts();
    (missingQuestion.find((product) => product.productType === "assessment_blueprint") as { questionIds: string[] }).questionIds = ["missing-question"];
    const assessmentResult = validateProductBundle(archive(buildFiles(missingQuestion)));
    expect(assessmentResult.success).toBe(false);
    if (!assessmentResult.success) expect(assessmentResult.issues[0]?.code).toBe("PRODUCT_ASSESSMENT_QUESTION_MISSING");
  });
});
