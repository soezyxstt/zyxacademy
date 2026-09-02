import { z } from "zod";
import {
  OpsAiCitationSchema,
  OpsAiProvenanceSourceSchema,
  OpsAiCitationAvailabilitySchema,
  validateOpsAiCitation,
  verifyCitationBinding,
  type OpsAiCitation,
  type OpsAiProvenanceSource,
  type OpsAiCitationAvailability,
} from "./contracts";
import type { AdminKnowledgeSearchResult } from "./admin-knowledge-contracts";

/**
 * Zyx Ops AI v2 Citations Management Module (Checkpoint 4 - OPS-AI-V2-CP4-CITATIONS).
 *
 * Implements precise, deterministic citation binding, multi-provenance classification,
 * availability lifecycle, deterministic deduplication, inline marker parsing,
 * and citation binding verification against phantom or forged citations.
 */

// ============================================================================
// 1. Official Copywriting Constants
// ============================================================================

/**
 * Official UI copywriting label for citations provided to the model.
 * Clarifies that these sources were presented to the model as context,
 * avoiding ungrounded claims that the model read or cited every source verbatim.
 */
export const OPS_AI_CITATION_OFFICIAL_LABEL = "Sumber yang diberikan kepada model" as const;

export const OPS_AI_CITATION_OFFICIAL_DISCLAIMER =
  "Sumber yang diberikan kepada model untuk referensi kontekstual, bukan jaminan model mengutip seluruh hasil secara verbatim." as const;

export function getOfficialCitationHeading(): string {
  return OPS_AI_CITATION_OFFICIAL_LABEL;
}

// ============================================================================
// 2. Provenance Mapping & Security Guard
// ============================================================================

export const TOOL_PROVENANCE_MAPPING: Readonly<Record<string, OpsAiProvenanceSource>> = Object.freeze({
  retrieve_admin_knowledge: "semantic-rag",
  inspect_schema: "database-read",
  get_system_metrics: "database-read",
  search_users: "database-read",
  navigate_admin: "live-tool",
});

/**
 * Enforces provenance integrity so live tools or database queries are never
 * forged or misrepresented as semantic-rag documents.
 */
export function assertProvenanceIntegrity(
  toolName: string,
  provenance: OpsAiProvenanceSource
): void {
  if (toolName === "retrieve_admin_knowledge" && provenance !== "semantic-rag") {
    throw new Error(
      `Provenance Violation: Tool 'retrieve_admin_knowledge' must use 'semantic-rag' provenance, got '${provenance}'.`
    );
  }
  if (toolName !== "retrieve_admin_knowledge" && provenance === "semantic-rag") {
    throw new Error(
      `Security Violation: Non-retrieval tool '${toolName}' cannot forge live tool or database read data as 'semantic-rag'.`
    );
  }
}

// ============================================================================
// 3. Citation Builders
// ============================================================================

export interface CitationBindingContext {
  readonly runId: string;
  readonly stepId: string;
  readonly toolCallId?: string;
  readonly availability?: OpsAiCitationAvailability;
  readonly timestamp?: number;
}

/**
 * Builds a validated OpsAiCitation from a semantic RAG search result.
 * Strictly strips internal search metadata (boost, rawScore, locator)
 * to satisfy OpsAiCitationSchema.strict().
 */
export function buildSemanticRagCitation(
  searchResult: AdminKnowledgeSearchResult,
  binding: CitationBindingContext
): OpsAiCitation {
  const citation: OpsAiCitation = {
    id: `cite-${binding.runId}-${binding.stepId}-${searchResult.id}`,
    sourceId: searchResult.sourceId,
    source: "semantic-rag",
    availability: binding.availability ?? (searchResult.availability as OpsAiCitationAvailability) ?? "available",
    runId: binding.runId,
    stepId: binding.stepId,
    toolCallId: binding.toolCallId,
    title: searchResult.title,
    filePath: searchResult.filePath,
    section: searchResult.section,
    snippet: searchResult.snippet,
    score: searchResult.score,
    timestamp: binding.timestamp ?? Date.now(),
  };

  const validation = validateOpsAiCitation(citation);
  if (!validation.valid) {
    throw new Error(`Invalid semantic-rag citation created: ${validation.errors.join(", ")}`);
  }

  return citation;
}

