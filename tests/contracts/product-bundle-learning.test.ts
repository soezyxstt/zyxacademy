import { describe, expect, test } from "bun:test";
import { zipSync } from "fflate";
import {
  computeProductBundleChecksum,
  deterministicProductSerialization,
  validateProductBundle,
  type ProductDependency,
} from "@/lib/bundle/product-validator";
import { LIMIT_ARTICLE_FIXTURE, LIMIT_EPSILON_DELTA_GRAPH } from "../fixtures/product-learning/limit-epsilon-delta";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

function sha(bytes: Uint8Array): string {
  return Bun.CryptoHasher.hash("sha256", bytes, "hex");
}

function archive(files: ReadonlyMap<string, Uint8Array>): Uint8Array {
  return zipSync(Object.fromEntries(files));
}

function buildBundle(products: Record<string, unknown>[], dependencies: ProductDependency[] = []): Uint8Array {
  const encode = (value: unknown) => new TextEncoder().encode(`${deterministicProductSerialization(value)}\n`);
  const files = new Map<string, Uint8Array>();
  const productBytes = encode(products);
  const dependencyBytes = encode(dependencies);
  files.set("entities/products.json", productBytes);
  files.set("entities/dependencies.json", dependencyBytes);

  const manifestBase = {
    bundleId: "product-bundle-cp1",
    bundleType: "product" as const,
    schemaVersion: "product-bundle.v2" as const,
    courseId: "kalkulus-1",
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
    creatorId: "creator-001",
    curatorId: "curator-001",
    createdAt: "2026-09-05T00:00:00.000Z",
    conflicts: [],
  };

  const manifest = {
    ...manifestBase,
    bundleChecksum: computeProductBundleChecksum(manifestBase, files),
  };

  files.set("manifest.json", encode(manifest));
  return archive(files);
}

function createV3Article(): Record<string, unknown> {
  const clonedLimitArticle = structuredClone(LIMIT_ARTICLE_FIXTURE);
  const clonedGraph = structuredClone(LIMIT_EPSILON_DELTA_GRAPH);
  const sourceRefs = structuredClone(clonedLimitArticle.sections[0].sourceRefs);
  const v3Sections = clonedLimitArticle.sections.map((s) => ({
    id: s.id,
    kind: s.kind,
    learningSectionId: s.kind === "topic" ? (s.learningSectionId ?? "ls-limit-formal-definition") : undefined,
    parentSectionId: s.parentSectionId,
    title: s.title,
    slug: s.slug,
    orderIndex: s.orderIndex,
    learningObjective: s.learningObjective,
    ideaIds: structuredClone(s.ideaIds),
    sourceRefs: structuredClone(s.sourceRefs),
    pedagogy: s.pedagogy ? structuredClone(s.pedagogy) : undefined,
    blocks: s.blocks.map((b) => ({
      id: b.id,
      blockType: b.blockType,
      title: b.title,
      orderIndex: b.orderIndex,
      contentMarkdown: b.content,
      ideaIds: structuredClone(b.ideaIds),
      sourceRefs: structuredClone(b.sourceRefs),
      workedExamplePayload: b.workedExamplePayload ? structuredClone(b.workedExamplePayload) : undefined,
      formativeCheckPayload: b.formativeCheckPayload ? structuredClone(b.formativeCheckPayload) : undefined,
    })),
  }));

  return {
    id: "article-limit-definition",
    productType: "article",
    slug: "article-limit-definition",
    title: clonedLimitArticle.title,
    courseId: "kalkulus-1",
    chapterId: "chapter-limit",
    version: 1,
    status: "draft",
    ideaLinks: [{ id: "idea-limit-precision", version: 1, semanticHash: HASH_A, weight: 1, role: "primary" }],
    sourceRefs,
    schemaVersion: "1.0",
    sourceHash: sourceRefs[0].checksum,
    generationHash: HASH_A,
    creatorId: "creator-001",
    curatorId: "curator-001",
    blocks: [],
    sections: v3Sections,
    visuals: [clonedGraph],
  };
}

