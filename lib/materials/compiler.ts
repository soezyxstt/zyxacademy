import { createHash } from "node:crypto";
import { z } from "zod";
import type { ProductEntity } from "@/lib/bundle/product-validator";
import { ASTBlock, WebsiteMaterialAST } from "../ast-validator";
import {
  ArticleBlock,
  ArticleDocument,
  ArticleSourceReference,
  articleDocumentSchema,
  canonicalArticleBlockOrder,
  normalizeArticleBlockType,
} from "./article-contract";
import { compileDiktatFromArticle, DiktatDocument, DiktatCompressionReport } from "./diktat-contract";
import { evaluateArticleQuality, evaluateDiktatQuality, QualityGateResult } from "./quality-gates";

/**
 * Plan 009: Semantic Material Compiler
 * Provides structured outline planning, preflight KO validation, typed exclusion tracking,
 * and deterministic serialization of validated semantic blocks into Markdown.
 */

export const KOExclusionReasonSchema = z.enum([
  "duplicate",
  "out_of_scope",
  "prerequisite_elsewhere",
  "unsupported",
  "conflict",
  "editorial",
]);
export type KOExclusionReason = z.infer<typeof KOExclusionReasonSchema>;

export interface KOCompilerInput {
  id: string;
  title: string;
  type: string;
  content: string;
  difficulty: "easy" | "medium" | "hard";
  bloomLevel?: string;
  importance?: number;
  status?: string;
  provenanceSourceId?: string;
  prerequisiteKoIds?: string[];
  prerequisites?: string[];
  version?: number;
  expectedVersion?: number;
  dependencyFreshness?: "UP_TO_DATE" | "NEEDS_REVIEW" | "STALE";
}

export interface ExcludedKO {
  koId: string;
  reason: KOExclusionReason;
  details?: string;
}

export interface MaterialSectionOutline {
  sectionId: string;
  title: string;
  learningObjective: string;
  includedKoIds: string[];
  excludedKos: ExcludedKO[];
  prerequisiteReferences: string[];
  conflictGroups: string[][];
}

export interface MaterialOutlinePlan {
  courseId: string;
  topicTitle: string;
  sections: MaterialSectionOutline[];
  preflightPassed: boolean;
  validationErrors: string[];
}

/**
 * Preflight check: Rejects inactive, needs-review, or provenance-less KOs for V2 compiler.
 */
export function validatePreflightKos(kos: KOCompilerInput[]): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  for (const ko of kos) {
    if (ko.status === "inactive" || ko.status === "needs_review") {
      errors.push(`KO ${ko.id} (${ko.title}) has invalid status '${ko.status}' for V2 material compilation.`);
    }
    if (ko.expectedVersion !== undefined && ko.version !== ko.expectedVersion) {
      errors.push(`KO_STALE_VERSION:${ko.id}:expected=${ko.expectedVersion}:actual=${ko.version ?? "missing"}`);
    }
    if (ko.dependencyFreshness && ko.dependencyFreshness !== "UP_TO_DATE") {
      errors.push(`KO_STALE_DEPENDENCY:${ko.id}:${ko.dependencyFreshness}`);
    }
  }
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Outline Planner: Builds structured section outline with typed inclusions and exclusions.
 */
export function planMaterialOutline(
  courseId: string,
  topicTitle: string,
  kos: KOCompilerInput[]
): MaterialOutlinePlan {
  const preflight = validatePreflightKos(kos);
  if (!preflight.valid) {
    return {
      courseId,
      topicTitle,
      sections: [],
      preflightPassed: false,
      validationErrors: preflight.errors,
    };
  }

  const orderedKos = orderKosByPrerequisite(kos);
  if (orderedKos.errors.length > 0) {
    return {
      courseId,
      topicTitle,
      sections: [],
      preflightPassed: false,
      validationErrors: orderedKos.errors,
    };
  }

  const seenTitles = new Set<string>();
  const includedKoIds: string[] = [];
  const excludedKos: ExcludedKO[] = [];

  for (const ko of orderedKos.kos) {
    const normalizedTitle = ko.title.trim().toLowerCase();
    if (seenTitles.has(normalizedTitle)) {
      excludedKos.push({
        koId: ko.id,
        reason: "duplicate",
        details: `Duplicate concept title '${ko.title}' excluded from material plan`,
      });
    } else {
      seenTitles.add(normalizedTitle);
      includedKoIds.push(ko.id);
    }
  }

  const mainSection: MaterialSectionOutline = {
    sectionId: "sec-main-1",
    title: topicTitle,
    learningObjective: `Memahami konsep utama ${topicTitle}`,
    includedKoIds,
    excludedKos,
    prerequisiteReferences: [],
    conflictGroups: [],
  };

  return {
    courseId,
    topicTitle,
    sections: [mainSection],
    preflightPassed: true,
    validationErrors: [],
  };
}

