import { findUnmarkedScientificProse } from "@/lib/math/unmarked-scientific";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reviewPedagogiBundle, buktiPdfBundle } from "@/db/schema";
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

export function assertProductSectionReviews(input: {
  requiredSectionIds: readonly string[];
  reviewerId: string;
  reviews: readonly { reviewerId: string; targetType: string; targetId: string | null; status: string }[];
}): void {
  const relevant = input.reviews.filter((review) => review.reviewerId === input.reviewerId && review.targetType === "article_section" && review.targetId);
  const requestedChanges = new Set(relevant.filter((review) => review.status === "changes_requested").map((review) => review.targetId!));
  if (requestedChanges.size > 0) throw new Error(`PRODUCT_BUNDLE_SECTION_CHANGES_REQUESTED:${[...requestedChanges].sort().join(",")}`);
  const approved = new Set(relevant.filter((review) => review.status === "approved").map((review) => review.targetId!));
  const missing = input.requiredSectionIds.filter((sectionId) => !approved.has(sectionId));
  if (missing.length > 0) throw new Error(`PRODUCT_BUNDLE_SECTION_APPROVAL_REQUIRED:${missing.join(",")}`);
}

export interface ProductBundleEvaluationContext {
  imporBundleId?: string;
  publisherId?: string;
  pedagogicReview?: PedagogicReviewDecision | null;
  pdfEvidence?: readonly PdfArtifactEvidence[] | null;
  tx?: any;
  v4Verification?: { plan: { contentHash: string; planHash: string }; evaluation: { ready: boolean } } | null;
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

  const issues: DiagnosticIssue[] = [];
  const findingIdentity = new Map<DiagnosticIssue, string>();

  const article = products.find((p) => p.productType === "article") as
    | Extract<ProductEntity, { productType: "article" }>
    | undefined;
  const diktat = products.find((p) => p.productType === "diktat") as
    | Extract<ProductEntity, { productType: "diktat" }>
    | undefined;

  const contentFingerprint = article
    ? computePedagogyContentFingerprint({
        article: article as unknown as Record<string, unknown>,
        diktat: diktat ? (diktat as unknown as Record<string, unknown>) : undefined,
      })
    : "";

