import { resolveProductV4PdfBinding, selectProductPdfEvidence, type ProductV4PdfBinding } from "./product-pdf-selection";
import { listProcessingLegacyPdfRequests } from "./product-diktat-queue";
import type { ProductV4VerificationPlan } from "./product-v4-verification";
import { findUnmarkedScientificProse } from "@/lib/math/unmarked-scientific";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reviewPedagogiBundle, buktiPdfBundle, imporBundle, reviewBundle } from "@/db/schema";
import { assertStoredSolutionReview } from "@/lib/solutions/review";
import { legacyArticlePublicMarkdown } from "@/lib/materials/legacy-article-public";
import { createHash } from "node:crypto";
import { deterministicProductSerialization } from "./product-validator";
import type {
  ProductBundleManifest,
  ProductDependency,
  ProductEntity,
} from "./product-validator";
import { compileArticleProduct } from "@/lib/materials/compiler";
import { articleDocumentSchema } from "@/lib/materials/article-contract";
import { evaluateArticleQuality } from "@/lib/materials/quality-gates";
import { evaluateProductBundleQuality } from "@/lib/authoring/quality/product-bundle";
import {
  validateSectionPedagogyReferences,
  workedExamplePayloadSchema,
  formativeCheckPayloadSchema,
} from "@/lib/materials/pedagogy-contract";
import { visualSpecSchema } from "@/lib/materials/visual-contract";
import {
  QUALITY_POLICY_VERSION,
  computePedagogyContentFingerprint,
  pedagogicReviewDecisionSchema,
  validatePedagogicRubricDecision,
  type DiagnosticIssue,
  type QualityEvaluation,
  type PedagogicReviewDecision,
  type PedagogicRubricItem,
  type PedagogicException,
} from "@/lib/materials/quality-policy";
import {
  validatePdfArtifactEvidence,
  type PdfArtifactEvidence,
} from "@/lib/materials/pdf-artifact-contract";

/** Bind a review to every Article and linked Diktat, independent of ZIP order. */
export function productPedagogyFingerprint(products: readonly ProductEntity[]): string {
  const articles = products.filter((p): p is Extract<ProductEntity, { productType: "article" }> => p.productType === "article").sort((a, b) => a.id.localeCompare(b.id));
  const diktats = products.filter((p): p is Extract<ProductEntity, { productType: "diktat" }> => p.productType === "diktat");
  if (!articles.length) return "";
  const pairs = articles.map(article => ({ article, diktats: diktats.filter(d => d.sourceArticleId === article.id).sort((a, b) => a.id.localeCompare(b.id)) }));
  if (pairs.length === 1 && pairs[0].diktats.length <= 1) return computePedagogyContentFingerprint({ article: pairs[0].article as unknown as Record<string, unknown>, diktat: pairs[0].diktats[0] as unknown as Record<string, unknown> | undefined });
  return createHash("sha256").update(deterministicProductSerialization(pairs)).digest("hex");
}

export type ProductSectionTarget = { productId: string; sectionId: string };
type ProductSectionReviewInput = {
  requiredSections?: readonly ProductSectionTarget[];
  requiredSectionIds?: readonly string[];
  reviewerId: string;
  reviews: readonly { reviewerId: string; productId?: string | null; targetType: string; targetId: string | null; status: string }[];
};
export function productSectionReviewState(input: ProductSectionReviewInput) {
  const scoped = input.requiredSections !== undefined;
  const required = input.requiredSections ?? (input.requiredSectionIds ?? []).map(sectionId => ({ productId: "", sectionId }));
  const counts = new Map<string, number>();
  for (const section of required) counts.set(section.sectionId, (counts.get(section.sectionId) ?? 0) + 1);
  if (!scoped && [...counts.values()].some(count => count > 1)) throw new Error("PRODUCT_BUNDLE_SECTION_SCOPE_REQUIRED");
  const relevant = (section: ProductSectionTarget) => input.reviews.filter(review =>
    review.reviewerId === input.reviewerId && review.targetType === "article_section" && review.targetId === section.sectionId
    && (!scoped || (review.productId ? review.productId === section.productId : counts.get(section.sectionId) === 1)));
  return {
    missing: required.filter(section => !relevant(section).some(review => review.status === "approved")),
    changesRequested: required.filter(section => relevant(section).some(review => review.status === "changes_requested")),
  };
}
export function assertProductSectionReviews(input: ProductSectionReviewInput): void {
  const state = productSectionReviewState(input);
  const label = (section: ProductSectionTarget) => section.productId ? `${section.productId}/${section.sectionId}` : section.sectionId;
  if (state.changesRequested.length) throw new Error(`PRODUCT_BUNDLE_SECTION_CHANGES_REQUESTED:${state.changesRequested.map(label).sort().join(",")}`);
  if (state.missing.length) throw new Error(`PRODUCT_BUNDLE_SECTION_APPROVAL_REQUIRED:${state.missing.map(label).join(",")}`);
}

export interface ProductBundleEvaluationContext {
  imporBundleId?: string;
  publisherId?: string;
  pedagogicReview?: PedagogicReviewDecision | null;
  pdfEvidence?: readonly PdfArtifactEvidence[] | null;
  pendingPdfRequests?: readonly { productId: string }[];
  tx?: any;
  v4Verification?: { plan: ProductV4VerificationPlan; attemptId?: string; stagingAuditId?: string; receipt?: unknown; evaluation: { ready: boolean } } | null;
}

