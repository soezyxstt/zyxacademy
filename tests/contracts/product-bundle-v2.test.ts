import { describe, expect, test } from "bun:test";
import { zipSync } from "fflate";
import { computeProductBundleChecksum, deterministicProductSerialization, validateProductBundle, type ProductDependency, type ProductEntity } from "@/lib/bundle/product-validator";
import { createProductBundleDraft, finalizeProductBundleDraft } from "@/lib/bundle/product-draft";
import { productBundleLifecycleStatus } from "@/lib/bundle/product-staging";

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
    { ...productBase("article-008", "article"), slug: "article-008", title: "Article", blocks: [
      "prior_knowledge_activation", "problem_introduction", "explanation", "verbal_representation",
      "mathematical_representation", "analogy", "worked_example", "misconception", "application",
      "retrieval_prompt", "summary", "retrieval_close",
    ].map((blockType, orderIndex) => ({ id: `block-${orderIndex}`, blockType, orderIndex, content: `${blockType} content` })) },
    { ...productBase("diktat-008", "diktat"), title: "Diktat", contentMarkdown: "# Diktat", sourceArticleId: "article-008", sourceArticleVersion: 1, sourceArticleHash: HASH_A },
    { ...productBase("question-008", "question"), questionType: "multiple_choice", prompt: "What is velocity?", options: [{ id: "a", text: "Displacement over time", isCorrect: true }, { id: "b", text: "Distance only", isCorrect: false }], difficulty: "medium", cognitiveLevel: "understand", reasoningPattern: "definition", itbSource: { referenceId: "itb-ref-008", eventName: "UTS Fisika Dasar ITB 2024" }, itbCuration: [{ referenceId: "itb-ref-008", dimensions: { difficulty: "similar", format: "similar", terminology: "similar", reasoningPattern: "similar" }, curatorNote: "Curation fixture" }] },
    { ...productBase("solution-008", "solution"), questionId: "question-008", content: "Because velocity is displacement over time." },
    { ...productBase("set-008", "flashcard_set"), title: "Set", cards: ["flashcard-008"] },
    { ...productBase("flashcard-008", "flashcard"), front: "What is velocity?", back: "Displacement over time", atomic: true },
    { ...productBase("blueprint-008", "assessment_blueprint"), title: "Quiz", assessmentType: "quiz", chapterIds: ["chapter-008"], questionIds: ["question-008"] },
  ];
}

function validDependencies(): ProductDependency[] {
  return [{
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
  }];
}