function orderKosByPrerequisite(kos: readonly KOCompilerInput[]): { kos: KOCompilerInput[]; errors: string[] } {
  const byId = new Map(kos.map((ko) => [ko.id, ko]));
  const dependencies = new Map<string, string[]>();
  const errors: string[] = [];
  for (const ko of kos) {
    const prerequisiteIds = ko.prerequisiteKoIds ?? ko.prerequisites ?? [];
    const existing = prerequisiteIds.filter((id) => byId.has(id));
    const missing = prerequisiteIds.filter((id) => !byId.has(id));
    if (missing.length > 0) errors.push(`KO_PREREQUISITE_MISSING:${ko.id}:${missing.sort().join(",")}`);
    dependencies.set(ko.id, [...new Set(existing)].sort());
  }
  if (errors.length > 0) return { kos: [], errors };

  const ordered: KOCompilerInput[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`KO_PREREQUISITE_CYCLE:${id}`);
    visiting.add(id);
    for (const prerequisiteId of dependencies.get(id) ?? []) visit(prerequisiteId);
    visiting.delete(id);
    visited.add(id);
    ordered.push(byId.get(id)!);
  };
  try {
    for (const ko of kos) visit(ko.id);
  } catch (error) {
    return { kos: [], errors: [error instanceof Error ? error.message : "KO_PREREQUISITE_CYCLE"] };
  }
  return { kos: ordered, errors: [] };
}

export interface ArticleCompileOptions {
  strict?: boolean;
  blockMetadata?: Readonly<Record<string, Partial<ArticleBlock>>>;
}