export interface ProductBundleEvaluationInput {
  bundle?: {
    manifest?: ProductBundleManifest;
    products: readonly ProductEntity[];
    dependencies?: readonly ProductDependency[];
  };
  products?: readonly ProductEntity[];
  dependencies?: readonly ProductDependency[];
  manifest?: ProductBundleManifest;
}

/** Evaluates content, review, and PDF evidence against publication requirements. */
export async function evaluateProductBundleQualityPolicy(
  input: ProductBundleEvaluationInput | readonly ProductEntity[],
  context: ProductBundleEvaluationContext = {},
): Promise<QualityEvaluation> {
  const isInputArray = Array.isArray(input);
  const bundleInput = isInputArray ? undefined : (input as ProductBundleEvaluationInput);
  const products: readonly ProductEntity[] = isInputArray
    ? (input as readonly ProductEntity[])
    : bundleInput?.bundle?.products ?? bundleInput?.products ?? [];
  const dependencies: readonly ProductDependency[] = isInputArray
    ? []
    : bundleInput?.bundle?.dependencies ?? bundleInput?.dependencies ?? [];

  const manifest = bundleInput?.bundle?.manifest ?? bundleInput?.manifest;
  if (manifest?.schemaVersion === "product-bundle.v5") {
    const product = products[0];
    const valid = products.length === 1 && product?.productType === "solution_collection";
    const contentFingerprint = createHash("sha256").update(deterministicProductSerialization({ manifest, products, dependencies })).digest("hex");
    const issues: DiagnosticIssue[] = [];
    if (!valid) issues.push({ code: "PRODUCT_V5_PROFILE_MISMATCH", severity: "blocking", target: { targetType: "document", targetId: manifest.bundleId }, reason: "V5 requires one standalone collection.", remediation: "Provide a valid V5 collection." });
    if (dependencies.some(dep => dep.freshness !== "UP_TO_DATE")) issues.push({ code: "PRODUCT_DEPENDENCY_NEEDS_REVIEW", severity: "blocking", target: { targetType: "document", targetId: manifest.bundleId }, reason: "A dependency needs review.", remediation: "Refresh the locked dependencies." });
    let approved = false;
    if (valid && product.productType === "solution_collection" && context.imporBundleId && context.publisherId) {
      const connection = context.tx ?? db;
      try {
        const { assertLiveSolutionCollectionDependencies } = await import("./product-publication");
        await assertLiveSolutionCollectionDependencies({ product, dependencies, connection: context.tx });
      } catch {
        issues.push({ code: "PRODUCT_V5_LIVE_DEPENDENCY_MISMATCH", severity: "blocking", target: { targetType: "document", targetId: product.id }, reason: "The course, chapter or locked dependencies changed.", remediation: "Refresh the source and Idea context, revise the collection, and repeat review." });
      }
      const [row] = await connection.select({ checksum: imporBundle.checksum, status: imporBundle.status }).from(imporBundle).where(eq(imporBundle.id, context.imporBundleId)).limit(1);
      const [review] = await connection.select({ notes: reviewBundle.notes }).from(reviewBundle).where(and(eq(reviewBundle.imporBundleId, context.imporBundleId), eq(reviewBundle.reviewerId, context.publisherId), eq(reviewBundle.status, "approved"))).limit(1);
      if (row?.status === "draft" && row.checksum === manifest.bundleChecksum && review) {
        try { assertStoredSolutionReview({ product, revision: row.checksum, notes: review.notes }); approved = true; } catch { /* Stale or incomplete decisions do not grant release. */ }
      }
    }
    if (!approved) issues.push({ code: "PRODUCT_V5_REVIEW_REQUIRED", severity: "blocking", target: { targetType: "document", targetId: product?.id ?? manifest.bundleId }, reason: "The publisher must review every item for this revision.", remediation: "Review correctness, reasoning, problem provenance, solution provenance and release for every item, including any spoiler-free hint." });
    return { valid, publicationReady: valid && issues.length === 0, policyVersion: "solution-collection-review.v1", contentFingerprint, issues, metrics: { collectionCount: valid ? 1 : 0, itemCount: product?.productType === "solution_collection" ? product.collection.items.length : 0, blockingIssueCount: issues.length, warningIssueCount: 0 } };
  }

  const issues: DiagnosticIssue[] = [];
  const findingIdentity = new Map<DiagnosticIssue, string>();

  const articles = products.filter((p): p is Extract<ProductEntity, { productType: "article" }> => p.productType === "article");
  const diktats = products.filter((p): p is Extract<ProductEntity, { productType: "diktat" }> => p.productType === "diktat");
  const article = articles[0];
  const diktat = diktats.find(d => d.sourceArticleId === article?.id);
  const contentFingerprint = productPedagogyFingerprint(products);

  for (const article of articles) {
    const isV3 = Boolean(article.sections && article.sections.length > 0);
    if (!isV3) {
      try { legacyArticlePublicMarkdown(article.blocks); } catch {
        issues.push({ code: "PRODUCT_ARTICLE_LEGACY_PAYLOAD_INVALID", severity: "blocking", target: { targetType: "document", targetId: article.id }, reason: "The assembled legacy Article contains an ambiguous authoring payload.", remediation: "Use one validated envelope per block. Put intentionally public JSON examples inside code delimiters, then restage and review the exact revision." });
      }
    }
    if (isV3) {
      const presentationCodes = new Set([
        "ARTICLE_VISUAL_OPPORTUNITY_MISSING",
        "ARTICLE_FORMULA_CROWDED",
        "ARTICLE_REPEATED_PASSAGE",
        "ARTICLE_VERIFICATION_REPEATED",
        "ARTICLE_STEPS_REPEATED",
      ]);
      for (const finding of evaluateProductBundleQuality({ products: [article] }).issues) {
        if (!presentationCodes.has(finding.code)) continue;
        const warning: DiagnosticIssue = {
          code: finding.code,
          severity: "warning",
          target: { targetType: "section", targetId: finding.entity?.split(":")[1] ?? article.id },
          reason: finding.message,
          remediation: "Periksa bagian ini secara editorial, rapikan pengulangan atau rumus, dan tambahkan visual bila membantu tujuan belajar.",
        };
        issues.push(warning);
        if (finding.code === "ARTICLE_FORMULA_CROWDED" && finding.entity) {
          findingIdentity.set(warning, finding.entity);
        }
      }
      const allSectionIds = article.sections.map((s) => s.id);
      const availableVisualIds = (article.visuals ?? []).map((v) => v.id);

      if (article.visuals && article.visuals.length > 0) {
        const visualIds = article.visuals.map((v) => v.id);
        if (new Set(visualIds).size !== visualIds.length) {
          issues.push({
            code: "PRODUCT_VISUAL_DUPLICATE_ID",
            severity: "blocking",
            target: { targetType: "document", targetId: article.id },
            reason: "Article contains duplicate visual IDs",
            remediation: "Ensure all visual IDs are unique within the article visual registry",
          });
        }
        for (const visual of article.visuals) {
          const parsedVisual = visualSpecSchema.safeParse(visual);
          if (!parsedVisual.success) {
            for (const issue of parsedVisual.error.issues) {
              issues.push({
                code: "VISUAL_SPEC_INVALID",
                severity: "blocking",
                target: { targetType: "visual", targetId: visual.id },
                reason: issue.message,
                remediation: "Correct visual specification according to schema bounds and rules",
              });
            }
          }
        }
      }

      for (const section of article.sections) {
        if (section.pedagogy) {
          const pedResult = validateSectionPedagogyReferences({
            sectionId: section.id,
            sectionBlocks: section.blocks.map((b) => ({ id: b.id, blockType: b.blockType })),
            pedagogy: section.pedagogy,
            availableSectionIds: allSectionIds,
            availableVisualIds,
          });
          if (!pedResult.valid) {
            for (const err of pedResult.errors) {
              const [errCode, ...rest] = err.split(":");
              issues.push({
                code: errCode.trim(),
                severity: "blocking",
                target: { targetType: "section", targetId: section.id },
                reason: rest.join(":").trim() || err,
                remediation: "Resolve section pedagogy reference to point to a valid block, section, or visual",
              });
            }
          }
        }

        for (const block of section.blocks) {
          if (block.workedExamplePayload && block.blockType !== "worked_example") {
            issues.push({
              code: "PRODUCT_BLOCK_PAYLOAD_MISMATCH",
              severity: "blocking",
              target: { targetType: "block", targetId: block.id },
              reason: `block ${block.id} has workedExamplePayload but blockType is ${block.blockType}`,
              remediation: "workedExamplePayload is only allowed on worked_example blocks",
            });
          }
          if (
            block.formativeCheckPayload &&
            block.blockType !== "retrieval_prompt" &&
            block.blockType !== "retrieval_close"
          ) {
            issues.push({
              code: "PRODUCT_BLOCK_PAYLOAD_MISMATCH",
              severity: "blocking",
              target: { targetType: "block", targetId: block.id },
              reason: `block ${block.id} has formativeCheckPayload but blockType is ${block.blockType}`,
              remediation: "formativeCheckPayload is only allowed on retrieval_prompt or retrieval_close blocks",
            });
          }
          if (block.visualIds) {
            if (new Set(block.visualIds).size !== block.visualIds.length) {
              issues.push({
                code: "PRODUCT_BLOCK_VISUAL_DUPLICATE",
                severity: "blocking",
                target: { targetType: "block", targetId: block.id },
                reason: `block ${block.id} contains duplicate visual references`,
                remediation: "Keep each visual reference at most once per block",
              });
            }
            for (const visualId of block.visualIds) {
              if (!availableVisualIds.includes(visualId)) {
                issues.push({
                  code: "PRODUCT_BLOCK_VISUAL_REFERENCE_INVALID",
                  severity: "blocking",
                  target: { targetType: "block", targetId: block.id },
                  reason: `block ${block.id} references unknown visual ${visualId}`,
                  remediation: "Reference a visual ID from the article visual registry",
                });
              }
            }
          }
          if (block.workedExamplePayload) {
            const parsed = workedExamplePayloadSchema.safeParse(block.workedExamplePayload);
            if (!parsed.success) {
              for (const issue of parsed.error.issues) {
                issues.push({
                  code: "WORKED_EXAMPLE_PAYLOAD_INVALID",
                  severity: "blocking",
                  target: { targetType: "block", targetId: block.id },
                  reason: issue.message,
                  remediation: "Format worked example steps contiguously starting at index 0 with non-empty reasons and verification",
                });
              }
            }
          }
          if (block.formativeCheckPayload) {
            const parsed = formativeCheckPayloadSchema.safeParse(block.formativeCheckPayload);
            if (!parsed.success) {
              for (const issue of parsed.error.issues) {
                issues.push({
                  code: "FORMATIVE_CHECK_PAYLOAD_INVALID",
                  severity: "blocking",
                  target: { targetType: "block", targetId: block.id },
                  reason: issue.message,
                  remediation: "Format formative check with valid options, correct answer, and explanation",
                });
              }
            }
          }
        }
      }
    }

    try {
      const compilation = compileArticleProduct(article, { strict: false });
      const contract = articleDocumentSchema.safeParse(compilation.article);
      if (!contract.success) {
        for (const issue of contract.error.issues) {
          issues.push({
            code: "ARTICLE_CONTRACT_INVALID",
            severity: "blocking",
            target: { targetType: "document", targetId: article.id },
            reason: issue.message,
            remediation: "Fix article document schema issues",
          });
        }
      }
      const quality = evaluateArticleQuality(compilation.article);
      if (!quality.passed) {
        for (const qIssue of quality.issues) {
          issues.push({
            code: qIssue.code,
            severity: "blocking",
            target: qIssue.blockId
              ? { targetType: "block", targetId: qIssue.blockId }
              : qIssue.ideaId
                ? { targetType: "idea", targetId: qIssue.ideaId }
                : { targetType: "document", targetId: article.id },
            reason: qIssue.message,
            remediation: "Fulfill article structure and quality gate requirements",
          });
        }
      }
    } catch (err) {
      issues.push({
        code: "ARTICLE_COMPILATION_FAILED",
        severity: "blocking",
        target: { targetType: "document", targetId: article.id },
        reason: err instanceof Error ? err.message : String(err),
        remediation: "Ensure article compiles cleanly",
      });
    }
  }

  for (const diktat of diktats) {
    if (diktat.sourceArticleId === diktat.id) {
      issues.push({
        code: "PRODUCT_DIKTAT_LINEAGE_INVALID",
        severity: "blocking",
        target: { targetType: "document", targetId: diktat.id },
        reason: `diktat ${diktat.id} cannot reference itself as its Article`,
        remediation: "Point diktat sourceArticleId to a valid source article",
      });
    }
    const sourceArticle = products.find(
      (p) => p.productType === "article" && p.id === diktat.sourceArticleId,
    );
    if (!sourceArticle) {
      issues.push({
        code: "DIKTAT_ARTICLE_MISSING",
        severity: "blocking",
        target: { targetType: "document", targetId: diktat.id },
        reason: `diktat ${diktat.id} references missing source article ${diktat.sourceArticleId}`,
        remediation: "Include the referenced source article in the bundle",
      });
    } else {
      const articleIdeas = new Set(sourceArticle.ideaLinks.map((l) => l.id));
      const diktatIdeas = new Set(diktat.ideaLinks.map((l) => l.id));
      for (const ideaId of articleIdeas) {
        if (!diktatIdeas.has(ideaId)) {
          issues.push({
            code: "DIKTAT_IDEA_COVERAGE_MISMATCH",
            severity: "blocking",
            target: { targetType: "idea", targetId: ideaId },
            reason: `diktat ${diktat.id} does not cover Idea ${ideaId}`,
            remediation: "Ensure diktat covers all Ideas present in the source article",
          });
        }
      }
    }
  }

  const deterministicBlocking = issues.filter((i) => i.severity === "blocking");
  const valid = deterministicBlocking.length === 0;

  for (const dep of dependencies) {
    if (dep.freshness !== "UP_TO_DATE") {
      issues.push({
        code: "PRODUCT_DEPENDENCY_NEEDS_REVIEW",
        severity: "blocking",
        target: { targetType: "dependency", targetId: dep.id },
        reason: `Dependency ${dep.id} has freshness ${dep.freshness}`,
        remediation: "Resolve and update all dependencies to UP_TO_DATE before publication",
      });
    }
  }

  let reviewRows: Array<typeof reviewPedagogiBundle.$inferSelect> | undefined;
  if (context.pedagogicReview === undefined && context.imporBundleId) {
    const txOrDb = context.tx ?? db;
    reviewRows = (await txOrDb
      .select()
      .from(reviewPedagogiBundle)
      .where(eq(reviewPedagogiBundle.imporBundleId, context.imporBundleId))
      .orderBy(desc(reviewPedagogiBundle.createdAt), desc(reviewPedagogiBundle.id))) as Array<typeof reviewPedagogiBundle.$inferSelect>;
  }

  let pdfEvidenceList: readonly PdfArtifactEvidence[] | undefined;
  if (context.pdfEvidence !== undefined) {
    pdfEvidenceList = context.pdfEvidence ?? [];
  } else if (context.imporBundleId && article) {
    const txOrDb = context.tx ?? db;
    const evidenceRows = await txOrDb
      .select()
      .from(buktiPdfBundle)
      .where(eq(buktiPdfBundle.imporBundleId, context.imporBundleId))
      .orderBy(desc(buktiPdfBundle.createdAt), desc(buktiPdfBundle.id));
    pdfEvidenceList = evidenceRows as unknown as PdfArtifactEvidence[];
  }

  const isV4 = manifest?.schemaVersion === "product-bundle.v4" || products.some((product) => product.productType === "article" && product.schemaVersion === "article.v4");
  if (!isV4 && context.imporBundleId) {
    const connection = context.tx ?? db;
    let revision = manifest?.bundleChecksum;
    if (!revision) {
      const [row] = await connection.select({ checksum: imporBundle.checksum }).from(imporBundle).where(eq(imporBundle.id, context.imporBundleId)).limit(1);
      revision = row?.checksum;
    }
    if (revision) {
      const requests = context.pendingPdfRequests ?? await listProcessingLegacyPdfRequests({ importId: context.imporBundleId, expectedRevision: revision, connection });
      for (const request of requests) issues.push({ code: "PDF_REQUEST_PROCESSING", severity: "blocking", target: { targetType: "pdf", targetId: request.productId }, reason: "A PDF request for this revision is still being processed.", remediation: "Recover the request outcome or wait for its deadline before publication." });
    }
  }
  let verification = context.v4Verification;
  let validationReport: Record<string, unknown> | undefined;
  if (isV4 && context.imporBundleId) {
    const connection = context.tx ?? db;
    const [row] = await connection.select({ validationReport: imporBundle.validationReport }).from(imporBundle).where(eq(imporBundle.id, context.imporBundleId)).limit(1);
    validationReport = row?.validationReport;
    if (verification === undefined) {
      try {
        const ref = validationReport?.productV4Verification as { runId?: unknown; planHash?: unknown } | undefined;
        if (typeof ref?.runId === "string" && typeof ref.planHash === "string") {
          const current = await (await import("./product-v4-verification-service")).getProductV4VerificationReadiness(context.imporBundleId, ref.runId);
          if (current.plan.planHash === ref.planHash) verification = current;
        }
      } catch { verification = null; }
    }
  }

  const pairs: { article: (typeof articles)[number]; diktat: (typeof diktats)[number] | undefined }[] = articles.flatMap(article => {
    const linked = diktats.filter(d => d.sourceArticleId === article.id);
    const targets: Array<(typeof diktats)[number] | undefined> = linked.length ? linked : [undefined];
    return targets.map(diktat => ({ article, diktat }));
  });
  const gateResults = (pairs.length ? pairs : [{ article: undefined, diktat: undefined }]).map(({ article, diktat }) => evaluateProductBundleReviewAndPdfGate({
    imporBundleId: context.imporBundleId ?? "",
    hasArticle: Boolean(article),
    articleId: article?.id ?? "",
    diktatId: diktat?.id ?? null,
    contentFingerprint,
    articleGenerationHash: article?.generationHash ?? null,
    articleVersion: article?.version ?? null,
    v4PdfBinding: isV4 ? (diktat ? resolveProductV4PdfBinding({ importId: context.imporBundleId ?? "", diktatId: diktat.id, validationReport, verification }) : null) : undefined,
    diktatGenerationHash: diktat?.generationHash ?? null,
    publisherId: context.publisherId,
    reviewDecision: context.pedagogicReview,
    reviewRows,
    pdfEvidenceRows: pdfEvidenceList,
  }));
  const gateResult = gateResults[0];

  if (isV4) {
    for (const product of products) for (const finding of findUnmarkedScientificProse(product)) issues.push({
      code: "PRODUCT_V4_UNMARKED_SCIENTIFIC_NOTATION", severity: "blocking", target: { targetType: "document", targetId: product.id },
      reason: `Unmarked mathematical notation in ${finding.path}: ${finding.notation}`,
      remediation: "Use explicit inline or display math. Write scientific numbers with \\times 10^{...}, never a numeric e notation literal, and verify the rendered meaning.",
    });
    if (!diktat) issues.push({ code: "PRODUCT_V4_DIKTAT_REQUIRED", severity: "blocking", target: { targetType: "document", targetId: article?.id ?? "manifest.json" }, reason: "V4 publication requires the authored Diktat for the same Article revision.", remediation: "Add a traced Diktat with complete essential formula and Idea coverage." });
    const expectedContentHash = manifest ? createHash("sha256").update(deterministicProductSerialization({ manifest, products, dependencies })).digest("hex") : null;
    if (!verification?.evaluation.ready || verification.plan.contentHash !== expectedContentHash) issues.push({
      code: "PRODUCT_V4_VERIFICATION_REQUIRED",
      severity: "blocking",
      target: { targetType: "document", targetId: manifest?.bundleId ?? article?.id ?? "manifest.json" },
      reason: "The complete current V4 verification matrix has not passed with trusted artifacts.",
      remediation: "Request verification for this exact revision and resolve every missing, failed or stale check.",
    });
  }

  const reviewDecision = gateResult.reviewDecision;
  issues.push(...gateResults.flatMap(result => result.issues));

  const uniqueIssues = [
    ...new Map(
      issues.map((item) => [`${item.code}:${item.target.targetType}:${item.target.targetId}:${findingIdentity.get(item) ?? ""}`, item]),
    ).values(),
  ];

  const publicationReady = valid && uniqueIssues.filter((i) => i.severity === "blocking").length === 0;

  const totalWords = articles.reduce((total, article) => total + (article.sections && article.sections.length > 0
      ? article.sections.flatMap((s) => s.blocks).reduce((sum, b) => sum + b.contentMarkdown.split(/\s+/).filter(Boolean).length, 0)
      : article.blocks.reduce((sum, b) => sum + b.content.split(/\s+/).filter(Boolean).length, 0)), 0);

  const metrics: Record<string, number> = {
    articleCount: products.filter((p) => p.productType === "article").length,
    diktatCount: products.filter((p) => p.productType === "diktat").length,
    totalWordCount: totalWords,
    visualCount: articles.reduce((total, article) => total + (article.visuals?.length ?? 0), 0),
    blockingIssueCount: uniqueIssues.filter((i) => i.severity === "blocking").length,
    warningIssueCount: uniqueIssues.filter((i) => i.severity === "warning").length,
    rubricCriteriaMetCount: reviewDecision?.criteria
      ? reviewDecision.criteria.filter((c) => c.status === "met").length
      : 0,
  };

  return {
    valid,
    publicationReady,
    policyVersion: QUALITY_POLICY_VERSION,
    contentFingerprint,
    issues: uniqueIssues,
    metrics,
  };
}