/**
 * Builds a validated live-tool OpsAiCitation (e.g. navigation).
 */
export function buildLiveToolCitation(params: {
  id?: string;
  sourceId: string;
  title: string;
  snippet: string;
  runId: string;
  stepId: string;
  toolCallId?: string;
  availability?: OpsAiCitationAvailability;
  url?: string;
  timestamp?: number;
}): OpsAiCitation {
  const citation: OpsAiCitation = {
    id: params.id ?? `cite-${params.runId}-${params.stepId}-${params.sourceId}`,
    sourceId: params.sourceId,
    source: "live-tool",
    availability: params.availability ?? "available",
    runId: params.runId,
    stepId: params.stepId,
    toolCallId: params.toolCallId,
    title: params.title,
    snippet: params.snippet,
    url: params.url,
    timestamp: params.timestamp ?? Date.now(),
  };

  const validation = validateOpsAiCitation(citation);
  if (!validation.valid) {
    throw new Error(`Invalid live-tool citation created: ${validation.errors.join(", ")}`);
  }

  return citation;
}

/**
 * Builds a validated database-read OpsAiCitation (e.g. schema introspection, metrics, user search).
 */
export function buildDatabaseReadCitation(params: {
  id?: string;
  sourceId: string;
  title: string;
  snippet: string;
  runId: string;
  stepId: string;
  toolCallId?: string;
  availability?: OpsAiCitationAvailability;
  timestamp?: number;
}): OpsAiCitation {
  const citation: OpsAiCitation = {
    id: params.id ?? `cite-${params.runId}-${params.stepId}-${params.sourceId}`,
    sourceId: params.sourceId,
    source: "database-read",
    availability: params.availability ?? "available",
    runId: params.runId,
    stepId: params.stepId,
    toolCallId: params.toolCallId,
    title: params.title,
    snippet: params.snippet,
    timestamp: params.timestamp ?? Date.now(),
  };

  const validation = validateOpsAiCitation(citation);
  if (!validation.valid) {
    throw new Error(`Invalid database-read citation created: ${validation.errors.join(", ")}`);
  }

  return citation;
}

/**
 * Builds a validated system-context OpsAiCitation (e.g. current page route, active entity).
 */
export function buildSystemContextCitation(params: {
  id?: string;
  sourceId: string;
  title: string;
  snippet: string;
  runId: string;
  stepId: string;
  toolCallId?: string;
  availability?: OpsAiCitationAvailability;
  timestamp?: number;
}): OpsAiCitation {
  const citation: OpsAiCitation = {
    id: params.id ?? `cite-${params.runId}-${params.stepId}-${params.sourceId}`,
    sourceId: params.sourceId,
    source: "system-context",
    availability: params.availability ?? "available",
    runId: params.runId,
    stepId: params.stepId,
    toolCallId: params.toolCallId,
    title: params.title,
    snippet: params.snippet,
    timestamp: params.timestamp ?? Date.now(),
  };

  const validation = validateOpsAiCitation(citation);
  if (!validation.valid) {
    throw new Error(`Invalid system-context citation created: ${validation.errors.join(", ")}`);
  }

  return citation;
}

/**
 * Direct builder and validator for generic OpsAiCitation.
 */
export function createOpsAiCitation(input: OpsAiCitation): OpsAiCitation {
  const validation = validateOpsAiCitation(input);
  if (!validation.valid) {
    throw new Error(`OpsAiCitation validation failed: ${validation.errors.join(", ")}`);
  }
  return input;
}

// ============================================================================
// 4. Availability Determination
// ============================================================================

export interface CitationAvailabilityEvaluationOptions {
  readonly isForged?: boolean;
  readonly existsInCatalog?: boolean;
  readonly sourceStatus?: "active" | "stale" | "archived" | string;
  readonly chunkStatus?: "active" | "stale" | string;
  readonly sourceVersion?: number;
  readonly chunkVersion?: number;
}

/**
 * Evaluates the availability state for a citation.
 * Returns:
 * - "invalid" if forged or failed integrity.
 * - "missing" if source record is missing in catalog.
 * - "stale" if source/chunk status is stale or version mismatch.
 * - "available" if active and version-matched.
 */
