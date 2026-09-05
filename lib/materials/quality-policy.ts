import { createHash } from "node:crypto";
import { z } from "zod";

export const QUALITY_POLICY_VERSION = "2026.09.1";

export const PEDAGOGIC_CRITERION_IDS = [
  "concept_accuracy",
  "prerequisite_completeness",
  "explanation_sequence",
  "symbol_and_condition_clarity",
  "example_reasoning",
  "representation_or_visual",
  "misconceptions_and_limits",
  "formative_check_and_explanation",
] as const;
export const pedagogicCriterionIdSchema = z.enum(PEDAGOGIC_CRITERION_IDS);
export type PedagogicCriterionId = z.infer<typeof pedagogicCriterionIdSchema>;

export const rubricItemStatusSchema = z.enum(["not_met", "needs_revision", "met"]);
export type RubricItemStatus = z.infer<typeof rubricItemStatusSchema>;

export const rubricContentAnchorSchema = z
  .object({
    targetType: z.enum(["section", "block", "visual", "document"]),
    targetId: z.string().trim().min(1),
  })
  .strict();
export type RubricContentAnchor = z.infer<typeof rubricContentAnchorSchema>;

export const pedagogicRubricItemSchema = z
  .object({
    criterionId: pedagogicCriterionIdSchema,
    status: rubricItemStatusSchema,
    contentAnchors: z.array(rubricContentAnchorSchema).min(1),
    reason: z.string().trim().min(1),
  })
  .strict();
export type PedagogicRubricItem = z.infer<typeof pedagogicRubricItemSchema>;

export const pedagogicExceptionSchema = z
  .object({
    criterionId: pedagogicCriterionIdSchema,
    approved: z.literal(true),
    reason: z.string().trim().min(1),
  })
  .strict();
export type PedagogicException = z.infer<typeof pedagogicExceptionSchema>;

export const diagnosticSeveritySchema = z.enum(["blocking", "warning"]);
export type DiagnosticSeverity = z.infer<typeof diagnosticSeveritySchema>;

export const diagnosticTargetSchema = z
  .object({
    targetType: z.enum([
      "document",
      "section",
      "block",
      "visual",
      "rubric",
      "pdf",
      "dependency",
      "idea",
    ]),
    targetId: z.string().trim().min(1),
  })
  .strict();
export type DiagnosticTarget = z.infer<typeof diagnosticTargetSchema>;

export const diagnosticIssueSchema = z
  .object({
    code: z.string().trim().min(1),
    severity: diagnosticSeveritySchema,
    target: diagnosticTargetSchema,
    reason: z.string().trim().min(1),
    remediation: z.string().trim().min(1),
  })
  .strict();
export type DiagnosticIssue = z.infer<typeof diagnosticIssueSchema>;

export interface QualityEvaluation {
  valid: boolean;
  publicationReady: boolean;
  policyVersion: string;
  contentFingerprint: string;
  issues: readonly DiagnosticIssue[];
  metrics: Record<string, number>;
}

export const pedagogicReviewDecisionSchema = z
  .object({
    imporBundleId: z.string().trim().min(1),
    reviewerId: z.string().trim().min(1),
    policyVersion: z.string().trim().min(1),
    contentFingerprint: z.string().regex(/^[a-f0-9]{64}$/i),
    status: z.enum(["pending", "approved", "rejected", "changes_requested"]),
    criteria: z.array(pedagogicRubricItemSchema),
    exceptions: z.array(pedagogicExceptionSchema).default([]),
    notes: z.string().trim().optional(),
  })
  .strict();
export type PedagogicReviewDecision = z.infer<typeof pedagogicReviewDecisionSchema>;

