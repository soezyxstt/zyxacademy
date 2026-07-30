import { type KoSourceSpan } from './contracts';
import { type ChunkCandidateKo, type ChunkLearningObjective } from './candidate-extractor';
import { normalizeConceptName } from '../ko-extractor';

export interface ReconciledCandidateKo {
  id: string;
  title: string;
  summary: string;
  knowledgeKind: ChunkCandidateKo['knowledgeKind'];
  instructionalRole: ChunkCandidateKo['instructionalRole'];
  sourceSpans: KoSourceSpan[];
  excerptHashes: string[];
  prerequisites: string[];
  chunkIndices: number[];
  hasCollision?: boolean;
  collisionReason?: string;
}

export interface ReconciledLearningObjective {
  id: string;
  objectiveText: string;
  bloomLevel: ChunkLearningObjective['bloomLevel'];
  evidenceSourceIds: string[];
  sourceSpans: KoSourceSpan[];
}

export interface ReconciliationReport {
  candidates: ReconciledCandidateKo[];
  learningObjectives: ReconciledLearningObjective[];
  hasAmbiguousCollisions: boolean;
  collisions: Array<{ title: string; reason: string }>;
}

/**
 * Deduplicates and merges KoSourceSpan lists preserving all supporting spans and offsets.
 */
export function mergeAndDeduplicateSpans(spans: KoSourceSpan[]): KoSourceSpan[] {
  const seen = new Set<string>();
  const result: KoSourceSpan[] = [];

  for (const span of spans) {
    const key = `${span.sourceDocumentId}:${span.chapterId}:${span.startOffset}:${span.endOffset}:${span.excerptHash}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(span);
    }
  }

  return result;
}

/**
 * Reconciles candidate KOs across chunks deterministically.
 * Merges candidates with matching normalized title and compatible knowledgeKind while preserving ALL source spans.
 * Flags collisions (same title, incompatible definitions/kinds) as ambiguous.
 */
export function reconcileCrossChunkCandidates(
  chunkCandidates: ChunkCandidateKo[][],
  chunkLearningObjectives: ChunkLearningObjective[][] = []
): ReconciliationReport {
  const reconciledMap = new Map<string, ReconciledCandidateKo>();
  const collisions: Array<{ title: string; reason: string }> = [];
  let hasAmbiguousCollisions = false;

  for (let chunkIdx = 0; chunkIdx < chunkCandidates.length; chunkIdx++) {
    const candidates = chunkCandidates[chunkIdx];

    for (const cand of candidates) {
      const normKey = normalizeConceptName(cand.title);

      if (!reconciledMap.has(normKey)) {
        reconciledMap.set(normKey, {
          id: cand.id,
          title: cand.title,
          summary: cand.summary,
          knowledgeKind: cand.knowledgeKind,
          instructionalRole: cand.instructionalRole,
          sourceSpans: [...cand.sourceSpans],
          excerptHashes: [...cand.excerptHashes],
          prerequisites: [...cand.prerequisites],
          chunkIndices: [chunkIdx],
        });
      } else {
        const existing = reconciledMap.get(normKey)!;

        // Collision Check: Same title but conflicting knowledgeKind or incompatible definition
        const isCompatible =
          existing.knowledgeKind === cand.knowledgeKind ||
          existing.knowledgeKind === 'other' ||
          cand.knowledgeKind === 'other';

        if (!isCompatible) {
          hasAmbiguousCollisions = true;
          existing.hasCollision = true;
          existing.collisionReason = `Collision detected for "${cand.title}": conflicting kinds "${existing.knowledgeKind}" vs "${cand.knowledgeKind}".`;
          collisions.push({
            title: cand.title,
            reason: existing.collisionReason,
          });
        }

        // Merge source spans preserving ALL evidence
        existing.sourceSpans = mergeAndDeduplicateSpans([
          ...existing.sourceSpans,
          ...cand.sourceSpans,
        ]);

        // Merge excerpt hashes and prerequisites
        existing.excerptHashes = Array.from(
          new Set([...existing.excerptHashes, ...cand.excerptHashes])
        );
        existing.prerequisites = Array.from(
          new Set([...existing.prerequisites, ...cand.prerequisites])
        );

        if (!existing.chunkIndices.includes(chunkIdx)) {
          existing.chunkIndices.push(chunkIdx);
        }

        // Expand summary if new summary adds detail
        if (cand.summary.length > existing.summary.length && !existing.summary.includes(cand.summary)) {
          existing.summary = `${existing.summary} ${cand.summary}`;
        }
      }
    }
  }

  // Reconcile Learning Objectives
  const loMap = new Map<string, ReconciledLearningObjective>();
  for (const loList of chunkLearningObjectives) {
    for (const lo of loList) {
      const normText = normalizeConceptName(lo.objectiveText);
      if (!loMap.has(normText)) {
        loMap.set(normText, {
          id: lo.id,
          objectiveText: lo.objectiveText,
          bloomLevel: lo.bloomLevel,
          evidenceSourceIds: [...lo.evidenceSourceIds],
          sourceSpans: [...lo.sourceSpans],
        });
      } else {
        const existingLo = loMap.get(normText)!;
        existingLo.sourceSpans = mergeAndDeduplicateSpans([
          ...existingLo.sourceSpans,
          ...lo.sourceSpans,
        ]);
        existingLo.evidenceSourceIds = Array.from(
          new Set([...existingLo.evidenceSourceIds, ...lo.evidenceSourceIds])
        );
      }
    }
  }

  return {
    candidates: Array.from(reconciledMap.values()),
    learningObjectives: Array.from(loMap.values()),
    hasAmbiguousCollisions,
    collisions,
  };
}
