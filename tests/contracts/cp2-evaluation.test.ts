import { describe, expect, test } from "bun:test";
import {
  evaluateProductBundleQualityPolicy,
  productPedagogyFingerprint,
} from "@/lib/bundle/product-review-gate";
import type {
  ProductEntity,
  ProductDependency,
} from "@/lib/bundle/product-validator";
import type { PdfArtifactEvidence } from "@/lib/materials/pdf-artifact-contract";
import {
  QUALITY_POLICY_VERSION,
  computePedagogyContentFingerprint,
  type PedagogicReviewDecision,
} from "@/lib/materials/quality-policy";
import {
  LIMIT_ARTICLE_FIXTURE,
  LIMIT_EPSILON_DELTA_GRAPH,
} from "../fixtures/product-learning/limit-epsilon-delta";
import {
  LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL,
} from "../fixtures/product-learning/human-rubric-cases";

const HASH_A = "a".repeat(64);
const HASH_D = "d".repeat(64);

test("legacy readiness blocks concatenated authoring envelopes before review or publication", async () => {
  const article = createValidArticleEntity() as Extract<ProductEntity, { productType: "article" }>;
  article.sections = [];
  article.blocks = [{ id: "mixed", blockType: "explanation", orderIndex: 0, content: 'Intro\n{"content":"Question","answer":"private","isCorrect":true}' }];
  const result = await evaluateProductBundleQualityPolicy([article], { pedagogicReview: null, pdfEvidence: [] });
  expect(result.publicationReady).toBe(false);
  expect(result.issues.some(issue => issue.code === "PRODUCT_ARTICLE_LEGACY_PAYLOAD_INVALID" && issue.target.targetId === article.id)).toBe(true);
  article.blocks[0].content = 'Intro\n{"explanation":"private feedback"}';
  expect((await evaluateProductBundleQualityPolicy([article], { pedagogicReview: null, pdfEvidence: [] })).issues.some(issue => issue.code === "PRODUCT_ARTICLE_LEGACY_PAYLOAD_INVALID")).toBe(true);
  article.blocks = [{ id: "a", blockType: "explanation", orderIndex: 0, content: "Intro\n{" }, { id: "b", blockType: "explanation", orderIndex: 1, content: '"answer":"private"}' }];
  expect((await evaluateProductBundleQualityPolicy([article], { pedagogicReview: null, pdfEvidence: [] })).issues.some(issue => issue.code === "PRODUCT_ARTICLE_LEGACY_PAYLOAD_INVALID")).toBe(true);
});

function createValidArticleEntity(): ProductEntity {
  const cloned = structuredClone(LIMIT_ARTICLE_FIXTURE);
  const clonedGraph = structuredClone(LIMIT_EPSILON_DELTA_GRAPH);
  const sourceRefs = structuredClone(cloned.sections[0].sourceRefs);
  return {
    id: "article-limit-definition",
    productType: "article",
    slug: "article-limit-definition",
    title: cloned.title,
    courseId: "kalkulus-1",
    chapterId: "chapter-limit",
    version: 1,
    status: "draft",
    ideaLinks: [
      {
        id: "idea-limit-precision",
        version: 1,
        semanticHash: HASH_A,
        weight: 1,
        role: "primary",
      },
    ],
    sourceRefs,
    schemaVersion: "1.0",
    sourceHash: sourceRefs[0].checksum,
    generationHash: cloned.generationHash,
    creatorId: "creator-001",
    curatorId: "curator-001",
    blocks: [],
    sections: cloned.sections.map((s) => ({
      id: s.id,
      kind: s.kind,
      learningSectionId:
        s.kind === "topic" ? "ls-limit-formal-definition" : undefined,
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
        applicability: (b as any).applicability,
        workedExamplePayload: b.workedExamplePayload
          ? structuredClone(b.workedExamplePayload)
          : undefined,
        formativeCheckPayload: b.formativeCheckPayload
          ? structuredClone(b.formativeCheckPayload)
          : undefined,
      })),
    })),
    visuals: [clonedGraph],
  };
}

