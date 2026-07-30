import { createHash } from 'crypto';
import type { CandidateKo, KnowledgeKind, InstructionalRole } from './contracts';

export interface ExistingKoRecord {
  id: string;
  stableKey: string | null;
  semanticHash: string | null;
  version: number;
  status: string; // 'active' | 'superseded' | 'legacy_unresolved' | 'needs_review'
  chapterId: string;
}

export interface KoReconciliationResult {
  action: 'insert' | 'update' | 'retain' | 'supersede' | 'needs_review';
  existingId?: string;
  candidate: CandidateKo;
  stableKey: string;
  semanticHash: string;
  reason?: string;
}

/**
 * Generate a deterministic stable identity key for a Knowledge Object.
 */
export function generateStableKoKey(
  sourceDocumentId: string,
  chapterId: string,
  conceptName: string
): string {
  const normalizedConcept = conceptName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const rawInput = `${sourceDocumentId.trim()}:${chapterId.trim()}:${normalizedConcept}`;
  const hash = createHash('sha256').update(rawInput).digest('hex').slice(0, 12);
  return `ko_${normalizedConcept.slice(0, 32)}_${hash}`;
}

/**
 * Compute semantic hash of KO content for diff tracking.
 */
export function computeSemanticKoHash(
  title: string,
  summary: string,
  knowledgeKind: KnowledgeKind,
  instructionalRole: InstructionalRole
): string {
  const payload = JSON.stringify({
    title: title.trim().toLowerCase(),
    summary: summary.trim().toLowerCase(),
    knowledgeKind,
    instructionalRole,
  });
  return createHash('sha256').update(payload).digest('hex');
}

/**
 * Reconcile candidate Knowledge Objects against existing database records without destructive chapter deletion.
 */
export function reconcileKoExtractionRun(
  existingKos: ExistingKoRecord[],
  candidateKos: CandidateKo[],
  sourceDocumentId: string,
  chapterId: string
): {
  reconciliations: KoReconciliationResult[];
  hasAmbiguousMatch: boolean;
} {
  const reconciliations: KoReconciliationResult[] = [];
  const existingMap = new Map<string, ExistingKoRecord>();
  let hasAmbiguousMatch = false;

  for (const existing of existingKos) {
    if (existing.stableKey) {
      if (existingMap.has(existing.stableKey)) {
        // Ambiguous duplicate key in existing DB state
        hasAmbiguousMatch = true;
      } else {
        existingMap.set(existing.stableKey, existing);
      }
    }
  }

  const matchedExistingIds = new Set<string>();

  for (const candidate of candidateKos) {
    const stableKey =
      candidate.stableKey || generateStableKoKey(sourceDocumentId, chapterId, candidate.title);
    const semanticHash = computeSemanticKoHash(
      candidate.title,
      candidate.summary,
      candidate.knowledgeKind,
      candidate.instructionalRole
    );

    const existing = existingMap.get(stableKey);

    if (!existing) {
      reconciliations.push({
        action: 'insert',
        candidate,
        stableKey,
        semanticHash,
      });
    } else {
      matchedExistingIds.add(existing.id);
      if (existing.semanticHash === semanticHash) {
        reconciliations.push({
          action: 'retain',
          existingId: existing.id,
          candidate,
          stableKey,
          semanticHash,
        });
      } else {
        reconciliations.push({
          action: 'update',
          existingId: existing.id,
          candidate,
          stableKey,
          semanticHash,
        });
      }
    }
  }

  // Identify existing active KOs not matched by candidate set
  for (const existing of existingKos) {
    if (!matchedExistingIds.has(existing.id) && existing.status === 'active') {
      reconciliations.push({
        action: 'supersede',
        existingId: existing.id,
        candidate: {
          title: '',
          summary: '',
          knowledgeKind: 'other',
          instructionalRole: 'core',
          sourceSpans: [],
        },
        stableKey: existing.stableKey || '',
        semanticHash: existing.semanticHash || '',
        reason: 'Missing in new accepted extraction run',
      });
    }
  }

  return { reconciliations, hasAmbiguousMatch };
}
