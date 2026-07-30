import {
  normalizeCanonicalSource,
  chunkCanonicalSource,
  type NormalizedSource,
  type DocumentChunk,
  type ChunkingOptions,
} from './chunker';
import {
  validateChunkCandidates,
  validateChunkLearningObjectives,
  type ChunkCandidateKo,
  type ChunkLearningObjective,
} from './candidate-extractor';
import {
  reconcileCrossChunkCandidates,
  type ReconciledCandidateKo,
  type ReconciliationReport,
} from './candidate-reconciler';
import {
  resolveCanonicalConcepts,
  type RegisteredConceptInfo,
  type CanonicalizationResult,
} from './canonicalizer';
import {
  reconcileKoExtractionRun,
  type ExistingKoRecord,
  type KoReconciliationResult,
  generateStableKoKey,
} from './identity';
import { type ExtractionRunState, type CandidateKo, type KoSourceSpan } from './contracts';

export interface StagedKoExtractionInput {
  sourceDocumentId: string;
  chapterId: string;
  rawContent: string;
  sourceVersion?: string;
  chunkingOptions?: ChunkingOptions;
  existingKoRecords?: ExistingKoRecord[];
  registeredConcepts?: RegisteredConceptInfo[];
  chunkExtractorFn?: (
    chunk: DocumentChunk,
    normalizedSource: NormalizedSource
  ) => Promise<{
    candidates: Array<{
      title: string;
      summary: string;
      knowledgeKind?: any;
      instructionalRole?: any;
      excerpt?: string;
      prerequisites?: string[];
      uncertaintyReasonCodes?: string[];
    }>;
    learningObjectives?: Array<{
      objectiveText: string;
      bloomLevel: any;
      excerpt?: string;
    }>;
  }>;
}

export interface StagedKoExtractionRunResult {
  runId: string;
  sourceDocumentId: string;
  chapterId: string;
  state: ExtractionRunState;
  normalizedSource: NormalizedSource;
  chunks: DocumentChunk[];
  reconciliationReport: ReconciliationReport;
  canonicalizationResult: CanonicalizationResult;
  dbReconciliations: KoReconciliationResult[];
  errors: string[];
}

/**
 * Validates whole extraction run before persistence:
 * Complete chunk coverage, valid offsets, unique stable keys, no unresolved candidates in accepted state.
 */