function createV2Article(): Record<string, unknown> {
  const v2BlockTypes = [
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
  ];

  return {
    id: "article-v2-legacy",
    productType: "article",
    slug: "article-v2-legacy",
    title: "Artikel V2 Kompatibel",
    courseId: "kalkulus-1",
    chapterId: "chapter-01",
    version: 1,
    status: "draft",
    ideaLinks: [{ id: "idea-limit-01", version: 1, semanticHash: HASH_A, weight: 1, role: "primary" }],
    sourceRefs: [{ sourceId: "source-calc", version: 1, checksum: HASH_B, excerptIds: ["ex-1"] }],
    schemaVersion: "1.0",
    sourceHash: HASH_B,
    generationHash: HASH_A,
    creatorId: "creator-001",
    curatorId: "curator-001",
    sections: [],
    blocks: v2BlockTypes.map((blockType, orderIndex) => ({
      id: `block-${orderIndex}`,
      blockType,
      orderIndex,
      content: `${blockType} content text`,
    })),
  };
}

describe("product bundle learning extensions", () => {
  test("validates Product Bundle V3 containing pedagogy metadata, worked examples, formative checks, and visuals", () => {
    const article = createV3Article();
    const bundleZip = buildBundle([article]);
    const result = validateProductBundle(bundleZip);
    expect(result.success).toBe(true);
  });

  test("preserves backwards compatibility for existing Product Bundle V2 articles without sections or visuals", () => {
    const v2Article = createV2Article();
    const bundleZip = buildBundle([v2Article]);
    const result = validateProductBundle(bundleZip);
    expect(result.success).toBe(true);
  });

  test("rejects Product Bundle V3 when section pedagogy has dangling block reference", () => {
    const brokenArticle = createV3Article();
    const section = (brokenArticle.sections as any[])[1];
    section.pedagogy.objectives[0].explanationBlockIds = ["block-ghost-id"];

    const bundleZip = buildBundle([brokenArticle]);
    const result = validateProductBundle(bundleZip);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some((i) => i.code === "PRODUCT_PEDAGOGY_REFERENCE_INVALID"),
      ).toBe(true);
    }
  });

  test("rejects Product Bundle V3 with duplicate visual IDs", () => {
    const brokenArticle = createV3Article();
    brokenArticle.visuals = [LIMIT_EPSILON_DELTA_GRAPH, LIMIT_EPSILON_DELTA_GRAPH];

    const bundleZip = buildBundle([brokenArticle]);
    const result = validateProductBundle(bundleZip);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some((i) => i.code === "PRODUCT_VISUAL_DUPLICATE_ID"),
      ).toBe(true);
    }
  });

  test("rejects Product Bundle V3 with workedExamplePayload on disallowed blockType", () => {
    const brokenArticle = createV3Article();
    const section = (brokenArticle.sections as any[])[1];
    const explanationBlock = section.blocks.find((b: any) => b.blockType === "explanation");
    explanationBlock.workedExamplePayload = {
      steps: [{ stepIndex: 0, label: "L", explanation: "E", reason: "R" }],
      verification: "V",
    };

    const bundleZip = buildBundle([brokenArticle]);
    const result = validateProductBundle(bundleZip);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some((i) => i.code === "PRODUCT_BLOCK_PAYLOAD_MISMATCH"),
      ).toBe(true);
    }
  });

  test("rejects Product Bundle V3 with formativeCheckPayload on disallowed blockType", () => {
    const brokenArticle = createV3Article();
    const section = (brokenArticle.sections as any[])[1];
    const workedExampleBlock = section.blocks.find((b: any) => b.blockType === "worked_example");
    workedExampleBlock.formativeCheckPayload = {
      checkKind: "short_answer",
      answer: "A",
      explanation: "E",
    };

    const bundleZip = buildBundle([brokenArticle]);
    const result = validateProductBundle(bundleZip);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.issues.some((i) => i.code === "PRODUCT_BLOCK_PAYLOAD_MISMATCH"),
      ).toBe(true);
    }
  });
});
