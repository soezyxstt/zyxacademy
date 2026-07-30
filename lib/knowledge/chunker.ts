import { createHash } from 'crypto';

export interface DocumentChunk {
  chunkIndex: number;
  content: string;
  startOffset: number;
  endOffset: number;
  chunkHash: string;
  headings: string[];
}

export interface ChunkingOptions {
  maxChunkSize?: number;
  overlapSize?: number;
  sourceVersion?: string;
}

export interface NormalizedSource {
  sourceDocumentId: string;
  sourceVersion: string;
  content: string;
  sourceHash: string;
}

/**
 * Normalizes input source markdown deterministically and computes SHA-256 source hash.
 * Ensures consistent line endings across platforms.
 */
export function normalizeCanonicalSource(
  sourceDocumentId: string,
  rawContent: string,
  sourceVersion: string = '1.0'
): NormalizedSource {
  const normalizedText = rawContent.replace(/\r\n/g, '\n');
  const sourceHash = createHash('sha256').update(normalizedText).digest('hex');

  return {
    sourceDocumentId: sourceDocumentId.trim(),
    sourceVersion: sourceVersion.trim() || '1.0',
    content: normalizedText,
    sourceHash,
  };
}

export interface SourceBlock {
  startOffset: number;
  endOffset: number;
  text: string;
  type: 'heading' | 'code' | 'math' | 'table' | 'paragraph';
  headingLevel?: number;
  headingText?: string;
}

/**
 * Parses normalized markdown text into non-overlapping semantic blocks preserving exact character offsets.
 * Blocks respect headings, fenced code blocks, math formulas ($$...$$ and \\[...\\]), tables, and paragraphs.
 */
export function parseSemanticBlocks(content: string): SourceBlock[] {
  const blocks: SourceBlock[] = [];
  const lines = content.split('\n');

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
      const text = paragraphLines.join('\n');
      blocks.push({
        startOffset: paragraphStart,
        endOffset,
        text,
        type: 'paragraph',
      });
      paragraphLines = [];
      paragraphStart = -1;
    }
  };

  const flushTable = (endOffset: number) => {
    if (tableLines.length > 0 && tableStart >= 0) {
      const text = tableLines.join('\n');
      blocks.push({
        startOffset: tableStart,
        endOffset,
        text,
        type: 'table',
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

    // 1. Code Block Handling
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      if (inCodeBlock) {
        codeBlockLines.push(line);
        const text = codeBlockLines.join('\n');
        blocks.push({
          startOffset: codeBlockStart,
          endOffset: lineWithNLOffset,
          text,
          type: 'code',
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

    // 2. Math Block Handling ($$ or \\[\\])
    if (trimmed.startsWith('$$') || trimmed.startsWith('\\[')) {
      const isSingleLineMath =
        (trimmed.endsWith('$$') && trimmed.length > 2) ||
        (trimmed.endsWith('\\]') && trimmed.length > 2);
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
        const text = mathBlockLines.join('\n');
        blocks.push({
          startOffset: mathBlockStart,
          endOffset: lineWithNLOffset,
          text,
          type: 'math',
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
      (trimmed.startsWith('$$') && trimmed.endsWith('$$')) ||
      (trimmed.startsWith('\\[') && trimmed.endsWith('\\]'))
    ) {
      flushParagraph(lineStart);
      flushTable(lineStart);
      blocks.push({
        startOffset: lineStart,
        endOffset: lineWithNLOffset,
        text: line,
        type: 'math',
      });
      currentOffset = lineWithNLOffset;
      continue;
    }

    // 3. Heading Handling
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
        type: 'heading',
        headingLevel: level,
        headingText,
      });
      currentOffset = lineWithNLOffset;
      continue;
    }

    // 4. Table Handling
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
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
    if (trimmed === '') {
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
      text: codeBlockLines.join('\n'),
      type: 'code',
    });
  } else if (inMathBlock) {
    blocks.push({
      startOffset: mathBlockStart,
      endOffset: finalOffset,
      text: mathBlockLines.join('\n'),
      type: 'math',
    });
  } else if (inTable) {
    flushTable(finalOffset);
  } else {
    flushParagraph(finalOffset);
  }

  return blocks;
}

/**
 * Groups semantic blocks into deterministic chunks respecting max chunk size and preserving block boundaries.
 */
export function chunkCanonicalSource(
  normalized: NormalizedSource,
  options: ChunkingOptions = {}
): DocumentChunk[] {
  const maxChunkSize = options.maxChunkSize ?? 4000;
  const content = normalized.content;

  if (!content || content.trim().length === 0) {
    return [];
  }

  const blocks = parseSemanticBlocks(content);
  if (blocks.length === 0) {
    return [];
  }

  const chunks: DocumentChunk[] = [];
  let currentBlockBatch: SourceBlock[] = [];
  let currentChunkLength = 0;
  let activeHeadings: string[] = [];

  const createChunk = (batch: SourceBlock[], chunkIndex: number): DocumentChunk => {
    const startOffset = batch[0].startOffset;
    const endOffset = batch[batch.length - 1].endOffset;
    const chunkContent = content.slice(startOffset, endOffset);
    const chunkHash = createHash('sha256').update(chunkContent).digest('hex');

    return {
      chunkIndex,
      content: chunkContent,
      startOffset,
      endOffset,
      chunkHash,
      headings: [...activeHeadings],
    };
  };

  for (const block of blocks) {
    if (block.type === 'heading' && block.headingText) {
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

  return chunks;
}
