import { createHash } from "node:crypto";
import type { ArticleBlockType, ArticleDocument } from "./article-contract";
import {
  articleBlockSchema,
  canonicalArticleBlockOrder,
  canonicalArticleSectionOrder,
  optionalPerIdeaBlockTypes,
  requiredDocumentBlockTypes,
  requiredPerIdeaBlockTypes,
} from "./article-contract";
import type { DiktatDocument } from "./diktat-contract";
import { verifyDiktatCompression } from "./diktat-contract";

export type QualityGateIssue = {
  code: string;
  message: string;
  severity?: "warning" | "blocking";
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

function addFormativeCheckQualityIssue(issues: QualityGateIssue[], block: { id: string; formativeCheckPayload?: { checkKind: string; evaluation?: unknown } }): void {
  const payload = block.formativeCheckPayload;
  if (
    payload
    && ["short_answer", "conceptual_explanation", "numeric_answer"].includes(payload.checkKind)
    && !payload.evaluation
  ) {
    issues.push(issue(
      "ARTICLE_FORMATIVE_CHECK_REVEAL_ONLY",
      "Free-response formative checks without evaluation are reveal-only and cannot provide response feedback.",
      { blockId: block.id, severity: "warning" },
    ));
  }
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

function evaluateArticleQualityV2(article: ArticleDocument, context: ArticleQualityContext): QualityGateResult {
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
    addFormativeCheckQualityIssue(issues, block);
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
  const uniqueIssues = [...new Map(issues.map((value) => [`${value.code}:${value.blockId ?? ""}:${value.ideaId ?? ""}`, value])).values()];
  const blockingIssues = uniqueIssues.filter((value) => value.severity !== "warning");
  const passed = blockingIssues.length === 0 && counts.satisfied === counts.total;
  return {
    passed,
    score: counts.total === 0 ? 0 : Math.round((counts.satisfied / counts.total) * 100),
    issues: uniqueIssues,
    metrics: {
      requiredCoveragePercent: counts.total === 0 ? 0 : (counts.satisfied / counts.total) * 100,
      traceableBlockPercent: blocks.length === 0 ? 0 : (blocks.filter((block) => block.ideaIds.length > 0 && block.sourceRefs.length > 0).length / blocks.length) * 100,
    },
  };
}

function evaluateArticleQualityV3(article: ArticleDocument, context: ArticleQualityContext): QualityGateResult {
  const issues: QualityGateIssue[] = [];
  const sections = canonicalArticleSectionOrder(article.sections);
  const allBlocks = sections.flatMap((section) => section.blocks);

  for (const block of allBlocks) {
    const parsed = articleBlockSchema.safeParse(block);
    if (!parsed.success) {
      issues.push(issue("ARTICLE_BLOCK_INVALID", parsed.error.issues[0]?.message ?? "article block is invalid", { blockId: block.id }));
    }
  }

  const hasOverview = sections.some((s) => s.kind === "overview");
  if (!hasOverview) {
    issues.push(issue("ARTICLE_MISSING_OVERVIEW", "article requires an overview section"));
  }

  const hasSummary = sections.some((s) => s.kind === "summary");
  if (!hasSummary) {
    issues.push(issue("ARTICLE_MISSING_SUMMARY", "article requires a summary section"));
  }

  const hasChapterFinalCheck = allBlocks.some((b) => b.blockType === "retrieval_close");
  if (!hasChapterFinalCheck) {
    issues.push(issue("ARTICLE_MISSING_CHAPTER_FINAL_CHECK", "article requires a chapter final check"));
  }

  const topicSections = sections.filter((s) => s.kind === "topic");
  for (const topic of topicSections) {
    const applicableBlocks = topic.blocks.filter((b) => b.applicability.status === "applicable");
    const hasExplanation = applicableBlocks.some((b) => b.blockType === "explanation");
    if (!hasExplanation) {
      issues.push(issue("ARTICLE_TOPIC_MISSING_EXPLANATION", `topic section ${topic.id} requires an explanation block`, { blockId: topic.id, ideaId: topic.ideaIds[0] }));
    }
    const hasRetrieval = applicableBlocks.some((b) => b.blockType === "retrieval_prompt" || b.blockType === "retrieval_close");
    if (!hasRetrieval) {
      issues.push(issue("ARTICLE_TOPIC_MISSING_RETRIEVAL", `topic section ${topic.id} requires a retrieval prompt or retrieval close block`, { blockId: topic.id, ideaId: topic.ideaIds[0] }));
    }

    const topicWords = topic.blocks.reduce((sum, b) => sum + b.content.trim().split(/\s+/).filter(Boolean).length, 0);
    if (topicWords > 1500) {
      issues.push(issue("ARTICLE_TOPIC_WORD_COUNT_EXCEEDED", `topic section ${topic.id} exceeds maximum 1500 words (${topicWords} words)`, { blockId: topic.id, ideaId: topic.ideaIds[0] }));
    }
  }

  const coveredIdeaIds = new Set(topicSections.flatMap((s) => s.ideaIds));
  for (const ideaId of article.ideaIds) {
    if (!coveredIdeaIds.has(ideaId)) {
      issues.push(issue("ARTICLE_MISSING_IDEA_COVERAGE", `Idea ${ideaId} is not covered in any topic section`, { ideaId }));
    }
  }

  for (const block of allBlocks) {
    addFormativeCheckQualityIssue(issues, block);
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

  const shortTopicCount = topicSections.filter((t) => {
    const words = t.blocks.reduce((sum, b) => sum + b.content.trim().split(/\s+/).filter(Boolean).length, 0);
    return words < 150;
  }).length;

  const totalWords = allBlocks.reduce((sum, b) => sum + b.content.trim().split(/\s+/).filter(Boolean).length, 0);
  const estimatedReadingTimeMin = Math.max(1, Math.round(totalWords / 200));

  const uniqueIssues = [...new Map(issues.map((value) => [`${value.code}:${value.blockId ?? ""}:${value.ideaId ?? ""}`, value])).values()];
  const blockingIssues = uniqueIssues.filter((value) => value.severity !== "warning");
  const passed = blockingIssues.length === 0;
  const traceableBlockCount = allBlocks.filter((b) => b.ideaIds.length > 0 && b.sourceRefs.length > 0).length;
  const traceableBlockPercent = allBlocks.length === 0 ? 0 : (traceableBlockCount / allBlocks.length) * 100;
  const requiredCoveragePercent = passed ? 100 : Math.max(0, Math.round(100 - blockingIssues.length * 20));

  return {
    passed,
    score: passed ? 100 : Math.max(0, Math.round(100 - blockingIssues.length * 20)),
    issues: uniqueIssues,
    metrics: {
      requiredCoveragePercent,
      traceableBlockPercent,
      totalWordCount: totalWords,
      estimatedReadingTimeMin,
      topicCount: topicSections.length,
      shortTopicCount,
      shortTopicWarning: shortTopicCount > 0 ? 1 : 0,
    },
  };
}

export function evaluateArticleQuality(article: ArticleDocument, context: ArticleQualityContext = {}): QualityGateResult {
  if (article.sections && article.sections.length > 0) {
    return evaluateArticleQualityV3(article, context);
  }
  return evaluateArticleQualityV2(article, context);
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
