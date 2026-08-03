import { createHash } from "node:crypto";
import type { ArticleBlockType, ArticleDocument } from "./article-contract";
import {
  articleBlockSchema,
  canonicalArticleBlockOrder,
  optionalPerIdeaBlockTypes,
  requiredDocumentBlockTypes,
  requiredPerIdeaBlockTypes,
} from "./article-contract";
import type { DiktatDocument } from "./diktat-contract";
import { verifyDiktatCompression } from "./diktat-contract";

export type QualityGateIssue = {
  code: string;
  message: string;
  blockId?: string;
  ideaId?: string;
};

export type QualityGateResult = {
  passed: boolean;
  score: number;
  issues: QualityGateIssue[];
  metrics: Record<string, number>;
};

function issue(code: string, message: string, extra: Partial<QualityGateIssue> = {}): QualityGateIssue {
  return { code, message, ...extra };
}

function hasBalancedMath(value: string): boolean {
  const display = value.match(/\$\$/g)?.length ?? 0;
  const inline = value.replace(/\$\$/g, "").match(/(?<!\\)\$/g)?.length ?? 0;
  if (display % 2 !== 0 || inline % 2 !== 0) return false;
  return !value.includes("$$ $$");
}

function isFormulaBearing(block: { blockType: ArticleBlockType; content: string }): boolean {
  return block.blockType === "mathematical_representation" || /\$\$|(?<!\\)\$[^$]+\$/u.test(block.content);
}

function countSatisfiedRequirements(article: ArticleDocument): { satisfied: number; total: number } {
  const applicableBlocks = article.blocks.filter((block) => block.applicability.status === "applicable");
  const documentTotal = requiredDocumentBlockTypes.length;
  const documentSatisfied = requiredDocumentBlockTypes.filter((type) => applicableBlocks.some((block) => block.blockType === type)).length;
  const perIdeaTotal = article.ideaIds.length * requiredPerIdeaBlockTypes.length;
  const perIdeaSatisfied = article.ideaIds.reduce((count, ideaId) => count + requiredPerIdeaBlockTypes.filter((type) => {
    const matching = article.blocks.filter((block) => block.blockType === type && block.ideaIds.includes(ideaId));
    return matching.some((block) => block.applicability.status === "applicable") || (optionalPerIdeaBlockTypes.has(type) && matching.some((block) => block.applicability.status === "inapplicable"));
  }).length, 0);
  const synthesisTotal = article.ideaIds.length > 1 ? 1 : 0;
  const synthesisSatisfied = synthesisTotal === 1 && applicableBlocks.some((block) => block.blockType === "cross_idea_synthesis") ? 1 : 0;
  return { satisfied: documentSatisfied + perIdeaSatisfied + synthesisSatisfied, total: documentTotal + perIdeaTotal + synthesisTotal };
}

export interface ArticleQualityContext {
  currentIdeaVersions?: Readonly<Record<string, number>>;
  approvedClaimIds?: ReadonlySet<string>;
  dependencies?: readonly { id: string; freshness: "UP_TO_DATE" | "NEEDS_REVIEW" | "STALE" }[];
}

