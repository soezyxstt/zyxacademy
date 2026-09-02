import {
  CANONICAL_VECTOR_PROFILE,
  type CanonicalVectorProvider,
} from "@/lib/vectorize/contracts";
import type { CanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/embedding";
import {
  ADMIN_ACCESS_CLASS,
  ADMIN_KNOWLEDGE_BOUNDS,
  ADMIN_OPS_KNOWLEDGE_NAMESPACE,
  AdminKnowledgeAuthError,
  AdminKnowledgeRetrievalError,
  type AdminKnowledgeChunk,
  type AdminKnowledgeRetrievalResult,
  type AdminKnowledgeSearchResult,
  type AdminKnowledgeSourceRecord,
} from "./admin-knowledge-contracts";
import {
  getChunksByVectorIds,
  getKnowledgeSourceById,
  listActiveKnowledgeSources,
} from "./admin-knowledge-store";

export interface RetrieveAdminKnowledgeOptions {
  readonly query: string;
  readonly callerRole: string;
  readonly limit?: number;
  readonly vectorProvider: CanonicalVectorProvider;
  readonly embeddingAdapter: CanonicalContentV2EmbeddingAdapter;
  readonly mockHydrationCatalog?: {
    sources: AdminKnowledgeSourceRecord[];
    chunks: AdminKnowledgeChunk[];
  };
}

/**
 * Extracts normalized search terms from a query string.
 */
function extractQueryTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/[^a-z0-9_\-\s]/g, " ")
        .split(/\s+/)
        .filter((word) => word.length >= 3)
    )
  );
}

/**
 * Computes deterministic heading and path boost for a retrieved chunk.
 */
function computeDeterministicBoost(
  query: string,
  chunk: AdminKnowledgeChunk,
  sourcePath: string
): number {
  let boost = 0;
  const rawQuery = query.toLowerCase().trim();
  const queryTerms = extractQueryTerms(query);
  const headings = chunk.headingHierarchy.join(" ").toLowerCase();
  const lowerPath = sourcePath.toLowerCase();

  // 1. Exact phrase match in heading
  if (headings.includes(rawQuery)) {
    boost += ADMIN_KNOWLEDGE_BOUNDS.headingBoost;
  }

  // 2. Term matches in headings
  let termBoostCount = 0;
  for (const term of queryTerms) {
    if (headings.includes(term)) {
      boost += ADMIN_KNOWLEDGE_BOUNDS.headingTermBoost;
      termBoostCount += 1;
      if (termBoostCount >= 2) break; // cap at 2 terms
    }
  }

  // 3. Path match
  for (const term of queryTerms) {
    if (lowerPath.includes(term)) {
      boost += ADMIN_KNOWLEDGE_BOUNDS.pathBoost;
      break;
    }
  }

  return Math.min(boost, ADMIN_KNOWLEDGE_BOUNDS.maxBoostTotal);
}

/**
 * Performs semantic Admin Ops Knowledge retrieval.
 *
 * Enforces admin authorization, query-purpose embedding, top-12 Vectorize candidate
 * retrieval in the isolated admin_ops_knowledge namespace, active/version-matched
 * database hydration, deterministic reranking, and explicit error handling without
 * silent lexical fallbacks.
 */
