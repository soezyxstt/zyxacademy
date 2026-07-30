import type { EvidenceCoverageState } from "./evidence-coverage";

export interface CitationVerificationParams {
  citedIds: string[];
  allowedSourceIds: string[];
  coverageState: EvidenceCoverageState;
}

export interface CitationVerificationResult {
  validSourceIds: string[];
  droppedSourceIds: string[];
  isGrounded: boolean;
  downgradedCoverageState?: EvidenceCoverageState;
  reasonCodes: string[];
}

/**
 * Verifies that cited source IDs exist in the allowlist of retrieved sources.
 * Strictly drops hallucinated/invalid source IDs and NEVER substitutes fallback
 * top-ranked retrieval IDs when citations are missing or invalid.
 */
export function verifyCitations(params: CitationVerificationParams): CitationVerificationResult {
  const { citedIds, allowedSourceIds, coverageState } = params;

  const allowSet = new Set(allowedSourceIds);
  const validSourceIds: string[] = [];
  const droppedSourceIds: string[] = [];
  const reasonCodes: string[] = [];

  // Deduplicate and validate each cited ID against allowlist
  const uniqueCited = [...new Set(citedIds)];

  for (const id of uniqueCited) {
    if (allowSet.has(id)) {
      validSourceIds.push(id);
    } else {
      droppedSourceIds.push(id);
    }
  }

  if (droppedSourceIds.length > 0) {
    reasonCodes.push("INVALID_CITATION_ID_DROPPED");
  }

  let isGrounded = validSourceIds.length > 0;
  let downgradedCoverageState: EvidenceCoverageState | undefined = undefined;

  // Rule: If model claimed full or partial coverage, but no valid citations remain,
  // downgrade coverage state and mark ungrounded without fallback ranking substitution.
  if ((coverageState === "full" || coverageState === "partial") && validSourceIds.length === 0) {
    isGrounded = false;
    downgradedCoverageState = "none";
    reasonCodes.push("NO_VALID_CITATIONS_REMAINING", "CITATION_VERIFICATION_FAILED");
  } else if (coverageState === "none") {
    isGrounded = false;
  }

  return {
    validSourceIds,
    droppedSourceIds,
    isGrounded,
    downgradedCoverageState,
    reasonCodes,
  };
}