function createValidDiktatEntity(
  article: Extract<ProductEntity, { productType: "article" }>,
): ProductEntity {
  return {
    id: "diktat-limit-definition",
    productType: "diktat",
    title: `Diktat: ${article.title}`,
    courseId: article.courseId,
    chapterId: article.chapterId,
    version: 1,
    status: "draft",
    ideaLinks: structuredClone(article.ideaLinks),
    sourceRefs: structuredClone(article.sourceRefs),
    schemaVersion: "1.0",
    sourceHash: article.sourceHash,
    generationHash: HASH_D,
    creatorId: "creator-001",
    contentMarkdown: "# Ringkasan Diktat\n\nPenjelasan materi limit Cauchy.",
    sourceArticleId: article.id,
    sourceArticleVersion: article.version,
    sourceArticleHash: article.generationHash,
  };
}

function createValidPdfEvidence(
  article: ProductEntity,
  diktat?: ProductEntity,
): PdfArtifactEvidence {
  return {
    id: "pdf-evidence-001",
    imporBundleId: "bundle-limit-v1",
    productId: diktat ? diktat.id : article.id,
    articleVersion: article.version,
    articleHash: article.generationHash,
    diktatHash: diktat ? diktat.generationHash : article.generationHash,
    rendererVersion: "zyx-pdf-v1",
    printProfile: "a4_standard",
    status: "ready",
    storageKey: "courses/kalkulus-1/materials/limit-diktat.pdf",
    pageCount: 3,
  };
}

function createApprovedReview(
  article: ProductEntity,
  diktat?: ProductEntity,
): PedagogicReviewDecision {
  const fp = computePedagogyContentFingerprint({
    article: article as unknown as Record<string, unknown>,
    diktat: diktat ? (diktat as unknown as Record<string, unknown>) : undefined,
  });
  return {
    ...structuredClone(LIMIT_HUMAN_REVIEW_CLEAN_APPROVAL),
    contentFingerprint: fp,
  };
}