export function validatePedagogicRubricDecision(
  decision: PedagogicReviewDecision,
): { valid: boolean; issues: DiagnosticIssue[] } {
  const issues: DiagnosticIssue[] = [];

  const seenCriteria = new Set<string>();
  for (const item of decision.criteria) {
    if (seenCriteria.has(item.criterionId)) {
      issues.push({
        code: "RUBRIC_CRITERION_DUPLICATE",
        severity: "blocking",
        target: { targetType: "rubric", targetId: item.criterionId },
        reason: `Criterion ${item.criterionId} is duplicated in review decision`,
        remediation: "Ensure each of the eight pedagogic criteria is assessed exactly once",
      });
    }
    seenCriteria.add(item.criterionId);

    if (item.contentAnchors.length === 0) {
      issues.push({
        code: "RUBRIC_CRITERION_UNANCHORED",
        severity: "blocking",
        target: { targetType: "rubric", targetId: item.criterionId },
        reason: `Criterion ${item.criterionId} has no content anchors`,
        remediation: "Provide at least one content anchor pointing to a valid section or block",
      });
    }

    if (!item.reason.trim()) {
      issues.push({
        code: "RUBRIC_REASON_EMPTY",
        severity: "blocking",
        target: { targetType: "rubric", targetId: item.criterionId },
        reason: `Criterion ${item.criterionId} has an empty reason`,
        remediation: "Provide an explicit justification explaining the assessment",
      });
    }
  }

  for (const requiredId of PEDAGOGIC_CRITERION_IDS) {
    if (!seenCriteria.has(requiredId)) {
      issues.push({
        code: "RUBRIC_CRITERION_MISSING",
        severity: "blocking",
        target: { targetType: "rubric", targetId: requiredId },
        reason: `Required rubric criterion ${requiredId} is missing`,
        remediation: `Assess criterion ${requiredId} as not_met, needs_revision, or met`,
      });
    }
  }

  const exceptionMap = new Map<string, PedagogicException>();
  const criteriaMap = new Map(decision.criteria.map((c) => [c.criterionId, c]));

  for (const exc of decision.exceptions) {
    if (exceptionMap.has(exc.criterionId)) {
      issues.push({
        code: "RUBRIC_EXCEPTION_DUPLICATE",
        severity: "blocking",
        target: { targetType: "rubric", targetId: exc.criterionId },
        reason: `Duplicate exception declared for criterion ${exc.criterionId}`,
        remediation: "Ensure at most one exception is declared per criterion",
      });
    }
    exceptionMap.set(exc.criterionId, exc);

    if (!exc.reason.trim()) {
      issues.push({
        code: "RUBRIC_EXCEPTION_REASON_EMPTY",
        severity: "blocking",
        target: { targetType: "rubric", targetId: exc.criterionId },
        reason: `Exception for ${exc.criterionId} is missing an explicit reason`,
        remediation: "Document why an exception is warranted for this criterion",
      });
    }

    const matchingCriterion = criteriaMap.get(exc.criterionId);
    if (matchingCriterion && matchingCriterion.status === "met") {
      issues.push({
        code: "RUBRIC_EXCEPTION_UNNECESSARY_FOR_MET",
        severity: "blocking",
        target: { targetType: "rubric", targetId: exc.criterionId },
        reason: `Exception declared for criterion ${exc.criterionId} which is already assessed as 'met'`,
        remediation: "Remove exception for criteria that already satisfy the requirement",
      });
    }
  }

  if (decision.status === "approved") {
    for (const item of decision.criteria) {
      if (item.status !== "met") {
        const matchingExc = exceptionMap.get(item.criterionId);
        const hasApprovedException =
          matchingExc !== undefined &&
          matchingExc.approved === true &&
          Boolean(matchingExc.reason.trim());

        if (!hasApprovedException) {
          issues.push({
            code: "RUBRIC_NON_MET_WITHOUT_EXCEPTION",
            severity: "blocking",
            target: { targetType: "rubric", targetId: item.criterionId },
            reason: `Criterion ${item.criterionId} has status '${item.status}' but decision is marked approved without an authorized exception`,
            remediation: "Revise content until criterion is met or document an authorized exception before approval",
          });
        }
      }
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

export function deterministicCanonicalSerialization(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(deterministicCanonicalSerialization).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));

  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${deterministicCanonicalSerialization(v)}`)
    .join(",")}}`;
}

export function extractPedagogyRelevantData(input: {
  article: Record<string, unknown>;
  diktat?: Record<string, unknown>;
}): Record<string, unknown> {
  const { article, diktat } = input;

  const extractBlock = (b: Record<string, unknown>) => ({
    blockType: b.blockType,
    title: b.title ?? null,
    orderIndex: b.orderIndex,
    content: b.contentMarkdown ?? b.content ?? "",
    ideaIds: Array.isArray(b.ideaIds) ? [...b.ideaIds].sort() : [],
    sourceRefs: Array.isArray(b.sourceRefs)
      ? [...b.sourceRefs].sort((left: any, right: any) =>
          String(left.sourceId).localeCompare(String(right.sourceId)),
        )
      : [],
    applicability: b.applicability ?? null,
    workedExamplePayload: b.workedExamplePayload ?? null,
    formativeCheckPayload: b.formativeCheckPayload ?? null,
  });

  const extractSection = (s: Record<string, unknown>) => ({
    kind: s.kind,
    title: s.title,
    slug: s.slug,
    orderIndex: s.orderIndex,
    learningObjective: s.learningObjective,
    ideaIds: Array.isArray(s.ideaIds) ? [...s.ideaIds].sort() : [],
    sourceRefs: Array.isArray(s.sourceRefs)
      ? [...s.sourceRefs].sort((left: any, right: any) =>
          String(left.sourceId).localeCompare(String(right.sourceId)),
        )
      : [],
    blocks: Array.isArray(s.blocks)
      ? [...s.blocks]
          .sort((a: any, b: any) => a.orderIndex - b.orderIndex || String(a.id).localeCompare(String(b.id)))
          .map((b) => extractBlock(b as Record<string, unknown>))
      : [],
    pedagogy: s.pedagogy ?? null,
  });

  const articleRelevant = {
    title: article.title,
    sections: Array.isArray(article.sections)
      ? [...article.sections]
          .sort((a: any, b: any) => a.orderIndex - b.orderIndex || String(a.id).localeCompare(String(b.id)))
          .map((s) => extractSection(s as Record<string, unknown>))
      : [],
    blocks: Array.isArray(article.blocks)
      ? [...article.blocks]
          .sort((a: any, b: any) => a.orderIndex - b.orderIndex || String(a.id).localeCompare(String(b.id)))
          .map((b) => extractBlock(b as Record<string, unknown>))
      : [],
    visuals: Array.isArray(article.visuals)
      ? [...article.visuals].sort((a: any, b: any) => String(a.id).localeCompare(String(b.id)))
      : [],
  };

  const diktatRelevant = diktat
    ? {
        title: diktat.title,
        markdown: diktat.markdown ?? diktat.contentMarkdown ?? "",
        blocks: Array.isArray(diktat.blocks)
          ? [...diktat.blocks]
              .sort((a: any, b: any) =>
                String(a.sourceArticleBlockId).localeCompare(String(b.sourceArticleBlockId)),
              )
              .map((b: any) => ({
                sourceArticleBlockId: b.sourceArticleBlockId,
                content: b.content,
                ideaIds: Array.isArray(b.ideaIds) ? [...b.ideaIds].sort() : [],
                sourceRefs: Array.isArray(b.sourceRefs)
                  ? [...b.sourceRefs].sort((left: any, right: any) =>
                      String(left.sourceId).localeCompare(String(right.sourceId)),
                    )
                  : [],
              }))
          : [],
      }
    : null;

  return {
    article: articleRelevant,
    diktat: diktatRelevant,
  };
}

export function computePedagogyContentFingerprint(input: {
  article: Record<string, unknown>;
  diktat?: Record<string, unknown>;
}): string {
  const data = extractPedagogyRelevantData(input);
  const serialized = deterministicCanonicalSerialization(data);
  return createHash("sha256").update(serialized, "utf8").digest("hex");
}
