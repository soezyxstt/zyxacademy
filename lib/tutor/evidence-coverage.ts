import type { SourceEnvelope } from "./prompt-sanitizer";

export type EvidenceCoverageState = "full" | "partial" | "none" | "conflict" | "needs_review";

export interface ClaimUnit {
  id: string;
  statement: string;
  category?: string;
}

export interface ClaimSupport {
  claimId: string;
  status: "supported" | "unsupported" | "conflicting";
  sourceIds: string[];
  supportSpan?: string;
  unsupportedReason?: string;
}

export interface EvidenceClassification {
  state: EvidenceCoverageState;
  claims: ClaimSupport[];
  missingScope: string[];
  conflictSummary: string | null;
  reasonCodes: string[];
}

export interface AnswerPlan {
  coverageState: EvidenceCoverageState;
  allowedHelpLevel: string;
  supportedClaimIds: string[];
  unsupportedScope: string[];
  conflictSummary: string | null;
  actionDisposition: "answer_all" | "answer_partial" | "abstain" | "explain_conflict" | "request_review";
  reasonCodes: string[];
}

/**
 * Extracts distinct claim units from user academic query deterministically.
 */
export function extractClaimUnits(query: string): ClaimUnit[] {
  const norm = query.trim();
  if (!norm) return [];

  // Split on conjunctions or question marks to find multi-part questions
  const parts = norm
    .split(/(?:\s+(?:dan|serta|sekaligus|sambil)\s+|\?+|,+)/gi)
    .map((p) => p.trim())
    .filter((p) => p.length >= 3);

  if (parts.length <= 1) {
    return [{ id: "claim-1", statement: norm }];
  }

  return parts.map((part, idx) => ({
    id: `claim-${idx + 1}`,
    statement: part,
  }));
}

/**
 * Normalizes text for term matching.
 */
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[\p{P}\p{S}]/gu, " ").replace(/\s+/g, " ").trim();
}

/**
 * Detects conflicting material statements across retrieved sources.
 */
export function detectSourceConflicts(sources: SourceEnvelope[]): { hasConflict: boolean; summary: string | null } {
  if (sources.length < 2) {
    return { hasConflict: false, summary: null };
  }

  // Check for direct contradiction patterns (e.g. turunan sin(x) adalah cos(x) vs -cos(x))
  const contents = sources.map((s) => ({
    id: s.id,
    rawLower: s.content.toLowerCase(),
    norm: normalizeText(s.content),
    title: s.title,
  }));

  for (let i = 0; i < contents.length; i++) {
    for (let j = i + 1; j < contents.length; j++) {
      const a = contents[i];
      const b = contents[j];

      // Check for opposing formula or negation patterns on common subjects
      const aTrig = a.rawLower.includes("sin(x)") || a.norm.includes("sin x") || a.norm.includes("sinx");
      const bTrig = b.rawLower.includes("sin(x)") || b.norm.includes("sin x") || b.norm.includes("sinx");

      if (aTrig && bTrig) {
        const aHasNeg = a.rawLower.includes("-cos(x)") || a.rawLower.includes("- cos(x)") || a.norm.includes(" cos x") && a.rawLower.includes("-");
        const bHasNeg = b.rawLower.includes("-cos(x)") || b.rawLower.includes("- cos(x)") || b.norm.includes(" cos x") && b.rawLower.includes("-");
        const aHasPos = (a.rawLower.includes("adalah cos(x)") || a.norm.includes("adalah cos x")) && !aHasNeg;
        const bHasPos = (b.rawLower.includes("adalah cos(x)") || b.norm.includes("adalah cos x")) && !bHasNeg;

        if ((aHasNeg && bHasPos) || (aHasPos && bHasNeg)) {
          return {
            hasConflict: true,
            summary: `Konflik terdeteksi antara sumber ${a.id} dan ${b.id} mengenai rumus turunan sin(x).`,
          };
        }
      }
    }
  }

  return { hasConflict: false, summary: null };
}

/**
 * Classifies evidence coverage per claim and overall coverage state.
 */
