import { CANONICAL_NAMESPACE_BY_LEGACY } from "@/lib/namespaces";
import {
  CANONICAL_NAMESPACES,
  CANONICAL_VECTOR_PROFILE,
  type CanonicalMetadataFilter,
  type CanonicalNamespace,
} from "@/lib/vectorize/contracts";
import { getCanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/runtime";
import { vectorizeCanonicalQuery } from "@/lib/vectorize-client";

export { VECTOR_NAMESPACES } from "@/lib/namespaces";

export function isCanonicalVectorizeOnlyEnabled(): boolean {
  return true;
}

export function vectorStoreRoute(): "canonical-v2" {
  return "canonical-v2";
}

export interface VectorStoreMatch {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface VectorStoreQueryOptions {
  topK?: number;
  filter?: Record<string, unknown>;
}

export interface VectorStore {
  query(
    courseNamespace: string,
    queryText: string,
    options?: VectorStoreQueryOptions,
  ): Promise<VectorStoreMatch[]>;
}

function parseCourseAndNamespace(value: string): { courseId: string; namespace: CanonicalNamespace } {
  for (const namespace of CANONICAL_NAMESPACES) {
    const suffix = `_${namespace}`;
    if (value.endsWith(suffix)) {
      const courseId = value.slice(0, -suffix.length);
      if (courseId) return { courseId, namespace };
    }
  }
  for (const [legacyNamespace, canonicalNamespace] of Object.entries(CANONICAL_NAMESPACE_BY_LEGACY)) {
    const suffix = `_${legacyNamespace}`;
    if (value.endsWith(suffix)) {
      const courseId = value.slice(0, -suffix.length);
      if (courseId) return { courseId, namespace: canonicalNamespace };
    }
  }
  throw new Error(`canonical Vectorize requires a known namespace, received ${value}`);
}

function canonicalFilter(options: VectorStoreQueryOptions, courseId: string): CanonicalMetadataFilter {
  const filter: CanonicalMetadataFilter = { courseId: { $eq: courseId } };
  if (typeof options.filter?.chapterId === "string") {
    filter.chapterId = { $eq: options.filter.chapterId };
  }
  if (typeof options.filter?.status === "string") {
    filter.status = { $eq: options.filter.status };
  }
  return filter;
}

export class CanonicalVectorizeStore implements VectorStore {
  async query(
    courseNamespace: string,
    queryText: string,
    options: VectorStoreQueryOptions = {},
  ): Promise<VectorStoreMatch[]> {
    const { courseId, namespace } = parseCourseAndNamespace(courseNamespace);
    const adapter = await getCanonicalContentV2EmbeddingAdapter();
    const vector = await adapter.embedQuery(queryText);
    const result = await vectorizeCanonicalQuery({
      profileId: CANONICAL_VECTOR_PROFILE.id,
      vector,
      topK: options.topK ?? 10,
      namespace,
      filter: canonicalFilter(options, courseId),
    });
    return result.matches.map((match) => ({
      id: match.id,
      score: match.score,
      metadata: { ...match.metadata },
    }));
  }
}

function createVectorStore(): VectorStore {
  return new CanonicalVectorizeStore();
}

export const vectorStore: VectorStore = createVectorStore();