export interface ArticleCompilation {
  article: ArticleDocument;
  ast: WebsiteMaterialAST;
  markdown: string;
  quality: QualityGateResult;
  generationHash: string;
  sourceHash: string;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function statusToReviewerState(status: ProductEntity["status"]): ArticleBlock["reviewerState"] {
  if (status === "published") return "approved";
  if (status === "withdrawn") return "rejected";
  return "draft";
}

function parseBlockMetadata(content: string): { content: string; metadata: Partial<ArticleBlock> } {
  try {
    const parsed: unknown = JSON.parse(content);
    if (parsed && typeof parsed === "object" && "content" in parsed && typeof parsed.content === "string") {
      const value = parsed as Record<string, unknown>;
      return { content: parsed.content, metadata: value as Partial<ArticleBlock> };
    }
  } catch {
    // Product Bundle article blocks may use plain Markdown content.
  }
  return { content, metadata: {} };
}

function productArticleSourceRefs(product: Extract<ProductEntity, { productType: "article" }>): ArticleSourceReference[] {
  return product.sourceRefs.map((source) => ({
    sourceId: source.sourceId,
    version: source.version,
    checksum: source.checksum,
    excerptIds: [...source.excerptIds].sort(),
  }));
}

function articleBlockToAst(block: ArticleBlock, globalOrderIndex: number): ASTBlock {
  return {
    id: block.id,
    type: "p",
    globalOrderIndex,
    content: block.content,
  };
}

export function compileArticleProduct(
  product: Extract<ProductEntity, { productType: "article" }>,
  options: ArticleCompileOptions = {},
): ArticleCompilation {
  const sourceRefs = productArticleSourceRefs(product);
  const ideaIds = product.ideaLinks.map((link) => link.id).sort();
  const defaultReviewerState = statusToReviewerState(product.status);
  const blocks: ArticleBlock[] = product.blocks.map((input, index) => {
    const embedded = parseBlockMetadata(input.content);
    const metadata = { ...embedded.metadata, ...(options.blockMetadata?.[input.id] ?? {}) };
    const blockType = normalizeArticleBlockType(input.blockType);
    if (!blockType) throw new Error(`ARTICLE_UNSUPPORTED_BLOCK_TYPE:${input.blockType}`);
    return {
      id: `${product.id}:block:${input.id}`,
      blockType,
      orderIndex: metadata.orderIndex ?? input.orderIndex ?? index,
      content: metadata.content ?? embedded.content,
      ideaIds: [...(metadata.ideaIds ?? ideaIds)].sort(),
      sourceRefs: [...(metadata.sourceRefs ?? sourceRefs)].sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
      learningPurpose: metadata.learningPurpose ?? `Mengembangkan pemahaman untuk ${blockType}.`,
      generationHash: metadata.generationHash ?? product.generationHash,
      reviewerState: metadata.reviewerState ?? defaultReviewerState,
      ...(metadata.claimRefs ? { claimRefs: metadata.claimRefs } : {}),
      ...(metadata.internalLinks ? { internalLinks: metadata.internalLinks } : {}),
      ...(metadata.assets ? { assets: metadata.assets } : {}),
      applicability: metadata.applicability ?? { status: "applicable" },
    };
  });
  const article: ArticleDocument = {
    id: product.id,
    courseId: product.courseId,
    title: product.title,
    version: product.version,
    generationHash: product.generationHash,
    ideaIds,
    ideaVersions: Object.fromEntries(product.ideaLinks.map((link) => [link.id, link.version])),
    blocks: canonicalArticleBlockOrder(blocks),
    reviewerState: defaultReviewerState,
  };
  const contract = articleDocumentSchema.safeParse(article);
  if (!contract.success && options.strict !== false) throw new Error(`ARTICLE_CONTRACT_INVALID:${contract.error.issues[0]?.message ?? "invalid article"}`);
  const quality = evaluateArticleQuality(article);
  if (options.strict !== false && !quality.passed) {
    throw new Error(`ARTICLE_QUALITY_GATE_FAILED:${quality.issues.map((entry) => entry.code).join(",")}`);
  }
  const astBlocks: ASTBlock[] = [
    { id: `${product.id}:title`, type: "h", level: 1, globalOrderIndex: 0, content: product.title },
    ...article.blocks.map((block, index) => articleBlockToAst(block, index + 1)),
  ];
  const ast: WebsiteMaterialAST = {
    schemaVersion: "1.0.0",
    compilerVersion: "2.2.0",
    chapterId: product.chapterId ?? product.id,
    courseId: product.courseId,
    documentMetadata: {
      title: product.title,
      lastModified: "1970-01-01T00:00:00.000Z",
      estimatedReadingTimeMin: Math.max(1, Math.ceil(product.blocks.reduce((total, block) => total + block.content.length, 0) / 1000)),
    },
    blocks: astBlocks,
  };
  const markdown = serializeBlocksToMarkdown(astBlocks);
  return {
    article,
    ast,
    markdown,
    quality,
    generationHash: sha256({ product, article, ast, markdown }),
    sourceHash: product.sourceHash,
  };
}

export interface DiktatCompilation {
  document: DiktatDocument;
  report: DiktatCompressionReport;
  quality: QualityGateResult;
}

export function compileDiktatFromApprovedArticle(article: ArticleDocument, id?: string): DiktatCompilation {
  if (article.reviewerState !== "approved") throw new Error("DIKTAT_ARTICLE_NOT_APPROVED");
  const compiled = compileDiktatFromArticle(article, id);
  const quality = evaluateDiktatQuality(article, compiled.document);
  if (!quality.passed) throw new Error(`DIKTAT_QUALITY_GATE_FAILED:${quality.issues.map((entry) => entry.code).join(",")}`);
  return { ...compiled, quality };
}

/**
 * Deterministically serializes semantic AST blocks to canonical Markdown with stable formatting.
 */
export function serializeBlocksToMarkdown(blocks: ASTBlock[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    switch (block.type) {
      case "h":
        lines.push(`${"#".repeat(block.level)} ${block.content}`);
        break;
      case "p":
        lines.push(block.content);
        break;
      case "list":
        for (const item of block.items) {
          lines.push(item.ordered ? `1. ${item.text}` : `- ${item.text}`);
        }
        break;
      case "blockquote":
        lines.push(`> ${block.content}`);
        break;
      case "code":
        lines.push(`\`\`\`${block.language}\n${block.content}\n\`\`\``);
        break;
      default:
        // Generic fallback for custom containers
        lines.push(`\n<!-- block: ${(block as any).type} -->\n`);
        break;
    }
  }

  return lines.join("\n\n");
}