export interface ProductReviewAndPdfGateInput {
  imporBundleId: string;
  bundleStatus?: string;
  hasArticle: boolean;
  articleId: string;
  diktatId?: string | null;
  contentFingerprint: string;
  articleGenerationHash?: string | null;
  articleVersion?: number | null;
  v4PdfBinding?: ProductV4PdfBinding | null;
  diktatGenerationHash?: string | null;
  publisherId?: string;
  reviewDecision?: PedagogicReviewDecision | null;
  reviewRows?: ReadonlyArray<{
    id: string;
    imporBundleId?: string;
    reviewerId?: string;
    status: string;
    policyVersion: string;
    contentFingerprint: string;
    rubric: unknown;
    exceptions: unknown;
    notes: string | null;
  }>;
  pdfEvidenceRows?: ReadonlyArray<PdfArtifactEvidence>;
}

export interface ProductReviewAndPdfGateResult {
  reviewDecision: PedagogicReviewDecision | null;
  reviewStatus: "not_required" | "missing" | "pending" | "approved" | "rejected" | "changes_requested" | "stale";
  pdfEvidenceStatus: "not_required" | "missing" | "pending" | "ready" | "failed" | "stale" | "published";
  selectedPdfEvidence: PdfArtifactEvidence | null;
  issues: DiagnosticIssue[];
}

