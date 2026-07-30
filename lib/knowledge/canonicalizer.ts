import { normalizeConceptName } from '../ko-extractor';
import { type ReconciledCandidateKo } from './candidate-reconciler';
import { type ExistingKoRecord } from './identity';

export interface RegisteredConceptInfo {
  conceptId: string;
  displayName: string;
  aliases: string[];
  embedding?: number[] | null;
  existingKoId?: string;
}

export type ResolutionStatus =
  | 'existing_exact'
  | 'existing_alias'
  | 'new'
  | 'ambiguous'
  | 'reject';

export interface CandidateResolution {
  candidateId: string;
  candidateTitle: string;
  status: ResolutionStatus;
  matchedConceptId?: string;
  matchedKoId?: string;
  canonicalTitle: string;
  confidence: number;
  reason: string;
  embeddingSimilarity?: number;
}

export interface CanonicalizationResult {
  resolutions: CandidateResolution[];
  overallState: 'accepted' | 'needs_review' | 'rejected';
  hasAmbiguousCandidates: boolean;
  needsReviewCount: number;
}

/**
 * Resolves reconciled candidate KOs against existing registered concepts and KOs deterministically.
 * Rule: High embedding similarity WITHOUT exact normalized title match or reviewed alias match
 * MUST produce status 'ambiguous' and require review. NEVER auto-merge on embedding similarity alone.
 */
export function resolveCanonicalConcepts(
  candidates: ReconciledCandidateKo[],
  registeredConcepts: RegisteredConceptInfo[],
  _existingKoRecords: ExistingKoRecord[] = []
): CanonicalizationResult {
  const resolutions: CandidateResolution[] = [];
  let hasAmbiguousCandidates = false;
  let needsReviewCount = 0;

  // Build lookup maps for fast deterministic matching
  const exactMap = new Map<string, RegisteredConceptInfo>();
  const aliasMap = new Map<string, RegisteredConceptInfo>();

  for (const concept of registeredConcepts) {
    const normName = normalizeConceptName(concept.displayName);
    if (normName) {
      exactMap.set(normName, concept);
    }
    for (const alias of concept.aliases || []) {
      const normAlias = normalizeConceptName(alias);
      if (normAlias) {
        aliasMap.set(normAlias, concept);
      }
    }
  }

  for (const candidate of candidates) {
    // Check if candidate has collision flag from reconciliation stage
    if (candidate.hasCollision) {
      hasAmbiguousCandidates = true;
      needsReviewCount++;
      resolutions.push({
        candidateId: candidate.id,
        candidateTitle: candidate.title,
        status: 'ambiguous',
        canonicalTitle: candidate.title,
        confidence: 0.5,
        reason: candidate.collisionReason || 'Cross-chunk collision detected.',
      });
      continue;
    }

    const normTitle = normalizeConceptName(candidate.title);

    // Rule 1: Exact Normalized Identity Match
    const exactMatch = exactMap.get(normTitle);
    if (exactMatch) {
      resolutions.push({
        candidateId: candidate.id,
        candidateTitle: candidate.title,
        status: 'existing_exact',
        matchedConceptId: exactMatch.conceptId,
        matchedKoId: exactMatch.existingKoId,
        canonicalTitle: exactMatch.displayName,
        confidence: 1.0,
        reason: `Exact normalized name match with existing concept "${exactMatch.displayName}".`,
      });
      continue;
    }

    // Rule 2: Exact Reviewed Alias Match
    const aliasMatch = aliasMap.get(normTitle);
    if (aliasMatch) {
      resolutions.push({
        candidateId: candidate.id,
        candidateTitle: candidate.title,
        status: 'existing_alias',
        matchedConceptId: aliasMatch.conceptId,
        matchedKoId: aliasMatch.existingKoId,
        canonicalTitle: aliasMatch.displayName,
        confidence: 0.95,
        reason: `Matched registered alias for concept "${aliasMatch.displayName}".`,
      });
      continue;
    }

    // Rule 3: Embedding Similarity Proposal Check
    // If candidate or registered concepts have embeddings, check similarity
    let highestSim = 0;
    let closestConcept: RegisteredConceptInfo | null = null;

    if (candidate.summary && registeredConcepts.some((c) => c.embedding && c.embedding.length > 0)) {
      // In full execution, candidate embedding can be computed. For resolution logic,
      // if embeddings are provided for matching:
      for (const concept of registeredConcepts) {
        if (concept.embedding && concept.embedding.length > 0) {
          // If we had candidate embedding, compute similarity
          // (Handled when embeddings are passed in metadata or mock)
        }
      }
    }

    // Check if metadata includes candidate embedding similarity proposals
    const simProposal = (candidate as any).embeddingSimilarityProposal as
      | { conceptId: string; similarity: number }
      | undefined;

    if (simProposal && simProposal.similarity > 0.8) {
      highestSim = simProposal.similarity;
      closestConcept =
        registeredConcepts.find((c) => c.conceptId === simProposal.conceptId) || null;
    }

    if (closestConcept && highestSim >= 0.85) {
      // CRITICAL: High embedding similarity without exact name/alias match -> AMBIGUOUS!
      // Must NOT auto-merge! Requires human review.
      hasAmbiguousCandidates = true;
      needsReviewCount++;
      resolutions.push({
        candidateId: candidate.id,
        candidateTitle: candidate.title,
        status: 'ambiguous',
        matchedConceptId: closestConcept.conceptId,
        canonicalTitle: candidate.title,
        confidence: highestSim,
        embeddingSimilarity: highestSim,
        reason: `High embedding similarity (${(highestSim * 100).toFixed(1)}%) with concept "${closestConcept.displayName}", but concept name does not match exact name or alias. Requires review.`,
      });
      continue;
    }

    // Rule 4: New Concept
    resolutions.push({
      candidateId: candidate.id,
      candidateTitle: candidate.title,
      status: 'new',
      canonicalTitle: candidate.title,
      confidence: 1.0,
      reason: `No matching existing concept found; creating new concept "${candidate.title}".`,
    });
  }

  const overallState: 'accepted' | 'needs_review' | 'rejected' =
    hasAmbiguousCandidates || needsReviewCount > 0 ? 'needs_review' : 'accepted';

  return {
    resolutions,
    overallState,
    hasAmbiguousCandidates,
    needsReviewCount,
  };
}