export function validateExtractionRun(
  normalizedSource: NormalizedSource,
  chunks: DocumentChunk[],
  candidates: ReconciledCandidateKo[],
  _canonicalization: CanonicalizationResult
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 1. Chunk Coverage Check
  if (chunks.length === 0 && normalizedSource.content.trim().length > 0) {
    errors.push('Source content is non-empty but zero chunks were produced.');
  }

  // 2. Offsets & Excerpt Validation
  for (const cand of candidates) {
    if (cand.sourceSpans.length === 0) {
      errors.push(`Candidate "${cand.title}" has no source spans.`);
    }
    for (const span of cand.sourceSpans) {
      if (span.startOffset < 0 || span.endOffset <= span.startOffset) {
        errors.push(
          `Invalid offsets [${span.startOffset}, ${span.endOffset}] for candidate "${cand.title}".`
        );
      }
      if (span.endOffset > normalizedSource.content.length) {
        errors.push(
          `End offset ${span.endOffset} exceeds source length ${normalizedSource.content.length} for "${cand.title}".`
        );
      }
    }
  }

  // 3. Unique Stable Keys Check
  const stableKeys = new Set<string>();
  for (const cand of candidates) {
    const key = generateStableKoKey(
      spanDocumentId(cand.sourceSpans, normalizedSource.sourceDocumentId),
      spanChapterId(cand.sourceSpans),
      cand.title
    );
    if (stableKeys.has(key)) {
      errors.push(`Duplicate stable key "${key}" detected for candidate "${cand.title}".`);
    }
    stableKeys.add(key);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function spanDocumentId(spans: KoSourceSpan[], fallback: string): string {
  return spans[0]?.sourceDocumentId || fallback;
}

function spanChapterId(spans: KoSourceSpan[]): string {
  return spans[0]?.chapterId || 'ch_default';
}

/**
 * Executes full 7-stage staged Knowledge Object extraction pipeline.
 */
export async function executeStagedKoExtractionRun(
  input: StagedKoExtractionInput
): Promise<StagedKoExtractionRunResult> {
  const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const errors: string[] = [];

  // Stage 1: Source Normalization
  const normalizedSource = normalizeCanonicalSource(
    input.sourceDocumentId,
    input.rawContent,
    input.sourceVersion
  );

  // Stage 2: Deterministic Semantic Chunking
  const chunks = chunkCanonicalSource(normalizedSource, input.chunkingOptions);

  if (chunks.length === 0) {
    return {
      runId,
      sourceDocumentId: input.sourceDocumentId,
      chapterId: input.chapterId,
      state: 'failed',
      normalizedSource,
      chunks: [],
      reconciliationReport: {
        candidates: [],
        learningObjectives: [],
        hasAmbiguousCollisions: false,
        collisions: [],
      },
      canonicalizationResult: {
        resolutions: [],
        overallState: 'rejected',
        hasAmbiguousCandidates: false,
        needsReviewCount: 0,
      },
      dbReconciliations: [],
      errors: ['Empty or invalid source document; cannot chunk.'],
    };
  }

  // Stage 3: Candidate Extraction Per Chunk
  const perChunkCandidates: ChunkCandidateKo[][] = [];
  const perChunkObjectives: ChunkLearningObjective[][] = [];

  for (const chunk of chunks) {
    if (input.chunkExtractorFn) {
      try {
        const res = await input.chunkExtractorFn(chunk, normalizedSource);
        const validCands = validateChunkCandidates(
          chunk,
          normalizedSource,
          input.chapterId,
          res.candidates || []
        );
        const validObjs = validateChunkLearningObjectives(
          chunk,
          normalizedSource,
          input.chapterId,
          res.learningObjectives || []
        );

        perChunkCandidates.push(validCands);
        perChunkObjectives.push(validObjs);
      } catch (err: any) {
        errors.push(`Chunk ${chunk.chunkIndex} extraction failed: ${err.message}`);
        perChunkCandidates.push([]);
        perChunkObjectives.push([]);
      }
    } else {
      perChunkCandidates.push([]);
      perChunkObjectives.push([]);
    }
  }

  // Stage 4: Cross-chunk Reconciliation & Relationship Aggregation
  const reconciliationReport = reconcileCrossChunkCandidates(
    perChunkCandidates,
    perChunkObjectives
  );

  // Stage 5: Canonical Concept Resolution
  const registeredConcepts = input.registeredConcepts || [];
  const existingKoRecords = input.existingKoRecords || [];
  const canonicalizationResult = resolveCanonicalConcepts(
    reconciliationReport.candidates,
    registeredConcepts,
    existingKoRecords
  );

  // Stage 6: Validation & Run State Assignment
  const validation = validateExtractionRun(
    normalizedSource,
    chunks,
    reconciliationReport.candidates,
    canonicalizationResult
  );

  if (!validation.isValid) {
    errors.push(...validation.errors);
  }

  let finalState: ExtractionRunState = 'staged';
  if (errors.length > 0) {
    finalState = 'failed';
  } else if (
    reconciliationReport.hasAmbiguousCollisions ||
    canonicalizationResult.hasAmbiguousCandidates ||
    canonicalizationResult.overallState === 'needs_review'
  ) {
    finalState = 'needs_review';
  } else {
    finalState = 'accepted';
  }

  // Stage 7: Persistence Reconciliation via Plan 007 identity engine
  let dbReconciliations: KoReconciliationResult[] = [];
  if (finalState === 'accepted') {
    const candidateKos: CandidateKo[] = reconciliationReport.candidates.map((c) => ({
      stableKey: generateStableKoKey(input.sourceDocumentId, input.chapterId, c.title),
      title: c.title,
      summary: c.summary,
      knowledgeKind: c.knowledgeKind,
      instructionalRole: c.instructionalRole,
      sourceSpans: c.sourceSpans,
    }));

    const recon = reconcileKoExtractionRun(
      existingKoRecords,
      candidateKos,
      input.sourceDocumentId,
      input.chapterId
    );

    dbReconciliations = recon.reconciliations;
  }

  return {
    runId,
    sourceDocumentId: input.sourceDocumentId,
    chapterId: input.chapterId,
    state: finalState,
    normalizedSource,
    chunks,
    reconciliationReport,
    canonicalizationResult,
    dbReconciliations,
    errors,
  };
}