/**
 * Shared evaluator for pedagogic review and PDF artifact evidence readiness.
 * Used by both `evaluateProductBundleQualityPolicy` (publication gate) and MCP readiness readers (`authoring.list_imports`, `authoring.get_import`).
 */
export function evaluateProductBundleReviewAndPdfGate(
  input: ProductReviewAndPdfGateInput,
): ProductReviewAndPdfGateResult {
  const issues: DiagnosticIssue[] = [];
  if (!input.hasArticle) {
    return {
      reviewDecision: null,
      reviewStatus: "not_required",
      pdfEvidenceStatus: "not_required",
      selectedPdfEvidence: null,
      issues,
    };
  }

  let reviewDecision: PedagogicReviewDecision | null = input.reviewDecision ?? null;
  if (input.reviewDecision === undefined && input.reviewRows && input.reviewRows.length > 0) {
    const reviewRows = input.reviewRows;
    let selectedRow = reviewRows.find((row) => {
      const matchesFingerprint = input.contentFingerprint ? row.contentFingerprint === input.contentFingerprint : true;
      const matchesPolicy = row.policyVersion === QUALITY_POLICY_VERSION;
      const matchesPublisher = input.publisherId ? row.reviewerId === input.publisherId : true;
      return matchesFingerprint && matchesPolicy && matchesPublisher;
    });

    if (!selectedRow) {
      selectedRow =
        (input.publisherId
          ? reviewRows.find(
              (r) =>
                r.reviewerId === input.publisherId &&
                (!input.contentFingerprint || r.contentFingerprint === input.contentFingerprint),
            )
          : undefined) ??
        reviewRows.find(
          (r) =>
            (!input.contentFingerprint || r.contentFingerprint === input.contentFingerprint) &&
            r.policyVersion === QUALITY_POLICY_VERSION,
        ) ??
        (input.contentFingerprint
          ? reviewRows.find((r) => r.contentFingerprint === input.contentFingerprint)
          : undefined) ??
        (input.publisherId
          ? reviewRows.find(
              (r) =>
                r.reviewerId === input.publisherId &&
                r.policyVersion === QUALITY_POLICY_VERSION,
            )
          : undefined) ??
        reviewRows.find((r) => r.policyVersion === QUALITY_POLICY_VERSION) ??
        reviewRows[0];
    }

    if (selectedRow) {
      const criteria = Array.isArray(selectedRow.rubric)
        ? (selectedRow.rubric as unknown as PedagogicRubricItem[])
        : Array.isArray((selectedRow.rubric as any)?.criteria)
          ? ((selectedRow.rubric as any).criteria as PedagogicRubricItem[])
          : [];
      const exceptions = Array.isArray(selectedRow.exceptions)
        ? (selectedRow.exceptions as unknown as PedagogicException[])
        : Array.isArray((selectedRow.exceptions as any)?.exceptions)
          ? ((selectedRow.exceptions as any).exceptions as PedagogicException[])
          : [];

      reviewDecision = {
        imporBundleId: selectedRow.imporBundleId ?? input.imporBundleId,
        reviewerId: selectedRow.reviewerId ?? "mcp-readiness-evaluator",
        policyVersion: selectedRow.policyVersion,
        contentFingerprint: selectedRow.contentFingerprint,
        status: (selectedRow.status as PedagogicReviewDecision["status"]) ?? "pending",
        criteria,
        exceptions,
        notes: selectedRow.notes ?? undefined,
      };
    }
  }

  let reviewStatus: ProductReviewAndPdfGateResult["reviewStatus"] = "missing";
  if (!reviewDecision) {
    reviewStatus = "missing";
    issues.push({
      code: "PEDAGOGIC_REVIEW_MISSING",
      severity: "blocking",
      target: { targetType: "rubric", targetId: input.articleId },
      reason: "Persisted pedagogic review is missing for this article",
      remediation: "Record an approved bundle decision after reviewing its sections",
    });
  } else {
    reviewStatus = (reviewDecision.status as ProductReviewAndPdfGateResult["reviewStatus"]) ?? "pending";
    if (reviewDecision.policyVersion !== QUALITY_POLICY_VERSION) {
      reviewStatus = "stale";
      issues.push({
        code: "POLICY_VERSION_MISMATCH",
        severity: "blocking",
        target: { targetType: "rubric", targetId: input.articleId },
        reason: `Review policy version '${reviewDecision.policyVersion}' does not match current '${QUALITY_POLICY_VERSION}'`,
        remediation: "Re-evaluate review under current quality policy version",
      });
    }

    if (input.contentFingerprint && reviewDecision.contentFingerprint !== input.contentFingerprint) {
      reviewStatus = "stale";
      issues.push({
        code: "FINGERPRINT_MISMATCH",
        severity: "blocking",
        target: { targetType: "rubric", targetId: input.articleId },
        reason: "Content has changed since the pedagogic review was recorded",
        remediation: "Conduct and record a new review for the updated content fingerprint",
      });
    }

    if (input.publisherId && reviewDecision.reviewerId !== input.publisherId) {
      issues.push({
        code: "REVIEWER_CONTEXT_MISMATCH",
        severity: "blocking",
        target: { targetType: "rubric", targetId: input.articleId },
        reason: `Approval reviewer '${reviewDecision.reviewerId}' does not match publisher context '${input.publisherId}'`,
        remediation: "Approval must belong to the authorized publication actor",
      });
    }

    if (reviewDecision.status === "rejected") {
      issues.push({
        code: "PEDAGOGIC_REVIEW_REJECTED",
        severity: "blocking",
        target: { targetType: "rubric", targetId: input.articleId },
        reason: "Pedagogic review status is rejected",
        remediation: "Address reviewer findings and resubmit for review",
      });
    } else if (reviewDecision.status === "changes_requested") {
      issues.push({
        code: "PEDAGOGIC_REVIEW_CHANGES_REQUESTED",
        severity: "blocking",
        target: { targetType: "rubric", targetId: input.articleId },
        reason: "Pedagogic review requires changes before publication",
        remediation: "Revise requested sections and resubmit for approval",
      });
    } else if (reviewDecision.status === "pending") {
      issues.push({
        code: "PEDAGOGIC_REVIEW_PENDING",
        severity: "blocking",
        target: { targetType: "rubric", targetId: input.articleId },
        reason: "Pedagogic review is pending approval",
        remediation: "Await reviewer approval before publication",
      });
    } else if (reviewDecision.status !== "approved") {
      issues.push({
        code: "PEDAGOGIC_REVIEW_NOT_APPROVED",
        severity: "blocking",
        target: { targetType: "rubric", targetId: input.articleId },
        reason: `Pedagogic review status is '${reviewDecision.status}'`,
        remediation: "Review must be approved before publication",
      });
    }

    if (reviewDecision.status === "approved") {
      const parsed = pedagogicReviewDecisionSchema.safeParse(reviewDecision);
      if (!parsed.success) issues.push({ code: "PEDAGOGIC_REVIEW_INVALID", severity: "blocking", target: { targetType: "rubric", targetId: input.articleId }, reason: "The stored pedagogic review is incomplete or invalid.", remediation: "Record a complete anchored review for the current revision." });
      else {
        const rubricResult = validatePedagogicRubricDecision(parsed.data);
        if (!rubricResult.valid) issues.push(...rubricResult.issues);
      }
    }
  }

  const targetPdfProductId = input.diktatId || input.articleId;
  const expectedArticleHash = input.articleGenerationHash ?? undefined;
  const expectedDiktatHash = input.diktatId ? input.diktatGenerationHash ?? undefined : expectedArticleHash;
  const evidence = selectProductPdfEvidence({
    rows: input.pdfEvidenceRows ?? [], imporBundleId: input.imporBundleId,
    articleId: input.articleId, diktatId: input.diktatId, articleVersion: input.articleVersion,
    articleHash: expectedArticleHash, diktatHash: expectedDiktatHash, v4Binding: input.v4PdfBinding,
  });
  const pdfIssuesStart = issues.length;

  let pdfEvidenceStatus: ProductReviewAndPdfGateResult["pdfEvidenceStatus"] = "missing";
  if (!evidence) {
    if (input.bundleStatus === "published") {
      pdfEvidenceStatus = "published";
    } else {
      pdfEvidenceStatus = "missing";
      issues.push({
        code: "PDF_EVIDENCE_MISSING",
        severity: "blocking",
        target: { targetType: "pdf", targetId: targetPdfProductId },
        reason: input.diktatId
          ? `PDF artifact evidence is missing for diktat ${input.diktatId}`
          : "PDF artifact evidence is missing for this article",
        remediation: "Render PDF artifact and record evidence in bukti_pdf_bundle before publication",
      });
    }
  } else {
    pdfEvidenceStatus = evidence.status as ProductReviewAndPdfGateResult["pdfEvidenceStatus"];
    if (evidence.status === "pending") {
      issues.push({
        code: "PDF_EVIDENCE_PENDING",
        severity: "blocking",
        target: { targetType: "pdf", targetId: targetPdfProductId },
        reason: "PDF artifact rendering is still pending",
        remediation: "Wait for PDF generation to complete before publication",
      });
    } else if (evidence.status === "failed") {
      issues.push({
        code: "PDF_EVIDENCE_FAILED",
        severity: "blocking",
        target: { targetType: "pdf", targetId: targetPdfProductId },
        reason: `PDF rendering failed: ${evidence.failureCode ?? "unknown"}`,
        remediation: "Resolve rendering errors and re-generate PDF artifact",
      });
    } else if (evidence.status === "stale") {
      issues.push({
        code: "PDF_EVIDENCE_STALE",
        severity: "blocking",
        target: { targetType: "pdf", targetId: targetPdfProductId },
        reason: "PDF artifact is stale because article or diktat lineage changed",
        remediation: "Re-render PDF artifact against the updated content",
      });
    } else if (evidence.status !== "ready") {
      issues.push({
        code: "PDF_EVIDENCE_NOT_READY",
        severity: "blocking",
        target: { targetType: "pdf", targetId: targetPdfProductId },
        reason: `PDF evidence status is '${evidence.status}'`,
        remediation: "PDF evidence must be in 'ready' status before publication",
      });
    }

    if (expectedArticleHash && evidence.articleHash !== expectedArticleHash) {
      pdfEvidenceStatus = "stale";
      issues.push({
        code: "PDF_LINEAGE_HASH_MISMATCH",
        severity: "blocking",
        target: { targetType: "pdf", targetId: targetPdfProductId },
        reason: `PDF evidence articleHash '${evidence.articleHash}' does not match article '${expectedArticleHash}'`,
        remediation: "Re-render PDF artifact to match current article generation hash",
      });
    }

    if (expectedDiktatHash && evidence.diktatHash !== expectedDiktatHash) {
      pdfEvidenceStatus = "stale";
      issues.push({
        code: "PDF_LINEAGE_HASH_MISMATCH",
        severity: "blocking",
        target: { targetType: "pdf", targetId: targetPdfProductId },
        reason: `PDF evidence diktatHash '${evidence.diktatHash}' does not match diktat '${expectedDiktatHash}'`,
        remediation: "Re-render PDF artifact to match current diktat generation hash",
      });
    }

    if (input.articleVersion && evidence.articleVersion !== input.articleVersion) {
      pdfEvidenceStatus = "stale";
      issues.push({ code: "PDF_LINEAGE_VERSION_MISMATCH", severity: "blocking", target: { targetType: "pdf", targetId: targetPdfProductId }, reason: "PDF evidence does not match the current Article version.", remediation: "Re-render the PDF for the current Article." });
    }

    const pdfResult = validatePdfArtifactEvidence(evidence);
    if (!pdfResult.valid) {
      issues.push(...pdfResult.issues);
    }
  }

  if (input.v4PdfBinding !== undefined && (!input.v4PdfBinding || !evidence || evidence.storageKey !== input.v4PdfBinding.storageKey || evidence.printProfile !== input.v4PdfBinding.printProfile || evidence.pageCount !== input.v4PdfBinding.pageCount)) {
    pdfEvidenceStatus = "stale";
    issues.push({ code: "PDF_V4_RECEIPT_MISMATCH", severity: "blocking", target: { targetType: "pdf", targetId: targetPdfProductId }, reason: "PDF evidence is not attached to the current verification receipt.", remediation: "Verify this revision again and attach its PDF evidence." });
  }

  return {
    reviewDecision,
    reviewStatus,
    pdfEvidenceStatus,
    selectedPdfEvidence: evidence?.status === "ready" && !issues.slice(pdfIssuesStart).some(issue => issue.severity === "blocking") ? evidence : null,
    issues,
  };
}
