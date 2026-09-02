import { createHash } from "node:crypto";
import {
  createVersionedVectorId,
} from "@/lib/vectorize/contracts";
import {
  ADMIN_DOCUMENT_ENTITY_TYPE,
  ADMIN_KNOWLEDGE_BOUNDS,
  type AdminKnowledgeChunk,
  type AdminKnowledgeManifest,
} from "./admin-knowledge-contracts";
import type { CuratedSourceContent } from "./admin-knowledge-sources";

/**
 * Deterministic Semantic Block Chunker for Admin Ops Knowledge.
 *
 * Preserves heading hierarchies, non-destructive block boundaries (code,
 * math, tables, paragraphs), start and end character offsets, content hashes,
 * and stable chunk/vector identifiers.
 */

export interface SemanticBlock {
  readonly startOffset: number;
  readonly endOffset: number;
  readonly text: string;
  readonly type: "heading" | "code" | "math" | "table" | "paragraph";
  readonly headingLevel?: number;
  readonly headingText?: string;
}

export interface ChunkerOptions {
  readonly maxChunkSize?: number;
  readonly version?: number;
}

/**
 * Parses markdown text into non-overlapping semantic blocks preserving exact character offsets.
 */
export function parseSemanticBlocks(content: string): SemanticBlock[] {
  const blocks: SemanticBlock[] = [];
  const lines = content.split("\n");

  let currentOffset = 0;
  let inCodeBlock = false;
  let codeBlockStart = 0;
  let codeBlockLines: string[] = [];

  let inMathBlock = false;
  let mathBlockStart = 0;
  let mathBlockLines: string[] = [];

  let inTable = false;
  let tableStart = 0;
  let tableLines: string[] = [];

  let paragraphStart = -1;
  let paragraphLines: string[] = [];

  const flushParagraph = (endOffset: number) => {
    if (paragraphLines.length > 0 && paragraphStart >= 0) {
      const text = paragraphLines.join("\n");
      blocks.push({
        startOffset: paragraphStart,
        endOffset,
        text,
        type: "paragraph",
      });
      paragraphLines = [];
      paragraphStart = -1;
    }
  };

  const flushTable = (endOffset: number) => {
    if (tableLines.length > 0 && tableStart >= 0) {
      const text = tableLines.join("\n");
      blocks.push({
        startOffset: tableStart,
        endOffset,
        text,
        type: "table",
      });
      tableLines = [];
      tableStart = -1;
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineStart = currentOffset;
    const lineEnd = currentOffset + line.length;
    const lineWithNLOffset = lineEnd + (i < lines.length - 1 ? 1 : 0);
    const trimmed = line.trim();

    // 1. Code block handling
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      if (inCodeBlock) {
        codeBlockLines.push(line);
        const text = codeBlockLines.join("\n");
        blocks.push({
          startOffset: codeBlockStart,
          endOffset: lineWithNLOffset,
          text,
          type: "code",
        });
        inCodeBlock = false;
        codeBlockLines = [];
        currentOffset = lineWithNLOffset;
        continue;
      } else {
        flushParagraph(lineStart);
        flushTable(lineStart);
        inCodeBlock = true;
        codeBlockStart = lineStart;
        codeBlockLines.push(line);
        currentOffset = lineWithNLOffset;
        continue;
      }
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      currentOffset = lineWithNLOffset;
      continue;
    }

    // 2. Multi-line Math block handling ($$ or \\[\\])
    if (trimmed.startsWith("$$") || trimmed.startsWith("\\[")) {
      const isSingleLineMath =
        (trimmed.endsWith("$$") && trimmed.length > 2) ||
        (trimmed.endsWith("\\]") && trimmed.length > 2);

      if (!inMathBlock && !isSingleLineMath) {
        flushParagraph(lineStart);
        flushTable(lineStart);
        inMathBlock = true;
        mathBlockStart = lineStart;
        mathBlockLines.push(line);
        currentOffset = lineWithNLOffset;
        continue;
      } else if (inMathBlock) {
        mathBlockLines.push(line);
        const text = mathBlockLines.join("\n");
        blocks.push({
          startOffset: mathBlockStart,
          endOffset: lineWithNLOffset,
          text,
          type: "math",
        });
        inMathBlock = false;
        mathBlockLines = [];
        currentOffset = lineWithNLOffset;
        continue;
      }
    }

    if (inMathBlock) {
      mathBlockLines.push(line);
      currentOffset = lineWithNLOffset;
      continue;
    }

    // Single-line math block
    if (
      (trimmed.startsWith("$$") && trimmed.endsWith("$$")) ||
      (trimmed.startsWith("\\[") && trimmed.endsWith("\\]"))
    ) {
      flushParagraph(lineStart);
      flushTable(lineStart);
      blocks.push({
        startOffset: lineStart,
        endOffset: lineWithNLOffset,
        text: line,
        type: "math",
      });
      currentOffset = lineWithNLOffset;
      continue;
    }

    // 3. Heading handling (# to ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph(lineStart);
      flushTable(lineStart);
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      blocks.push({
        startOffset: lineStart,
        endOffset: lineWithNLOffset,
        text: line,
        type: "heading",
        headingLevel: level,
        headingText,
      });
      currentOffset = lineWithNLOffset;
      continue;
    }

    // 4. Table handling
    if (trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.length > 2) {
      flushParagraph(lineStart);
      if (!inTable) {
        inTable = true;
        tableStart = lineStart;
      }
      tableLines.push(line);
      currentOffset = lineWithNLOffset;
      continue;
    } else if (inTable) {
      flushTable(lineStart);
    }

    // 5. Blank line / Paragraph
    if (trimmed === "") {
      flushParagraph(lineStart);
      currentOffset = lineWithNLOffset;
      continue;
    }

    if (paragraphStart < 0) {
      paragraphStart = lineStart;
    }
    paragraphLines.push(line);
    currentOffset = lineWithNLOffset;
  }

  // Final flushes
  const finalOffset = content.length;
  if (inCodeBlock) {
    blocks.push({
      startOffset: codeBlockStart,
      endOffset: finalOffset,
      text: codeBlockLines.join("\n"),
      type: "code",
    });
  } else if (inMathBlock) {
    blocks.push({
      startOffset: mathBlockStart,
      endOffset: finalOffset,
      text: mathBlockLines.join("\n"),
      type: "math",
    });
  } else if (inTable) {
    flushTable(finalOffset);
  } else {
    flushParagraph(finalOffset);
  }

  return blocks;
}