describe("CP2 Quality Policy Evaluation Service", () => {
  test("multi-Article fingerprints and PDF gates use linked pairs independent of Diktat order", async () => {
    const first = createValidArticleEntity();
    if (first.productType !== "article") throw new Error("article fixture required");
    const identifiers = [...first.sections.flatMap(section => [section.id, ...section.blocks.map(block => block.id)]), ...(first.visuals ?? []).map(visual => visual.id)].sort((a, b) => b.length - a.length);
    let encoded = JSON.stringify(first);
    for (const id of identifiers) encoded = encoded.split(id).join(`${id}-second`);
    const second = { ...JSON.parse(encoded), id: "article-second", slug: "article-second", generationHash: "e".repeat(64) } as typeof first;
    const d1 = createValidDiktatEntity(first), originalD2 = createValidDiktatEntity(second);
    if (d1.productType !== "diktat" || originalD2.productType !== "diktat") throw new Error("diktat fixture required");
    const d2 = { ...originalD2, id: "diktat-second", generationHash: "f".repeat(64) };
    const products = [first, second, d2, d1];
    const fingerprint = productPedagogyFingerprint(products);
    expect(productPedagogyFingerprint([d1, second, first, d2])).toBe(fingerprint);
    expect(productPedagogyFingerprint([first, { ...second, title: "Changed" }, d2, d1])).not.toBe(fingerprint);
    const review = { ...createApprovedReview(first, d1), contentFingerprint: fingerprint };
    const evidence = [createValidPdfEvidence(first, d1), createValidPdfEvidence(second, d2)];
    const report = await evaluateProductBundleQualityPolicy(products, { pedagogicReview: review, pdfEvidence: evidence });
    expect(report.issues.filter(issue => issue.code.startsWith("PDF_"))).toHaveLength(0);
    const missing = await evaluateProductBundleQualityPolicy(products, { pedagogicReview: review, pdfEvidence: [evidence[0]] });
    expect(missing.issues.some(issue => issue.code === "PDF_EVIDENCE_MISSING" && issue.target.targetId === d2.id)).toBe(true);
  });
  test("reports valid authoring but not publication-ready when review and PDF evidence are missing", async () => {
    const article = createValidArticleEntity();
    const result = await evaluateProductBundleQualityPolicy([article]);

    const expectedFp = computePedagogyContentFingerprint({
      article: article as unknown as Record<string, unknown>,
    });
    expect(result.valid).toBe(true);
    expect(result.publicationReady).toBe(false);
    expect(result.policyVersion).toBe(QUALITY_POLICY_VERSION);
    expect(result.contentFingerprint).toBe(expectedFp);

    const codes = result.issues.map((i) => i.code);
    expect(codes).toContain("PEDAGOGIC_REVIEW_MISSING");
    expect(codes).toContain("PDF_EVIDENCE_MISSING");
  });

  test("approves bundle for publication when valid approval review and ready PDF evidence are provided", async () => {
    const article = createValidArticleEntity();
    const review = createApprovedReview(article);
    const pdfEvidence = [createValidPdfEvidence(article)];

    const result = await evaluateProductBundleQualityPolicy([article], {
      publisherId: review.reviewerId,
      pedagogicReview: review,
      pdfEvidence,
    });

    expect(result.valid).toBe(true);
    expect(result.publicationReady).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.metrics.blockingIssueCount).toBe(0);
    expect(result.metrics.rubricCriteriaMetCount).toBe(8);
  });

  test("rejects publication when publisher context does not match reviewer context", async () => {
    const article = createValidArticleEntity();
    const review = createApprovedReview(article);
    const pdfEvidence = [createValidPdfEvidence(article)];

    const result = await evaluateProductBundleQualityPolicy([article], {
      publisherId: "different-publisher-id",
      pedagogicReview: review,
      pdfEvidence,
    });

    expect(result.valid).toBe(true);
    expect(result.publicationReady).toBe(false);
    const issue = result.issues.find(
      (i) => i.code === "REVIEWER_CONTEXT_MISMATCH",
    );
    expect(issue).toBeDefined();
    expect(issue?.severity).toBe("blocking");
  });

  test("rejects publication when review policy version does not match current policy version", async () => {
    const article = createValidArticleEntity();
    const review: PedagogicReviewDecision = {
      ...createApprovedReview(article),
      policyVersion: "2025.1",
    };
    const pdfEvidence = [createValidPdfEvidence(article)];

    const result = await evaluateProductBundleQualityPolicy([article], {
      publisherId: review.reviewerId,
      pedagogicReview: review,
      pdfEvidence,
    });

    expect(result.valid).toBe(true);
    expect(result.publicationReady).toBe(false);
    const issue = result.issues.find((i) => i.code === "POLICY_VERSION_MISMATCH");
    expect(issue).toBeDefined();
  });

  test("rejects publication when article content changed after review was recorded", async () => {
    const article = createValidArticleEntity() as Extract<
      ProductEntity,
      { productType: "article" }
    >;
    const review = createApprovedReview(article);
    article.sections[0].blocks[0].contentMarkdown =
      "Konten diedit setelah review diberikan untuk menguji staleness fingerprint.";
    const pdfEvidence = [createValidPdfEvidence(article)];

    const result = await evaluateProductBundleQualityPolicy([article], {
      publisherId: review.reviewerId,
      pedagogicReview: review,
      pdfEvidence,
    });

    expect(result.valid).toBe(true);
    expect(result.publicationReady).toBe(false);
    const issue = result.issues.find((i) => i.code === "FINGERPRINT_MISMATCH");
    expect(issue).toBeDefined();
  });

  test("rejects publication when pedagogic rubric is missing a required criterion", async () => {
    const article = createValidArticleEntity();
    const review = createApprovedReview(article);
    review.criteria = review.criteria.filter(
      (c) => c.criterionId !== "concept_accuracy",
    );
    const pdfEvidence = [createValidPdfEvidence(article)];

    const result = await evaluateProductBundleQualityPolicy([article], {
      publisherId: review.reviewerId,
      pedagogicReview: review,
      pdfEvidence,
    });

    expect(result.valid).toBe(true);
    expect(result.publicationReady).toBe(false);
    const issue = result.issues.find(
      (i) => i.code === "RUBRIC_CRITERION_MISSING",
    );
    expect(issue).toBeDefined();
  });

  test("rejects publication when review status is rejected, changes_requested, or pending", async () => {
    const article = createValidArticleEntity();
    const pdfEvidence = [createValidPdfEvidence(article)];

    const statuses: Array<"rejected" | "changes_requested" | "pending"> = [
      "rejected",
      "changes_requested",
      "pending",
    ];

    for (const status of statuses) {
      const review: PedagogicReviewDecision = {
        ...createApprovedReview(article),
        status,
      };

      const result = await evaluateProductBundleQualityPolicy([article], {
        publisherId: review.reviewerId,
        pedagogicReview: review,
        pdfEvidence,
      });

      expect(result.valid).toBe(true);
      expect(result.publicationReady).toBe(false);
      const expectedCode = `PEDAGOGIC_REVIEW_${status.toUpperCase()}`;
      const issue = result.issues.find((i) => i.code === expectedCode);
      expect(issue).toBeDefined();
    }
  });

  test("rejects publication when PDF evidence is in pending status", async () => {
    const article = createValidArticleEntity();
    const review = createApprovedReview(article);
    const pdfEvidence: PdfArtifactEvidence[] = [
      {
        ...createValidPdfEvidence(article),
        status: "pending",
        storageKey: undefined,
        pageCount: undefined,
      },
    ];

    const result = await evaluateProductBundleQualityPolicy([article], {
      publisherId: review.reviewerId,
      pedagogicReview: review,
      pdfEvidence,
    });

    expect(result.valid).toBe(true);
    expect(result.publicationReady).toBe(false);
    const issue = result.issues.find((i) => i.code === "PDF_EVIDENCE_PENDING");
    expect(issue).toBeDefined();
  });

  test("rejects publication when PDF evidence is in failed status", async () => {
    const article = createValidArticleEntity();
    const review = createApprovedReview(article);
    const pdfEvidence: PdfArtifactEvidence[] = [
      {
        ...createValidPdfEvidence(article),
        status: "failed",
        failureCode: "LAYOUT_OVERFLOW",
        storageKey: undefined,
        pageCount: undefined,
      },
    ];

    const result = await evaluateProductBundleQualityPolicy([article], {
      publisherId: review.reviewerId,
      pedagogicReview: review,
      pdfEvidence,
    });

    expect(result.valid).toBe(true);
    expect(result.publicationReady).toBe(false);
    const issue = result.issues.find((i) => i.code === "PDF_EVIDENCE_FAILED");
    expect(issue).toBeDefined();
  });

  test("rejects publication when PDF evidence is in stale status", async () => {
    const article = createValidArticleEntity();
    const review = createApprovedReview(article);
    const pdfEvidence: PdfArtifactEvidence[] = [
      {
        ...createValidPdfEvidence(article),
        status: "stale",
      },
    ];

    const result = await evaluateProductBundleQualityPolicy([article], {
      publisherId: review.reviewerId,
      pedagogicReview: review,
      pdfEvidence,
    });

    expect(result.valid).toBe(true);
    expect(result.publicationReady).toBe(false);
    const issue = result.issues.find((i) => i.code === "PDF_EVIDENCE_STALE");
    expect(issue).toBeDefined();
  });

  test("rejects publication when PDF lineage articleHash does not match current article", async () => {
    const article = createValidArticleEntity();
    const review = createApprovedReview(article);
    const pdfEvidence: PdfArtifactEvidence[] = [
      {
        ...createValidPdfEvidence(article),
        articleHash: "f".repeat(64),
      },
    ];

    const result = await evaluateProductBundleQualityPolicy([article], {
      publisherId: review.reviewerId,
      pedagogicReview: review,
      pdfEvidence,
    });

    expect(result.valid).toBe(true);
    expect(result.publicationReady).toBe(false);
    const issue = result.issues.find(
      (i) => i.code === "PDF_LINEAGE_HASH_MISMATCH",
    );
    expect(issue).toBeDefined();
  });

  test("rejects publication when PDF lineage diktatHash does not match current diktat", async () => {
    const article = createValidArticleEntity() as Extract<
      ProductEntity,
      { productType: "article" }
    >;
    const diktat = createValidDiktatEntity(article);
    const review = createApprovedReview(article, diktat);
    const pdfEvidence: PdfArtifactEvidence[] = [
      {
        ...createValidPdfEvidence(article, diktat),
        diktatHash: "f".repeat(64),
      },
    ];

    const result = await evaluateProductBundleQualityPolicy([article, diktat], {
      publisherId: review.reviewerId,
      pedagogicReview: review,
      pdfEvidence,
    });

    expect(result.valid).toBe(true);
    expect(result.publicationReady).toBe(false);
    const issue = result.issues.find(
      (i) => i.code === "PDF_LINEAGE_HASH_MISMATCH",
    );
    expect(issue).toBeDefined();
    expect(issue?.target.targetId).toBe(diktat.id);
  });

  test("permits a complete one-page PDF when review and lineage are current", async () => {
    const article = createValidArticleEntity();
    const review = createApprovedReview(article);
    const result = await evaluateProductBundleQualityPolicy([article], {
      publisherId: review.reviewerId,
      pedagogicReview: review,
      pdfEvidence: [{ ...createValidPdfEvidence(article), pageCount: 1 }],
    });
    expect(result.publicationReady).toBe(true);
  });

  test("rejects publication when ready PDF page count is outside 1 to 4 pages", async () => {
    const article = createValidArticleEntity();
    const review = createApprovedReview(article);

    for (const badPageCount of [0, 5]) {
      const pdfEvidence: PdfArtifactEvidence[] = [
        {
          ...createValidPdfEvidence(article),
          pageCount: badPageCount,
        },
      ];

      const result = await evaluateProductBundleQualityPolicy([article], {
        publisherId: review.reviewerId,
        pedagogicReview: review,
        pdfEvidence,
      });

      expect(result.valid).toBe(true);
      expect(result.publicationReady).toBe(false);
      const issue = result.issues.find(
        (i) => i.code === "PDF_PAGE_COUNT_OUT_OF_BOUNDS",
      );
      expect(issue).toBeDefined();
    }
  });

  test("rejects publication when dependency is not UP_TO_DATE", async () => {
    const article = createValidArticleEntity();
    const review = createApprovedReview(article);
    const pdfEvidence = [createValidPdfEvidence(article)];

    const dependencies: ProductDependency[] = [
      {
        id: "dep-001",
        upstreamEntityType: "idea",
        upstreamEntityId: "idea-limit-precision",
        upstreamVersion: 1,
        upstreamHash: HASH_A,
        downstreamEntityType: "article",
        downstreamEntityId: article.id,
        downstreamVersion: 1,
        downstreamHash: article.generationHash,
        freshness: "NEEDS_REVIEW",
      },
    ];

    const result = await evaluateProductBundleQualityPolicy(
      {
        products: [article],
        dependencies,
      },
      {
        publisherId: review.reviewerId,
        pedagogicReview: review,
        pdfEvidence,
      },
    );

    expect(result.valid).toBe(true);
    expect(result.publicationReady).toBe(false);
    const issue = result.issues.find(
      (i) => i.code === "PRODUCT_DEPENDENCY_NEEDS_REVIEW",
    );
    expect(issue).toBeDefined();
  });

  test("evaluates non-article bundle without requiring article pedagogic review or PDF evidence", async () => {
    const questionProduct: ProductEntity = {
      id: "q-limit-001",
      productType: "question",
      courseId: "kalkulus-1",
      version: 1,
      status: "draft",
      ideaLinks: [
        {
          id: "idea-limit-precision",
          version: 1,
          semanticHash: HASH_A,
          weight: 1,
          role: "primary",
        },
      ],
      sourceRefs: [
        {
          sourceId: "source-001",
          version: 1,
          checksum: HASH_A,
          excerptIds: ["ex-1"],
        },
      ],
      schemaVersion: "1.0",
      sourceHash: HASH_A,
      generationHash: HASH_A,
      creatorId: "creator-001",
      questionType: "multiple_choice",
      prompt: "Berapakah nilai limit f(x) saat x mendekati 3?",
      options: [
        { id: "opt-a", text: "7", isCorrect: true },
        { id: "opt-b", text: "5", isCorrect: false },
      ],
      difficulty: "easy",
      cognitiveLevel: "understand",
      reasoningPattern: "direct_substitution",
      relationTypes: ["required"],
      ideaRelations: [
        {
          ideaId: "idea-limit-precision",
          relationType: "required",
        },
      ],
      itbSource: {
        referenceId: "itb-ref-001",
        eventName: "UAS Kalkulus 2024",
      },
      itbCuration: [
        {
          referenceId: "itb-ref-001",
          dimensions: {
            difficulty: "similar",
            format: "similar",
            terminology: "similar",
            reasoningPattern: "similar",
          },
          curatorNote: "Sesuai standar kurikulum.",
        },
      ],
    };

    const result = await evaluateProductBundleQualityPolicy([questionProduct]);

    expect(result.valid).toBe(true);
    expect(result.publicationReady).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});