export function determineCitationAvailability(
  options: CitationAvailabilityEvaluationOptions
): OpsAiCitationAvailability {
  if (options.isForged) {
    return "invalid";
  }

  if (options.existsInCatalog === false) {
    return "missing";
  }

  if (
    options.sourceStatus === "stale" ||
    options.sourceStatus === "archived" ||
    options.chunkStatus === "stale"
  ) {
    return "stale";
  }

  if (
    options.sourceVersion !== undefined &&
    options.chunkVersion !== undefined &&
    options.sourceVersion !== options.chunkVersion
  ) {
    return "stale";
  }

  return "available";
}

// ============================================================================
// 5. Deterministic Deduplication
// ============================================================================

export interface DeduplicateCitationsOptions {
  readonly by?: "sourceId" | "id";
  readonly tieBreaker?: "highest-score" | "first-seen" | "longest-snippet";
}

/**
 * Deduplicates citations deterministically by sourceId or id.
 * Ties are broken deterministically by score, snippet length, or stable id comparison.
 */
export function deduplicateCitations(
  citations: OpsAiCitation[],
  options?: DeduplicateCitationsOptions
): OpsAiCitation[] {
  const keyField = options?.by ?? "sourceId";
  const tieBreaker = options?.tieBreaker ?? "highest-score";

  const groupMap = new Map<string, OpsAiCitation[]>();

  for (const citation of citations) {
    const key = keyField === "id" ? citation.id : citation.sourceId;
    const existing = groupMap.get(key) || [];
    existing.push(citation);
    groupMap.set(key, existing);
  }

  const deduplicated: OpsAiCitation[] = [];

  for (const group of groupMap.values()) {
    if (group.length === 1) {
      deduplicated.push(group[0]);
      continue;
    }

    // Select single representative per group based on tieBreaker
    const sorted = [...group].sort((a, b) => {
      if (tieBreaker === "highest-score") {
        const scoreA = a.score ?? 0;
        const scoreB = b.score ?? 0;
        if (Math.abs(scoreB - scoreA) > 1e-6) {
          return scoreB - scoreA;
        }
      } else if (tieBreaker === "longest-snippet") {
        const lenDiff = b.snippet.length - a.snippet.length;
        if (lenDiff !== 0) return lenDiff;
      }
      // Deterministic tie-breaker by stable citation id
      return a.id.localeCompare(b.id);
    });

    deduplicated.push(sorted[0]);
  }

  // Sort final array deterministically by score descending, then sourceId ascending
  return deduplicated.sort((a, b) => {
    const scoreA = a.score ?? 0;
    const scoreB = b.score ?? 0;
    if (Math.abs(scoreB - scoreA) > 1e-6) {
      return scoreB - scoreA;
    }
    return a.sourceId.localeCompare(b.sourceId);
  });
}

// ============================================================================
// 6. Inline Citation Marker Parser
// ============================================================================

export interface InlineCitationMarker {
  readonly raw: string;
  readonly markerType: "index" | "sourceId";
  readonly value: string;
  readonly numericIndex?: number;
  readonly sourceId?: string;
  readonly startIndex: number;
  readonly endIndex: number;
}

/**
 * Extracts inline citation markers from text.
 * Supports:
 * - Numeric 1-based index markers: `[1]`, `[2]`, `[1, 2]`
 * - Source ID markers: `[src-doc-users]`, `[src-schema-user]`
 */