/**
 * Builds a clean entity ID segment for versioned vector ID creation.
 */
function buildEntityIdSegment(sourceId: string, chunkIndex: number): string {
  const safeSourceSlug = sourceId.replace(/[^a-zA-Z0-9_-]+/g, "_");
  return `${safeSourceSlug}_c${chunkIndex}`;
}

/**
 * Builds a human-readable and stable locator for a chunk.
 */
function buildChunkLocator(sourcePath: string, headings: string[], chunkIndex: number): string {
  if (headings.length === 0) {
    return `${sourcePath}#top:${chunkIndex}`;
  }
  const cleanHeadings = headings.map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")
  );
  return `${sourcePath}#${cleanHeadings.join("/")}:${chunkIndex}`;
}

/**
 * Chunks a curated source into deterministic semantic chunks.
 */
export function chunkAdminKnowledgeSource(
  source: CuratedSourceContent,
  options: ChunkerOptions = {}
): AdminKnowledgeManifest {
  const maxChunkSize = options.maxChunkSize ?? ADMIN_KNOWLEDGE_BOUNDS.defaultMaxChunkChars;
  const version = options.version ?? 1;
  const content = source.normalizedContent;

  if (!content || content.trim().length === 0) {
    const emptyManifestHash = createHash("sha256").update("", "utf-8").digest("hex");
    return {
      sourceId: source.id,
      sourcePath: source.sourcePath,
      version,
      contentHash: source.contentHash,
      manifestHash: emptyManifestHash,
      chunkCount: 0,
      chunks: [],
    };
  }

  const blocks = parseSemanticBlocks(content);
  const chunks: AdminKnowledgeChunk[] = [];
  let currentBlockBatch: SemanticBlock[] = [];
  let currentChunkLength = 0;
  let activeHeadings: string[] = [];

  const createChunk = (batch: SemanticBlock[], chunkIndex: number): AdminKnowledgeChunk => {
    const startOffset = batch[0].startOffset;
    const endOffset = batch[batch.length - 1].endOffset;
    const chunkContent = content.slice(startOffset, endOffset).trim();
    const chunkHash = createHash("sha256").update(chunkContent, "utf-8").digest("hex");
    const entityId = buildEntityIdSegment(source.id, chunkIndex);
    const vectorId = createVersionedVectorId(ADMIN_DOCUMENT_ENTITY_TYPE, entityId, version);
    const locator = buildChunkLocator(source.sourcePath, activeHeadings, chunkIndex);

    return {
      id: vectorId,
      sourceId: source.id,
      chunkIndex,
      locator,
      headingHierarchy: [...activeHeadings],
      startOffset,
      endOffset,
      content: chunkContent,
      contentHash: chunkHash,
      version,
      status: "active",
      vectorId,
      metadata: {
        sourceTitle: source.title,
        sourceType: source.sourceType,
        sourcePath: source.sourcePath,
        isVirtual: source.isVirtual,
      },
    };
  };

  for (const block of blocks) {
    if (block.type === "heading" && block.headingText) {
      const level = block.headingLevel ?? 1;
      activeHeadings = activeHeadings.slice(0, level - 1);
      activeHeadings.push(block.headingText);
    }

    const blockLength = block.endOffset - block.startOffset;

    if (currentBlockBatch.length > 0 && currentChunkLength + blockLength > maxChunkSize) {
      chunks.push(createChunk(currentBlockBatch, chunks.length));
      currentBlockBatch = [];
      currentChunkLength = 0;
    }

    currentBlockBatch.push(block);
    currentChunkLength += blockLength;
  }

  if (currentBlockBatch.length > 0) {
    chunks.push(createChunk(currentBlockBatch, chunks.length));
  }

  // Compute deterministic manifest hash from all chunk hashes and locators
  const manifestData = chunks
    .map(
      (c) =>
        `${c.chunkIndex}:${c.locator}:${c.contentHash}:${c.startOffset}:${c.endOffset}`
    )
    .join("|");
  const manifestHash = createHash("sha256").update(manifestData, "utf-8").digest("hex");

  return {
    sourceId: source.id,
    sourcePath: source.sourcePath,
    version,
    contentHash: source.contentHash,
    manifestHash,
    chunkCount: chunks.length,
    chunks,
  };
}