export async function retrieveAdminOpsKnowledge(
  options: RetrieveAdminKnowledgeOptions
): Promise<AdminKnowledgeRetrievalResult> {
  const startTime = Date.now();
  const { query, callerRole, vectorProvider, embeddingAdapter } = options;
  const limit = Math.min(
    options.limit ?? ADMIN_KNOWLEDGE_BOUNDS.retrievalMaxFinalSources,
    ADMIN_KNOWLEDGE_BOUNDS.retrievalMaxFinalSources
  );

  // 1. Authorize admin access class
  if (callerRole !== "admin" && callerRole !== "superadmin") {
    throw new AdminKnowledgeAuthError(
      `Admin Ops Knowledge retrieval requires admin access class. Caller role '${callerRole}' is forbidden.`,
      { callerRole }
    );
  }

  if (!query || query.trim().length === 0) {
    return {
      query: "",
      candidateCount: 0,
      results: [],
      executionMs: Date.now() - startTime,
    };
  }

  // 2. Embed query using query purpose
  let queryVector: number[];
  try {
    queryVector = await embeddingAdapter.embedQuery(query.trim());
  } catch (err) {
    throw new AdminKnowledgeRetrievalError(
      "QUERY_EMBEDDING_FAILED",
      `Failed to compute query embedding for Admin Ops Knowledge: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 3. Query Vectorize in isolated admin_ops_knowledge namespace for exactly 12 candidates
  let queryResult;
  try {
    queryResult = await vectorProvider.query({
      profileId: CANONICAL_VECTOR_PROFILE.id,
      namespace: ADMIN_OPS_KNOWLEDGE_NAMESPACE,
      vector: queryVector,
      topK: ADMIN_KNOWLEDGE_BOUNDS.retrievalCandidateCount,
      filter: {
        accessClass: ADMIN_ACCESS_CLASS,
        status: "active",
      },
    });
  } catch (err) {
    throw new AdminKnowledgeRetrievalError(
      "VECTORIZE_QUERY_FAILED",
      `Vectorize query failed on namespace '${ADMIN_OPS_KNOWLEDGE_NAMESPACE}': ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const candidateMatches = queryResult.matches;
  if (!candidateMatches || candidateMatches.length === 0) {
    return {
      query,
      candidateCount: 0,
      results: [],
      executionMs: Date.now() - startTime,
    };
  }

  // 4. Hydrate active, matching-version chunks from database catalog
  const candidateVectorIds = candidateMatches.map((m) => m.id);
  const matchScoreMap = new Map<string, number>(
    candidateMatches.map((m) => [m.id, m.score])
  );

  let hydratedChunks: AdminKnowledgeChunk[];
  const sourceCache = new Map<string, AdminKnowledgeSourceRecord | null>();

  if (options.mockHydrationCatalog) {
    const chunkMap = new Map(
      options.mockHydrationCatalog.chunks.map((c) => [c.vectorId, c])
    );
    hydratedChunks = candidateVectorIds
      .map((id) => chunkMap.get(id))
      .filter((c): c is AdminKnowledgeChunk => Boolean(c));
    for (const src of options.mockHydrationCatalog.sources) {
      sourceCache.set(src.id, src);
    }
  } else {
    try {
      hydratedChunks = await getChunksByVectorIds(candidateVectorIds);
      const uniqueSourceIds = Array.from(new Set(hydratedChunks.map((c) => c.sourceId)));
      for (const sourceId of uniqueSourceIds) {
        const source = await getKnowledgeSourceById(sourceId);
        sourceCache.set(sourceId, source);
      }
    } catch (err) {
      throw new AdminKnowledgeRetrievalError(
        "HYDRATION_FAILED",
        `Failed to hydrate chunk catalog from database: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 5. Filter active, matching-version chunks and apply deterministic boost
  interface ScoredCandidate {
    chunk: AdminKnowledgeChunk;
    source: AdminKnowledgeSourceRecord;
    rawScore: number;
    boost: number;
    finalScore: number;
  }

  const validCandidates: ScoredCandidate[] = [];

  for (const chunk of hydratedChunks) {
    if (chunk.status !== "active") continue;

    const source = sourceCache.get(chunk.sourceId);
    if (!source || source.status !== "active" || source.version !== chunk.version) {
      continue;
    }

    const rawScore = matchScoreMap.get(chunk.vectorId) ?? 0;
    const boost = computeDeterministicBoost(query, chunk, source.sourcePath);
    const finalScore = rawScore + boost;

    validCandidates.push({
      chunk,
      source,
      rawScore,
      boost,
      finalScore,
    });
  }

  // 6. Deterministic Sort & Diversity-aware Deduplication
  validCandidates.sort((left, right) => {
    if (Math.abs(right.finalScore - left.finalScore) > 1e-6) {
      return right.finalScore - left.finalScore;
    }
    // Tie-break deterministically by stable chunk ID
    return left.chunk.id.localeCompare(right.chunk.id);
  });

  const finalResults: AdminKnowledgeSearchResult[] = [];
  const sourceCountMap = new Map<string, number>();

  for (const candidate of validCandidates) {
    const currentCount = sourceCountMap.get(candidate.source.id) ?? 0;
    // Allow at most 2 chunks per source document unless total results are sparse
    if (currentCount >= 2 && validCandidates.length > limit) {
      continue;
    }

    sourceCountMap.set(candidate.source.id, currentCount + 1);

    const sectionTitle = candidate.chunk.headingHierarchy.length > 0
      ? candidate.chunk.headingHierarchy.join(" > ")
      : undefined;

    const snippetText =
      candidate.chunk.content.length > ADMIN_KNOWLEDGE_BOUNDS.maxSnippetLength
        ? `${candidate.chunk.content.slice(0, ADMIN_KNOWLEDGE_BOUNDS.maxSnippetLength)}...`
        : candidate.chunk.content;

    finalResults.push({
      id: candidate.chunk.id,
      sourceId: candidate.source.id,
      source: "semantic-rag",
      availability: "available",
      title: candidate.source.title,
      filePath: candidate.source.sourcePath,
      section: sectionTitle,
      snippet: snippetText,
      score: Math.round(candidate.finalScore * 1000) / 1000,
      rawScore: Math.round(candidate.rawScore * 1000) / 1000,
      boost: Math.round(candidate.boost * 1000) / 1000,
      locator: candidate.chunk.locator,
      version: candidate.chunk.version,
    });

    if (finalResults.length >= limit) {
      break;
    }
  }

  return {
    query,
    candidateCount: candidateMatches.length,
    results: finalResults,
    executionMs: Date.now() - startTime,
  };
}