export function extractInlineCitationMarkers(text: string): InlineCitationMarker[] {
  const markers: InlineCitationMarker[] = [];
  if (!text) return markers;

  // Mask code blocks (fenced and inline) and markdown links to prevent false positives
  // while preserving exact character index offsets for accurate position tracking.
  const masked = text
    .replace(/```[\s\S]*?```/g, (m) => " ".repeat(m.length))
    .replace(/`[^`\n]*?`/g, (m) => " ".repeat(m.length))
    .replace(/\[[^\]]*?\]\([^\)]*?\)/g, (m) => " ".repeat(m.length));

  // Match [1], [1, 2], [1, 2, 3] on masked text
  const numericListRegex = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  let match: RegExpExecArray | null;

  while ((match = numericListRegex.exec(masked)) !== null) {
    const fullMatch = match[0];
    const startIndex = match.index;
    const endIndex = startIndex + fullMatch.length;
    const indices = match[1].split(",").map((s) => parseInt(s.trim(), 10));

    for (const num of indices) {
      if (!Number.isNaN(num)) {
        markers.push({
          raw: `[${num}]`,
          markerType: "index",
          value: String(num),
          numericIndex: num,
          startIndex,
          endIndex,
        });
      }
    }
  }

  // Match [src-...] on masked text
  const sourceIdRegex = /\[(src-[a-zA-Z0-9_\-#\.\/]+)\]/g;
  while ((match = sourceIdRegex.exec(masked)) !== null) {
    markers.push({
      raw: match[0],
      markerType: "sourceId",
      value: match[1],
      sourceId: match[1],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return markers.sort((a, b) => a.startIndex - b.startIndex);
}

// ============================================================================
// 7. Inline Citation & Grounding Verifier
// ============================================================================

export interface VerifiedCitationMarker {
  readonly marker: string;
  readonly sourceId: string;
  readonly citation: OpsAiCitation;
  readonly index?: number;
}

export interface ForgedCitationMarker {
  readonly marker: string;
  readonly rawReference: string;
  readonly reason: "UNKNOWN_SOURCE_ID" | "OUT_OF_BOUNDS_INDEX" | "RUN_ID_MISMATCH" | "UNAVAILABLE_SOURCE" | string;
}

export interface InlineCitationVerificationResult {
  readonly isValid: boolean;
  readonly verifiedMarkers: VerifiedCitationMarker[];
  readonly forgedMarkers: ForgedCitationMarker[];
  readonly knownSourceIds: string[];
  readonly totalMarkers: number;
  readonly validCount: number;
  readonly forgedCount: number;
}

/**
 * Verifies inline citation markers in text against available citations in a run.
 * Employs verifyCitationBinding to ensure no phantom or forged references exist.
 */
export function verifyInlineCitations(options: {
  text: string;
  availableCitations: OpsAiCitation[];
  runId: string;
  knownStepIds?: Set<string>;
  knownToolCallIds?: Set<string>;
}): InlineCitationVerificationResult {
  const { text, availableCitations, runId } = options;
  const markers = extractInlineCitationMarkers(text);

  const knownSourceIds = new Set(availableCitations.map((c) => c.sourceId));
  const knownStepIds = options.knownStepIds ?? new Set(availableCitations.map((c) => c.stepId));
  const knownToolCallIds = options.knownToolCallIds ?? new Set(
    availableCitations.map((c) => c.toolCallId).filter((id): id is string => Boolean(id))
  );

  const verifiedMarkers: VerifiedCitationMarker[] = [];
  const forgedMarkers: ForgedCitationMarker[] = [];

  for (const m of markers) {
    let matchedCitation: OpsAiCitation | undefined;

    if (m.markerType === "index" && m.numericIndex !== undefined) {
      const idx = m.numericIndex - 1; // Convert 1-based index
      if (idx < 0 || idx >= availableCitations.length) {
        forgedMarkers.push({
          marker: m.raw,
          rawReference: m.value,
          reason: "OUT_OF_BOUNDS_INDEX",
        });
        continue;
      }
      matchedCitation = availableCitations[idx];
    } else if (m.markerType === "sourceId" && m.sourceId) {
      matchedCitation = availableCitations.find(
        (c) => c.sourceId === m.sourceId || c.id === m.sourceId
      );
      if (!matchedCitation) {
        forgedMarkers.push({
          marker: m.raw,
          rawReference: m.sourceId,
          reason: "UNKNOWN_SOURCE_ID",
        });
        continue;
      }
    }

    if (!matchedCitation) {
      forgedMarkers.push({
        marker: m.raw,
        rawReference: m.value,
        reason: "UNKNOWN_SOURCE_ID",
      });
      continue;
    }

    // Verify citation binding using CP1 invariant helper
    const bindingResult = verifyCitationBinding({
      citation: matchedCitation,
      validRunId: runId,
      knownSourceIds,
      knownStepIds,
      knownToolCallIds: matchedCitation.toolCallId ? knownToolCallIds : undefined,
    });

    if (!bindingResult.valid) {
      forgedMarkers.push({
        marker: m.raw,
        rawReference: m.value,
        reason: bindingResult.reasonCode ?? "UNKNOWN_BINDING_ERROR",
      });
      continue;
    }

    // Check availability
    if (matchedCitation.availability === "invalid" || matchedCitation.availability === "missing") {
      forgedMarkers.push({
        marker: m.raw,
        rawReference: m.value,
        reason: "UNAVAILABLE_SOURCE",
      });
      continue;
    }

    verifiedMarkers.push({
      marker: m.raw,
      sourceId: matchedCitation.sourceId,
      citation: matchedCitation,
      index: m.numericIndex,
    });
  }

  const isValid = forgedMarkers.length === 0;

  return {
    isValid,
    verifiedMarkers,
    forgedMarkers,
    knownSourceIds: Array.from(knownSourceIds),
    totalMarkers: markers.length,
    validCount: verifiedMarkers.length,
    forgedCount: forgedMarkers.length,
  };
}

/**
 * Sanitizes inline citation markers in text.
 * Mode 'strip': removes forged markers entirely.
 * Mode 'mark-invalid': replaces forged markers with [invalid: <ref>].
 */
export function sanitizeInlineCitationMarkers(
  text: string,
  verification: InlineCitationVerificationResult,
  mode: "strip" | "mark-invalid" = "mark-invalid"
): string {
  if (verification.forgedMarkers.length === 0) {
    return text;
  }

  let sanitized = text;
  for (const forged of verification.forgedMarkers) {
    const replacement = mode === "strip" ? "" : `[invalid: ${forged.rawReference}]`;
    sanitized = sanitized.split(forged.marker).join(replacement);
  }

  // Clean up any double spaces introduced by stripping
  return sanitized.replace(/ +/g, " ").trim();
}

// ============================================================================
// 8. Tool-Level Isolation & Grouping
// ============================================================================

/**
 * Filters citations by toolCallId to verify tool-level isolation.
 */
export function filterCitationsByTool(
  citations: OpsAiCitation[],
  toolCallId: string
): OpsAiCitation[] {
  return citations.filter((c) => c.toolCallId === toolCallId);
}

/**
 * Groups citations by their provenance source.
 */
export function groupCitationsByProvenance(
  citations: OpsAiCitation[]
): Record<OpsAiProvenanceSource, OpsAiCitation[]> {
  const result: Record<OpsAiProvenanceSource, OpsAiCitation[]> = {
    "semantic-rag": [],
    "live-tool": [],
    "database-read": [],
    "system-context": [],
  };

  for (const c of citations) {
    result[c.source].push(c);
  }

  return result;
}

// ============================================================================
// 9. Grounded Answer Evaluation Helper
// ============================================================================

export interface GroundedAnswerEvaluation {
  readonly isGrounded: boolean;
  readonly coverageRatio: number;
  readonly verifiedMarkersCount: number;
  readonly forgedMarkersCount: number;
  readonly details: string;
}

/**
 * Evaluates whether an assistant answer is grounded on verified citations.
 */
export function evaluateGroundedAnswer(
  text: string,
  citations: OpsAiCitation[],
  options?: {
    runId?: string;
    requireAtLeastOneCitation?: boolean;
  }
): GroundedAnswerEvaluation {
  const runId = options?.runId ?? citations[0]?.runId ?? "run-eval";
  const verification = verifyInlineCitations({
    text,
    availableCitations: citations,
    runId,
  });

  const total = verification.totalMarkers;
  const verified = verification.validCount;
  const forged = verification.forgedCount;

  if (total === 0) {
    if (options?.requireAtLeastOneCitation && citations.length > 0) {
      return {
        isGrounded: false,
        coverageRatio: 0,
        verifiedMarkersCount: 0,
        forgedMarkersCount: 0,
        details: "Teks tidak menyertakan inline citation marker padahal terdapat sumber sitasi yang tersedia.",
      };
    }
    return {
      isGrounded: true,
      coverageRatio: 1,
      verifiedMarkersCount: 0,
      forgedMarkersCount: 0,
      details: "Jawaban langsung tanpa sitasi eksternal.",
    };
  }

  const coverageRatio = verified / total;
  const isGrounded = verification.isValid && coverageRatio === 1;

  return {
    isGrounded,
    coverageRatio,
    verifiedMarkersCount: verified,
    forgedMarkersCount: forged,
    details: isGrounded
      ? `Seluruh ${verified} inline citation marker terverifikasi pada run '${runId}'.`
      : `Ditemukan ${forged} citation marker yang tidak terverifikasi atau palsu (forged).`,
  };
}