export function evaluateArticleQuality(article: ArticleDocument, context: ArticleQualityContext = {}): QualityGateResult {
  const issues: QualityGateIssue[] = [];
  const parsed = article.blocks.map((block) => articleBlockSchema.safeParse(block));
  parsed.forEach((result, index) => {
    if (!result.success) issues.push(issue("ARTICLE_BLOCK_INVALID", result.error.issues[0]?.message ?? "article block is invalid", { blockId: article.blocks[index]?.id }));
  });
  const blocks = canonicalArticleBlockOrder(article.blocks);
  const applicable = blocks.filter((block) => block.applicability.status === "applicable");
  for (const type of requiredDocumentBlockTypes) {
    if (!applicable.some((block) => block.blockType === type)) issues.push(issue("ARTICLE_MISSING_DOCUMENT_BLOCK", `missing required document block ${type}`));
  }
  for (const ideaId of article.ideaIds) {
    for (const type of requiredPerIdeaBlockTypes) {
      const matching = blocks.filter((block) => block.blockType === type && block.ideaIds.includes(ideaId));
      const justified = matching.some((block) => block.applicability.status === "inapplicable");
      if (matching.length === 0 && !(optionalPerIdeaBlockTypes.has(type) && justified)) {
        issues.push(issue("ARTICLE_MISSING_IDEA_BLOCK", `Idea ${ideaId} is missing ${type}`, { ideaId }));
      }
    }
  }
  if (article.ideaIds.length > 1 && !applicable.some((block) => block.blockType === "cross_idea_synthesis")) {
    issues.push(issue("ARTICLE_MISSING_CROSS_IDEA_SYNTHESIS", "multi-Idea articles require a cross-Idea synthesis block"));
  }
  for (const block of blocks) {
    if (!block.content.trim()) issues.push(issue("ARTICLE_EMPTY_BLOCK", "empty article blocks do not satisfy the contract", { blockId: block.id }));
    if (block.applicability.status === "inapplicable" && !block.applicability.reason) issues.push(issue("ARTICLE_INAPPLICABLE_REASON_MISSING", "inapplicable blocks require a typed reason", { blockId: block.id }));
    const factual = ["explanation", "verbal_representation", "mathematical_representation", "worked_example", "misconception", "application", "cross_idea_synthesis", "summary"].includes(block.blockType);
    if (factual && (!block.ideaIds.length || !block.sourceRefs.length)) issues.push(issue("ARTICLE_SOURCE_TRACE_MISSING", "factual blocks require Idea and source references", { blockId: block.id }));
    if (isFormulaBearing(block) && (!block.ideaIds.length || !block.sourceRefs.length)) issues.push(issue("ARTICLE_FORMULA_TRACE_MISSING", "formula-bearing blocks require Idea and source references", { blockId: block.id }));
    if (!hasBalancedMath(block.content)) issues.push(issue("ARTICLE_INVALID_MATH", "math delimiters are not balanced", { blockId: block.id }));
    if (block.reviewerState === "rejected") issues.push(issue("ARTICLE_REVIEW_REJECTED", "rejected blocks cannot be published", { blockId: block.id }));
    if (block.claimRefs?.some((claimId) => !context.approvedClaimIds?.has(claimId))) issues.push(issue("ARTICLE_UNSUPPORTED_CLAIM", "block contains a claim without an approved claim reference", { blockId: block.id }));
    if (block.internalLinks?.some((link) => !link.targetExists)) issues.push(issue("ARTICLE_BROKEN_INTERNAL_LINK", "block contains a broken internal link", { blockId: block.id }));
    if (block.assets?.some((asset) => !asset.available)) issues.push(issue("ARTICLE_MISSING_ASSET", "block references an unavailable asset", { blockId: block.id }));
  }
  for (const [ideaId, currentVersion] of Object.entries(context.currentIdeaVersions ?? {})) {
    const articleVersion = article.ideaVersions?.[ideaId];
    if (article.ideaIds.includes(ideaId) && (!articleVersion || articleVersion !== currentVersion)) issues.push(issue("ARTICLE_STALE_IDEA", `Idea ${ideaId} is stale`, { ideaId }));
  }
  for (const dependency of context.dependencies ?? []) {
    if (dependency.freshness !== "UP_TO_DATE") issues.push(issue("ARTICLE_STALE_DEPENDENCY", `dependency ${dependency.id} is ${dependency.freshness}`));
  }
  const counts = countSatisfiedRequirements(article);
  const passed = issues.length === 0 && counts.satisfied === counts.total;
  return {
    passed,
    score: counts.total === 0 ? 0 : Math.round((counts.satisfied / counts.total) * 100),
    issues: [...new Map(issues.map((value) => [`${value.code}:${value.blockId ?? ""}:${value.ideaId ?? ""}`, value])).values()],
    metrics: {
      requiredCoveragePercent: counts.total === 0 ? 0 : (counts.satisfied / counts.total) * 100,
      traceableBlockPercent: blocks.length === 0 ? 0 : (blocks.filter((block) => block.ideaIds.length > 0 && block.sourceRefs.length > 0).length / blocks.length) * 100,
    },
  };
}

export function evaluateDiktatQuality(article: ArticleDocument, diktat: DiktatDocument): QualityGateResult {
  const report = verifyDiktatCompression(article, diktat);
  const issues = report.reasonCodes.map((code) => issue(code, `diktat compression failed quality gate ${code}`));
  const articleIdeaIds = new Set(article.ideaIds);
  const diktatIdeaIds = new Set(report.preservedIdeaIds);
  for (const ideaId of articleIdeaIds) if (!diktatIdeaIds.has(ideaId)) issues.push(issue("DIKTAT_IDEA_COVERAGE_MISMATCH", `diktat does not cover Idea ${ideaId}`, { ideaId }));
  const passed = issues.length === 0 && articleIdeaIds.size === diktatIdeaIds.size;
  return {
    passed,
    score: passed ? 100 : 0,
    issues: [...new Map(issues.map((value) => [`${value.code}:${value.ideaId ?? ""}`, value])).values()],
    metrics: {
      ideaCoveragePercent: articleIdeaIds.size === 0 ? 0 : (diktatIdeaIds.size / articleIdeaIds.size) * 100,
      compressionLossFreePercent: report.lossFree ? 100 : 0,
    },
  };
}

export function deterministicGenerationHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function assertQualityGate(result: QualityGateResult, prefix: string): void {
  if (!result.passed) throw new Error(`${prefix}: ${result.issues.map((entry) => `${entry.code}${entry.blockId ? `:${entry.blockId}` : ""}`).join(", ")}`);
}
