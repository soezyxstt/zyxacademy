import { createHash } from "node:crypto";
import { z } from "zod";
import type { ArticleBlock, ArticleDocument, ArticleSourceReference } from "./article-contract";
import { canonicalArticleBlockOrder } from "./article-contract";

export const diktatBlockSchema = z.object({
  id: z.string().min(1),
  sourceArticleBlockId: z.string().min(1),
  content: z.string().trim().min(1),
  ideaIds: z.array(z.string().min(1)),
  sourceRefs: z.array(z.object({
    sourceId: z.string().min(1),
    version: z.number().int().positive(),
    checksum: z.string().regex(/^[a-f0-9]{64}$/i),
    excerptIds: z.array(z.string().min(1)).min(1),
  }).strict()),
  generationHash: z.string().regex(/^[a-f0-9]{64}$/i),
}).strict();
export type DiktatBlock = z.infer<typeof diktatBlockSchema>;

export const diktatDocumentSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1),
  sourceArticleId: z.string().min(1),
  sourceArticleVersion: z.number().int().positive(),
  sourceArticleHash: z.string().regex(/^[a-f0-9]{64}$/i),
  generationHash: z.string().regex(/^[a-f0-9]{64}$/i),
  blocks: z.array(diktatBlockSchema),
  markdown: z.string().trim().min(1),
}).strict();
export type DiktatDocument = z.infer<typeof diktatDocumentSchema>;

export interface DiktatCompressionReport {
  removedBlockIds: string[];
  preservedBlockIds: string[];
  preservedIdeaIds: string[];
  preservedFormulaBlockIds: string[];
  sourceArticleId: string;
  sourceArticleVersion: number;
  sourceArticleHash: string;
  lossFree: boolean;
  reasonCodes: string[];
}

const removableArticleBlocks = new Set<ArticleBlock["blockType"]>([
  "prior_knowledge_activation",
  "problem_introduction",
  "analogy",
  "worked_example",
  "retrieval_prompt",
  "retrieval_close",
]);

function deterministicHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function serializeDiktatBlocks(blocks: readonly DiktatBlock[]): string {
  return blocks.map((block) => block.content.trim()).join("\n\n");
}

export function compileDiktatFromArticle(article: ArticleDocument, id = `${article.id}:diktat`): {
  document: DiktatDocument;
  report: DiktatCompressionReport;
} {
  if (article.reviewerState !== "approved") throw new Error("DIKTAT_ARTICLE_NOT_APPROVED");
  const ordered = canonicalArticleBlockOrder(article.blocks);
  const selected = ordered.filter((block) => !removableArticleBlocks.has(block.blockType) && block.applicability.status === "applicable");
  const blocks: DiktatBlock[] = selected.map((block) => ({
    id: `${id}:block:${block.id}`,
    sourceArticleBlockId: block.id,
    content: block.content,
    ideaIds: [...block.ideaIds].sort(),
    sourceRefs: [...block.sourceRefs].sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    generationHash: block.generationHash,
  }));
  const markdown = serializeDiktatBlocks(blocks);
  const generationHash = deterministicHash({
    sourceArticleHash: article.generationHash,
    blocks,
    markdown,
  });
  const document: DiktatDocument = {
    id,
    title: `${article.title} Diktat`,
    sourceArticleId: article.id,
    sourceArticleVersion: article.version,
    sourceArticleHash: article.generationHash,
    generationHash,
    blocks,
    markdown,
  };
  const preservedIdeaIds = [...new Set(blocks.flatMap((block) => block.ideaIds))].sort();
  const report: DiktatCompressionReport = {
    removedBlockIds: ordered.filter((block) => !blocks.some((candidate) => candidate.sourceArticleBlockId === block.id)).map((block) => block.id),
    preservedBlockIds: blocks.map((block) => block.sourceArticleBlockId),
    preservedIdeaIds,
    preservedFormulaBlockIds: selected.filter((block) => block.blockType === "mathematical_representation").map((block) => block.id),
    sourceArticleId: article.id,
    sourceArticleVersion: article.version,
    sourceArticleHash: article.generationHash,
    lossFree: true,
    reasonCodes: [],
  };
  return { document, report };
}

export function verifyDiktatCompression(article: ArticleDocument, diktat: DiktatDocument): DiktatCompressionReport {
  const expected = compileDiktatFromArticle(article, diktat.id);
  const reasonCodes: string[] = [];
  if (diktat.sourceArticleId !== article.id || diktat.sourceArticleVersion !== article.version || diktat.sourceArticleHash !== article.generationHash) {
    reasonCodes.push("DIKTAT_STALE_ARTICLE");
  }
  const expectedBySource = new Map(expected.document.blocks.map((block) => [block.sourceArticleBlockId, block]));
  for (const block of expected.document.blocks) {
    const actual = diktat.blocks.find((candidate) => candidate.sourceArticleBlockId === block.sourceArticleBlockId);
    if (!actual || actual.content !== block.content) reasonCodes.push("DIKTAT_CORE_STATEMENT_LOST");
    if (!actual || JSON.stringify(actual.sourceRefs) !== JSON.stringify(block.sourceRefs)) reasonCodes.push("DIKTAT_SOURCE_TRACE_LOST");
  }
  for (const block of diktat.blocks) {
    if (!expectedBySource.has(block.sourceArticleBlockId)) reasonCodes.push("DIKTAT_UNAPPROVED_CLAIM");
  }
  const expectedFormulaIds = new Set(expected.report.preservedFormulaBlockIds);
  const actualFormulaIds = new Set(
    diktat.blocks
      .filter((block) => expectedFormulaIds.has(block.sourceArticleBlockId))
      .map((block) => block.sourceArticleBlockId),
  );
  if (actualFormulaIds.size !== expectedFormulaIds.size) reasonCodes.push("DIKTAT_FORMULA_LOST");
  return {
    ...expected.report,
    removedBlockIds: article.blocks.filter((block) => !diktat.blocks.some((candidate) => candidate.sourceArticleBlockId === block.id)).map((block) => block.id),
    preservedBlockIds: diktat.blocks.map((block) => block.sourceArticleBlockId),
    preservedIdeaIds: [...new Set(diktat.blocks.flatMap((block) => block.ideaIds))].sort(),
    lossFree: reasonCodes.length === 0,
    reasonCodes: [...new Set(reasonCodes)].sort(),
  };
}

export function serializeDiktat(document: DiktatDocument): string {
  return serializeDiktatBlocks(document.blocks);
}

export type { ArticleSourceReference };