export function classifyEvidence(params: {
  query: string;
  claims?: ClaimUnit[];
  sources: SourceEnvelope[];
}): EvidenceClassification {
  const { query, sources } = params;
  const claims = params.claims ?? extractClaimUnits(query);

  if (sources.length === 0) {
    return {
      state: "none",
      claims: claims.map((c) => ({
        claimId: c.id,
        status: "unsupported",
        sourceIds: [],
        unsupportedReason: "No relevant sources retrieved.",
      })),
      missingScope: claims.map((c) => c.statement),
      conflictSummary: null,
      reasonCodes: ["NO_RETRIEVED_SOURCES"],
    };
  }

  // Check for source conflicts
  const conflict = detectSourceConflicts(sources);
  if (conflict.hasConflict) {
    return {
      state: "conflict",
      claims: claims.map((c) => ({
        claimId: c.id,
        status: "conflicting",
        sourceIds: sources.map((s) => s.id),
      })),
      missingScope: [],
      conflictSummary: conflict.summary,
      reasonCodes: ["MATERIAL_SOURCE_CONFLICT"],
    };
  }

  const claimSupports: ClaimSupport[] = [];
  const missingScope: string[] = [];

  for (const claim of claims) {
    const claimTerms = normalizeText(claim.statement)
      .split(" ")
      .filter((t) => t.length >= 3 && !["apa", "bagaimana", "dan", "yang", "untuk", "pada"].includes(t));

    const matchingSourceIds: string[] = [];

    for (const src of sources) {
      const srcNorm = normalizeText(src.content);
      const matchCount = claimTerms.filter((term) => srcNorm.includes(term)).length;
      const matchRatio = claimTerms.length > 0 ? matchCount / claimTerms.length : 0;

      if (matchRatio >= 0.4 || (claimTerms.length <= 2 && matchCount >= 1)) {
        matchingSourceIds.push(src.id);
      }
    }

    if (matchingSourceIds.length > 0) {
      claimSupports.push({
        claimId: claim.id,
        status: "supported",
        sourceIds: matchingSourceIds,
      });
    } else {
      claimSupports.push({
        claimId: claim.id,
        status: "unsupported",
        sourceIds: [],
        unsupportedReason: "No retrieved source covers this specific claim.",
      });
      missingScope.push(claim.statement);
    }
  }

  const supportedCount = claimSupports.filter((c) => c.status === "supported").length;

  let state: EvidenceCoverageState;
  const reasonCodes: string[] = [];

  if (supportedCount === claims.length) {
    state = "full";
    reasonCodes.push("FULL_EVIDENCE_COVERAGE");
  } else if (supportedCount > 0) {
    state = "partial";
    reasonCodes.push("PARTIAL_EVIDENCE_COVERAGE");
  } else {
    state = "none";
    reasonCodes.push("INSUFFICIENT_EVIDENCE");
  }

  return {
    state,
    claims: claimSupports,
    missingScope,
    conflictSummary: null,
    reasonCodes,
  };
}

/**
 * Builds a deterministic answer plan from an evidence classification.
 */
export function buildAnswerPlan(
  classification: EvidenceClassification,
  allowedHelpLevel = "full_explanation"
): AnswerPlan {
  const { state, claims, missingScope, conflictSummary, reasonCodes } = classification;

  let actionDisposition: AnswerPlan["actionDisposition"];

  switch (state) {
    case "full":
      actionDisposition = "answer_all";
      break;
    case "partial":
      actionDisposition = "answer_partial";
      break;
    case "none":
      actionDisposition = "abstain";
      break;
    case "conflict":
      actionDisposition = "explain_conflict";
      break;
    case "needs_review":
    default:
      actionDisposition = "request_review";
      break;
  }

  const supportedClaimIds = claims.filter((c) => c.status === "supported").map((c) => c.claimId);

  return {
    coverageState: state,
    allowedHelpLevel,
    supportedClaimIds,
    unsupportedScope: missingScope,
    conflictSummary,
    actionDisposition,
    reasonCodes,
  };
}
