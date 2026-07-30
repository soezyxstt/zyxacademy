import { createHash } from 'crypto';
import {
  type KnowledgeKind,
  type InstructionalRole,
  type BloomLevel,
  type KoSourceSpan,
} from './contracts';
import { type DocumentChunk, type NormalizedSource } from './chunker';

export interface ChunkCandidateKo {
  id: string;
  title: string;
  summary: string;
  knowledgeKind: KnowledgeKind;
  instructionalRole: InstructionalRole;
  sourceSpans: KoSourceSpan[];
  excerptHashes: string[];
  prerequisites: string[];
  uncertaintyReasonCodes?: string[];
}

export interface ChunkLearningObjective {
  id: string;
  objectiveText: string;
  bloomLevel: BloomLevel;
  evidenceSourceIds: string[];
  sourceSpans: KoSourceSpan[];
}

export interface ChunkExtractionResult {
  chunkIndex: number;
  candidates: ChunkCandidateKo[];
  learningObjectives: ChunkLearningObjective[];
  status: 'success' | 'needs_review' | 'failed';
  errorMessage?: string;
}

/**
 * Creates a validated KoSourceSpan ensuring absolute offsets match canonical source text.
 */
export function createKoSourceSpan(
  normalizedSource: NormalizedSource,
  chapterId: string,
  startOffset: number,
  endOffset: number,
  supportRole: InstructionalRole = 'core'
): KoSourceSpan {
  const content = normalizedSource.content;
  const safeStart = Math.max(0, Math.min(startOffset, content.length));
  const safeEnd = Math.max(safeStart, Math.min(endOffset, content.length));

  const excerpt = content.slice(safeStart, safeEnd);
  const excerptHash = createHash('sha256').update(excerpt).digest('hex');

  return {
    sourceDocumentId: normalizedSource.sourceDocumentId,
    sourceVersion: normalizedSource.sourceVersion,
    chapterId,
    startOffset: safeStart,
    endOffset: safeEnd,
    sourceHash: normalizedSource.sourceHash,
    excerptHash,
    supportRole,
  };
}

/**
 * Helper to locate an excerpt inside a chunk and compute absolute source offsets.
 */
export function locateExcerptSpan(
  normalizedSource: NormalizedSource,
  chunk: DocumentChunk,
  chapterId: string,
  excerpt: string,
  supportRole: InstructionalRole = 'core'
): KoSourceSpan {
  const trimmedExcerpt = excerpt.trim();
  if (!trimmedExcerpt) {
    return createKoSourceSpan(
      normalizedSource,
      chapterId,
      chunk.startOffset,
      chunk.endOffset,
      supportRole
    );
  }

  const relativeIndex = chunk.content.indexOf(trimmedExcerpt);
  if (relativeIndex >= 0) {
    const absStart = chunk.startOffset + relativeIndex;
    const absEnd = absStart + trimmedExcerpt.length;
    return createKoSourceSpan(normalizedSource, chapterId, absStart, absEnd, supportRole);
  }

  // Fallback: search full normalized source
  const fullIndex = normalizedSource.content.indexOf(trimmedExcerpt);
  if (fullIndex >= 0) {
    return createKoSourceSpan(
      normalizedSource,
      chapterId,
      fullIndex,
      fullIndex + trimmedExcerpt.length,
      supportRole
    );
  }

  // Fallback to chunk boundaries if excerpt not found directly
  return createKoSourceSpan(
    normalizedSource,
    chapterId,
    chunk.startOffset,
    chunk.endOffset,
    supportRole
  );
}

/**
 * Validates and normalizes candidate KOs extracted from a chunk.
 */
export function validateChunkCandidates(
  chunk: DocumentChunk,
  normalizedSource: NormalizedSource,
  chapterId: string,
  rawCandidates: Array<{
    title: string;
    summary: string;
    knowledgeKind?: KnowledgeKind;
    instructionalRole?: InstructionalRole;
    excerpt?: string;
    prerequisites?: string[];
    uncertaintyReasonCodes?: string[];
  }>
): ChunkCandidateKo[] {
  return rawCandidates.map((raw, idx) => {
    const title = raw.title?.trim() || `Untitled Concept ${idx + 1}`;
    const summary = raw.summary?.trim() || title;
    const knowledgeKind: KnowledgeKind = raw.knowledgeKind || 'other';
    const instructionalRole: InstructionalRole = raw.instructionalRole || 'core';
    const excerpt = raw.excerpt || summary;

    const span = locateExcerptSpan(
      normalizedSource,
      chunk,
      chapterId,
      excerpt,
      instructionalRole
    );

    return {
      id: `cand_chunk${chunk.chunkIndex}_${idx + 1}`,
      title,
      summary,
      knowledgeKind,
      instructionalRole,
      sourceSpans: [span],
      excerptHashes: [span.excerptHash],
      prerequisites: raw.prerequisites || [],
      uncertaintyReasonCodes: raw.uncertaintyReasonCodes,
    };
  });
}

/**
 * Validates and normalizes Learning Objectives extracted from a chunk.
 * Bloom level is assigned strictly to Learning Objectives.
 */
export function validateChunkLearningObjectives(
  chunk: DocumentChunk,
  normalizedSource: NormalizedSource,
  chapterId: string,
  rawObjectives: Array<{
    objectiveText: string;
    bloomLevel: BloomLevel;
    excerpt?: string;
  }>
): ChunkLearningObjective[] {
  return rawObjectives.map((raw, idx) => {
    const objectiveText = raw.objectiveText?.trim() || 'Untitled Learning Objective';
    const bloomLevel: BloomLevel = raw.bloomLevel || 'understand';
    const excerpt = raw.excerpt || objectiveText;

    const span = locateExcerptSpan(
      normalizedSource,
      chunk,
      chapterId,
      excerpt,
      'core'
    );

    return {
      id: `lo_chunk${chunk.chunkIndex}_${idx + 1}`,
      objectiveText,
      bloomLevel,
      evidenceSourceIds: [span.sourceDocumentId],
      sourceSpans: [span],
    };
  });
}