  if (article) {
    const isV3 = Boolean(article.sections && article.sections.length > 0);
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

  if (diktat) {
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

  const gateResult = evaluateProductBundleReviewAndPdfGate({
    imporBundleId: context.imporBundleId ?? "",
    hasArticle: Boolean(article),
    articleId: article?.id ?? "",
    diktatId: diktat?.id ?? null,
    contentFingerprint,
    articleGenerationHash: article?.generationHash ?? null,
    diktatGenerationHash: diktat?.generationHash ?? null,
    publisherId: context.publisherId,
    reviewDecision: context.pedagogicReview,
    reviewRows,
    pdfEvidenceRows: pdfEvidenceList,
  });

  const manifest = bundleInput?.bundle?.manifest ?? bundleInput?.manifest;
  if (manifest?.schemaVersion === "product-bundle.v4" || products.some((product) => product.productType === "article" && product.schemaVersion === "article.v4")) {
    for (const product of products) for (const finding of findUnmarkedScientificProse(product)) issues.push({
      code: "PRODUCT_V4_UNMARKED_SCIENTIFIC_NOTATION", severity: "blocking", target: { targetType: "document", targetId: product.id },
      reason: `Unmarked mathematical notation in ${finding.path}: ${finding.notation}`,
      remediation: "Use explicit inline or display math. Write scientific numbers with \\times 10^{...}, never a numeric e notation literal, and verify the rendered meaning.",
    });
    if (!diktat) issues.push({ code: "PRODUCT_V4_DIKTAT_REQUIRED", severity: "blocking", target: { targetType: "document", targetId: article?.id ?? "manifest.json" }, reason: "V4 publication requires the authored Diktat for the same Article revision.", remediation: "Add a traced Diktat with complete essential formula and Idea coverage." });
    let verification = context.v4Verification;
    if (!verification && context.imporBundleId) {
      try {
        const { getProductBundleImport } = await import("./product-staging");
        const row = await getProductBundleImport(context.imporBundleId);
        const ref = row?.validationReport.productV4Verification as { runId?: unknown; planHash?: unknown } | undefined;
        if (typeof ref?.runId === "string" && typeof ref.planHash === "string") {
          const current = await (await import("./product-v4-verification-service")).getProductV4VerificationReadiness(context.imporBundleId, ref.runId);
          if (current.plan.planHash === ref.planHash) verification = current;
        }
      } catch { verification = null; }
    }
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
  issues.push(...gateResult.issues);

  const uniqueIssues = [
    ...new Map(
      issues.map((item) => [`${item.code}:${item.target.targetType}:${item.target.targetId}:${findingIdentity.get(item) ?? ""}`, item]),
    ).values(),
  ];

  const publicationReady = valid && uniqueIssues.filter((i) => i.severity === "blocking").length === 0;

  const totalWords = article
    ? article.sections && article.sections.length > 0
      ? article.sections.flatMap((s) => s.blocks).reduce((sum, b) => sum + b.contentMarkdown.split(/\s+/).filter(Boolean).length, 0)
      : article.blocks.reduce((sum, b) => sum + b.content.split(/\s+/).filter(Boolean).length, 0)
    : 0;

  const metrics: Record<string, number> = {
    articleCount: products.filter((p) => p.productType === "article").length,
    diktatCount: products.filter((p) => p.productType === "diktat").length,
    totalWordCount: totalWords,
    visualCount: article?.visuals?.length ?? 0,
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

    if (reviewDecision.criteria.length > 0 && /^[a-f0-9]{64}$/i.test(reviewDecision.contentFingerprint)) {
      const rubricResult = validatePedagogicRubricDecision(reviewDecision);
      if (!rubricResult.valid) {
        issues.push(...rubricResult.issues);
      }
    }
  }

  const targetPdfProductId = input.diktatId || input.articleId;
  const list = input.pdfEvidenceRows ?? [];
  const expectedArticleHash = input.articleGenerationHash ?? undefined;
  const expectedDiktatHash = input.diktatGenerationHash ?? undefined;

  const matchesCurrentLineage = (e: PdfArtifactEvidence) => {
    const matchesArticle = expectedArticleHash ? e.articleHash === expectedArticleHash : true;
    const matchesDiktat = expectedDiktatHash ? e.diktatHash === expectedDiktatHash : true;
    return matchesArticle && matchesDiktat;
  };

  // 1. Prefer exact current-lineage row for target product ID
  let evidence: PdfArtifactEvidence | null =
    list.find((e) => e.productId === targetPdfProductId && matchesCurrentLineage(e)) ?? null;

  // 2. If no exact current-lineage row exists, choose deterministic target-product fallback so hash-mismatch diagnostics remain useful
  if (!evidence) {
    const targetRows = list.filter((e) => e.productId === targetPdfProductId);
    if (targetRows.length > 0) {
      evidence =
        (expectedArticleHash ? targetRows.find((e) => e.articleHash === expectedArticleHash) : undefined) ??
        (expectedDiktatHash ? targetRows.find((e) => e.diktatHash === expectedDiktatHash) : undefined) ??
        targetRows[0];
    }
  }

  // 3. Article-ID fallback only for explicit legacy compatibility when no Diktat-owned evidence exists (never outranks Diktat-owned evidence)
  if (!evidence && input.diktatId) {
    const legacyRows = list.filter((e) => e.productId === input.articleId);
    if (legacyRows.length > 0) {
      evidence =
        legacyRows.find((e) => matchesCurrentLineage(e)) ??
        (expectedArticleHash ? legacyRows.find((e) => e.articleHash === expectedArticleHash) : undefined) ??
        (expectedDiktatHash ? legacyRows.find((e) => e.diktatHash === expectedDiktatHash) : undefined) ??
        legacyRows[0];
    }
  }

  if (!evidence && list.length > 0) {
    evidence = list.find((e) => matchesCurrentLineage(e)) ?? list[0];
  }

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

    const pdfResult = validatePdfArtifactEvidence(evidence);
    if (!pdfResult.valid) {
      issues.push(...pdfResult.issues);
    }
  }

  return {
    reviewDecision,
    reviewStatus,
    pdfEvidenceStatus,
    issues,
  };
}