function buildFiles(
  products = validProducts(),
  dependencies: ProductDependency[] = validDependencies(),
  schemaVersion: "product-bundle.v2" | "product-bundle.v3" = "product-bundle.v2",
): Map<string, Uint8Array> {
  const encode = (value: unknown) => new TextEncoder().encode(`${deterministicProductSerialization(value)}\n`);
  const files = new Map<string, Uint8Array>();
  const productBytes = encode(products);
  const dependencyBytes = encode(dependencies);
  files.set("entities/products.json", productBytes);
  files.set("entities/dependencies.json", dependencyBytes);
  const manifestBase = {
    bundleId: "product-bundle-008",
    bundleType: "product" as const,
    schemaVersion,
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
  test("exposes only the three-state Product Bundle lifecycle", () => {
    expect(productBundleLifecycleStatus("draft")).toBe("draft");
    expect(productBundleLifecycleStatus("published")).toBe("published");
    expect(productBundleLifecycleStatus("withdrawn")).toBe("withdrawn");
    expect(productBundleLifecycleStatus("validated")).toBe("draft");
    expect(productBundleLifecycleStatus("approved")).toBe("draft");
    expect(productBundleLifecycleStatus("rejected")).toBe("draft");
  });

  test("finalizes edited product content and refreshes Article to Diktat lineage", () => {
    const parsed = validateProductBundle(archive(buildFiles()));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const draft = createProductBundleDraft(parsed.data);
    const article = draft.products.find((product) => product.productType === "article");
    if (!article || article.productType !== "article") throw new Error("missing article fixture");
    article.title = "Article yang sudah direview";
    article.blocks[0].content = "Aktivasi pengetahuan awal hasil review";
    const finalized = finalizeProductBundleDraft(parsed.data, draft);
    const finalArticle = finalized.bundle.products.find((product) => product.productType === "article");
    const finalDiktat = finalized.bundle.products.find((product) => product.productType === "diktat");
    expect(finalArticle?.productType).toBe("article");
    expect(finalDiktat?.productType).toBe("diktat");
    if (finalArticle?.productType === "article" && finalDiktat?.productType === "diktat") expect(finalDiktat.sourceArticleHash).toBe(finalArticle.generationHash);
  });

  test("rejects edited Product identities and unnormalized Idea weights", () => {
    const parsed = validateProductBundle(archive(buildFiles()));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    const identityDraft = createProductBundleDraft(parsed.data);
    identityDraft.products[0].id = "replaced-product";
    expect(() => finalizeProductBundleDraft(parsed.data, identityDraft)).toThrow("PRODUCT_DRAFT_IDENTITY_CHANGED");

    const weightDraft = createProductBundleDraft(parsed.data);
    weightDraft.products[0].ideaLinks[0].weight = 0.5;
    expect(() => finalizeProductBundleDraft(parsed.data, weightDraft)).toThrow("PRODUCT_IDEA_WEIGHT_SUM_INVALID");
  });

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
    const result = validateProductBundle(archive(buildFiles(validProducts(), [...validDependencies(), dependency])));
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

  test("requires ITB curation for every question product", () => {
    const missingCuration = validProducts();
    (missingCuration[2] as { itbCuration: unknown[] }).itbCuration = [];
    const result = validateProductBundle(archive(buildFiles(missingCuration)));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.issues[0]?.code).toBe("BUNDLE_ENTITY_INVALID");
  });

  test("requires a dedicated ITB source included in curation", () => {
    const missingSource = validProducts();
    delete (missingSource[2] as { itbSource?: unknown }).itbSource;
    const missingResult = validateProductBundle(archive(buildFiles(missingSource)));
    expect(missingResult.success).toBe(false);
    if (!missingResult.success) expect(missingResult.issues[0]?.code).toBe("BUNDLE_ENTITY_INVALID");

    const uncuratedSource = validProducts();
    (uncuratedSource[2] as { itbSource: { referenceId: string } }).itbSource.referenceId = "itb-ref-other";
    const uncuratedResult = validateProductBundle(archive(buildFiles(uncuratedSource)));
    expect(uncuratedResult.success).toBe(false);
    if (!uncuratedResult.success) expect(uncuratedResult.issues[0]?.code).toBe("PRODUCT_ITB_SOURCE_NOT_CURATED");
  });

  test("enforces atomic flashcards, normalized Idea weights, complete multi-Idea relations, and HOT cognitive level", () => {
    const invalidFlashcard = validProducts();
    (invalidFlashcard[5] as { ideaLinks: unknown[] }).ideaLinks = [
      { id: "idea-008", version: 1, semanticHash: HASH_A, weight: 0.5, role: "primary" },
      { id: "idea-009", version: 1, semanticHash: HASH_B, weight: 0.5, role: "supporting" },
    ];
    const flashcardResult = validateProductBundle(archive(buildFiles(invalidFlashcard)));
    expect(flashcardResult.success).toBe(false);
    if (!flashcardResult.success) expect(flashcardResult.issues[0]?.code).toBe("PRODUCT_FLASHCARD_IDEA_COUNT_INVALID");

    const invalidWeights = validProducts();
    (invalidWeights[0] as { ideaLinks: unknown[] }).ideaLinks = [{ id: "idea-008", version: 1, semanticHash: HASH_A, weight: 0.5, role: "primary" }];
    const weightResult = validateProductBundle(archive(buildFiles(invalidWeights)));
    expect(weightResult.success).toBe(false);
    if (!weightResult.success) expect(weightResult.issues[0]?.code).toBe("PRODUCT_IDEA_WEIGHT_SUM_INVALID");

    const nonHotMultiIdea = validProducts();
    (nonHotMultiIdea[2] as { ideaLinks: unknown[]; ideaRelations: unknown[] }).ideaLinks = [
      { id: "idea-008", version: 1, semanticHash: HASH_A, weight: 0.5, role: "primary" },
      { id: "idea-009", version: 1, semanticHash: HASH_B, weight: 0.5, role: "required" },
    ];
    (nonHotMultiIdea[2] as { ideaRelations: unknown[] }).ideaRelations = [
      { ideaId: "idea-008", relationType: "required", rationale: "Primary Idea" },
      { ideaId: "idea-009", relationType: "prerequisite", rationale: "Required connection" },
    ];
    const nonHotResult = validateProductBundle(archive(buildFiles(nonHotMultiIdea)));
    expect(nonHotResult.success).toBe(false);
    if (!nonHotResult.success) expect(nonHotResult.issues[0]?.code).toBe("PRODUCT_QUESTION_MULTI_IDEA_HOT_REQUIRED");

    const validMultiIdea = validProducts();
    (validMultiIdea[2] as { cognitiveLevel: string }).cognitiveLevel = "analyze";
    (validMultiIdea[2] as { ideaLinks: unknown[]; ideaRelations: unknown[] }).ideaLinks = [
      { id: "idea-008", version: 1, semanticHash: HASH_A, weight: 0.5, role: "primary" },
      { id: "idea-009", version: 1, semanticHash: HASH_B, weight: 0.5, role: "required" },
    ];
    (validMultiIdea[2] as { ideaRelations: unknown[] }).ideaRelations = [
      { ideaId: "idea-008", relationType: "required", rationale: "Primary Idea" },
      { ideaId: "idea-009", relationType: "prerequisite", rationale: "Required connection" },
    ];
    expect(validateProductBundle(archive(buildFiles(validMultiIdea))).success).toBe(true);

    (validMultiIdea[2] as { ideaRelations: unknown[] }).ideaRelations = [{ ideaId: "idea-008", relationType: "required" }];
    const relationResult = validateProductBundle(archive(buildFiles(validMultiIdea)));
    expect(relationResult.success).toBe(false);
    if (!relationResult.success) expect(relationResult.issues[0]?.code).toBe("PRODUCT_QUESTION_RELATION_INCOMPLETE");
  });

  test("requires an explicit Article dependency when Diktat lineage is declared", () => {
    const products = validProducts();
    (products[1] as { sourceArticleId: string; sourceArticleVersion: number; sourceArticleHash: string }).sourceArticleId = "article-008";
    (products[1] as { sourceArticleVersion: number }).sourceArticleVersion = 1;
    (products[1] as { sourceArticleHash: string }).sourceArticleHash = HASH_A;
    expect(validateProductBundle(archive(buildFiles(products, validDependencies()))).success).toBe(true);

    const missing = validateProductBundle(archive(buildFiles(products, [])));
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.issues[0]?.code).toBe("PRODUCT_DIKTAT_LINEAGE_DEPENDENCY_MISSING");
  });

  test("accepts draft products, rejects withdrawn products, and enforces attribution", () => {
    expect(validateProductBundle(archive(buildFiles(validProducts()))).success).toBe(true);

    const withdrawn = validProducts();
    (withdrawn[0] as { status: string }).status = "withdrawn";
    const withdrawnResult = validateProductBundle(archive(buildFiles(withdrawn)));
    expect(withdrawnResult.success).toBe(false);
    if (!withdrawnResult.success) expect(withdrawnResult.issues[0]?.code).toBe("PRODUCT_STATUS_WITHDRAWN");

    const inconsistentCreator = validProducts();
    (inconsistentCreator[0] as { creatorId: string }).creatorId = "another-creator";
    const creatorResult = validateProductBundle(archive(buildFiles(inconsistentCreator)));
    expect(creatorResult.success).toBe(false);
    if (!creatorResult.success) expect(creatorResult.issues[0]?.code).toBe("PRODUCT_CREATOR_MISMATCH");
  });

  test("requires deterministic grading, one solution per question, and article quality coverage", () => {
    const invalidGrading = validProducts();
    (invalidGrading[2] as { options: { isCorrect: boolean }[] }).options[1].isCorrect = true;
    const gradingResult = validateProductBundle(archive(buildFiles(invalidGrading)));
    expect(gradingResult.success).toBe(false);
    if (!gradingResult.success) expect(gradingResult.issues[0]?.code).toBe("PRODUCT_QUESTION_GRADING_INVALID");

    const noSolution = validProducts().filter((product) => product.productType !== "solution");
    const solutionResult = validateProductBundle(archive(buildFiles(noSolution)));
    expect(solutionResult.success).toBe(false);
    if (!solutionResult.success) expect(solutionResult.issues[0]?.code).toBe("PRODUCT_QUESTION_SOLUTION_INVALID");

    const incompleteArticle = validProducts();
    (incompleteArticle[0] as { blocks: unknown[] }).blocks = [{ id: "only-summary", blockType: "summary", orderIndex: 0, content: "Summary" }];
    const articleResult = validateProductBundle(archive(buildFiles(incompleteArticle)));
    expect(articleResult.success).toBe(false);
    if (!articleResult.success) expect(articleResult.issues[0]?.code).toBe("PRODUCT_ARTICLE_QUALITY_FAILED");
  });
});

describe("Product Bundle V3 assessment boundary", () => {
  test("accepts learning products while excluding assessment entities", () => {
    const learningProducts = validProducts().filter((product) => !["question", "solution", "assessment_blueprint"].includes(String(product.productType)));
    const result = validateProductBundle(archive(buildFiles(learningProducts, validDependencies(), "product-bundle.v3")));
    expect(result.success).toBe(true);
  });

  test("rejects question, solution, and assessment blueprint writes", () => {
    for (const forbiddenType of ["question", "solution", "assessment_blueprint"]) {
      const products = validProducts().filter((product) => !["question", "solution", "assessment_blueprint"].includes(String(product.productType)) || product.productType === forbiddenType);
      const result = validateProductBundle(archive(buildFiles(products, validDependencies(), "product-bundle.v3")));
      expect(result.success).toBe(false);
      if (!result.success) expect(result.issues[0]?.code).toBe("PRODUCT_BUNDLE_QUESTION_FORBIDDEN");
    }
  });
});
