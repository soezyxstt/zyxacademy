/**
 * Search service providing embedding generation and Vectorize search operations.
 */

import { getCanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/runtime";
import type { SiteSearchMatch } from "@/lib/search/contracts";

export interface SearchVectorInput {
  id: string;
  values: number[];
  metadata?: Record<string, string | number | boolean>;
}

export interface SearchQueryParams {
  vector: number[];
  topK?: number;
  min_role?: number;
  course_id?: string;
  entity_type?: string;
  filter?: Record<string, unknown>;
}

export interface SearchQueryResult {
  matches: SiteSearchMatch[];
  count: number;
}

export interface SearchMutationResult {
  ok: boolean;
  count: number;
  mutationId?: string;
}

function getWorkerConfig() {
  const baseUrl = process.env.VECTORIZE_WORKER_URL;
  const sharedSecret = process.env.VECTORIZE_SHARED_SECRET;
  return {
    baseUrl: baseUrl ? baseUrl.replace(/\/$/, "") : undefined,
    sharedSecret,
  };
}

/**
 * Embed search query using Gemini embedding adapter (768 dimensions, purpose: "query").
 */
export async function embedSearchQuery(query: string): Promise<number[]> {
  const adapter = await getCanonicalContentV2EmbeddingAdapter();
  return adapter.embedQuery(query.trim());
}

/**
 * Embed document using Gemini embedding adapter (768 dimensions, purpose: "document").
 */
export async function embedSearchDocument(title: string, content: string): Promise<number[]> {
  const adapter = await getCanonicalContentV2EmbeddingAdapter();
  return adapter.embedDocument(title.trim(), content.trim());
}

async function postSearchWorker<T>(path: string, body: unknown): Promise<T> {
  const { baseUrl, sharedSecret } = getWorkerConfig();
  if (!baseUrl || !sharedSecret) {
    throw new Error("VECTORIZE_WORKER_URL and VECTORIZE_SHARED_SECRET must be configured for Vectorize search");
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sharedSecret}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vectorize search worker ${path} returned HTTP ${response.status}: ${errorText}`);
  }

  return (await response.json()) as T;
}

/**
 * Upserts vectors to the VECTORIZE_SEARCH index via vector-api worker.
 */
export async function upsertSearchVectors(vectors: SearchVectorInput[]): Promise<SearchMutationResult> {
  if (vectors.length === 0) {
    return { ok: true, count: 0 };
  }

  try {
    return await postSearchWorker<SearchMutationResult>("/v2/search/upsert", { vectors });
  } catch (error) {
    console.error("[search-service] Failed to upsert search vectors:", error);
    throw error;
  }
}

/**
 * Queries the VECTORIZE_SEARCH index via vector-api worker with metadata filters.
 */
export async function querySearchVectors(params: SearchQueryParams): Promise<SearchQueryResult> {
  try {
    const result = await postSearchWorker<{
      matches: Array<{ id: string; score: number; metadata?: Record<string, unknown> }>;
      count: number;
    }>("/v2/search/query", params);

    return {
      matches: (result.matches || []).map((m) => ({
        id: m.id,
        score: m.score,
        metadata: (m.metadata || {}) as SiteSearchMatch["metadata"],
      })),
      count: result.count ?? (result.matches?.length || 0),
    };
  } catch (error) {
    console.error("[search-service] Failed to query search vectors, falling back to empty:", error);
    return { matches: [], count: 0 };
  }
}

/**
 * Deletes vectors by IDs from the VECTORIZE_SEARCH index via vector-api worker.
 */
export async function deleteSearchVectors(ids: string[]): Promise<SearchMutationResult> {
  if (ids.length === 0) {
    return { ok: true, count: 0 };
  }

  try {
    return await postSearchWorker<SearchMutationResult>("/v2/search/delete", { ids });
  } catch (error) {
    console.error("[search-service] Failed to delete search vectors:", error);
    throw error;
  }
}
