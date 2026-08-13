import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { knowledgeObjects } from "@/db/schema";
import { CANONICAL_NAMESPACE_BY_LEGACY } from "@/lib/namespaces";
import {
  CANONICAL_NAMESPACES,
  CANONICAL_VECTOR_PROFILE,
  createVersionedVectorId,
  type CanonicalMetadataFilter,
  type CanonicalNamespace,
} from "@/lib/vectorize/contracts";
import { getCanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/runtime";
import { vectorizeCanonicalQuery } from "@/lib/vectorize-client";

export { VECTOR_NAMESPACES } from "@/lib/namespaces";

export function isCanonicalVectorizeOnlyEnabled(): boolean {
  return process.env.FEATURE_VECTORIZE_ONLY_V1 === "1";
}

export function vectorStoreRoute(flagValue = process.env.FEATURE_VECTORIZE_ONLY_V1): "canonical-v2" | "legacy-rollback" {
  return flagValue === "1" ? "canonical-v2" : "legacy-rollback";
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

/**
 * Rollback compatibility is deliberately read-only. It serves deterministic
 * local tests and historical fallback while the canonical provider is off;
 * it never creates or updates vectors.
 */
class ReadOnlyCompatibilityStore implements VectorStore {
  async query(
    courseNamespace: string,
    _queryText: string,
    options: VectorStoreQueryOptions = {},
  ): Promise<VectorStoreMatch[]> {
    if (process.env.MOCK_GEMINI !== "true") return [];
    const legacySuffix = Object.keys(CANONICAL_NAMESPACE_BY_LEGACY)
      .find((suffix) => courseNamespace.endsWith(`_${suffix}`));
    const courseId = legacySuffix
      ? courseNamespace.slice(0, -(`_${legacySuffix}`).length)
      : courseNamespace;
    const rows = await db
      .select()
      .from(knowledgeObjects)
      .where(and(eq(knowledgeObjects.courseId, courseId), eq(knowledgeObjects.status, "active")))
      .limit(options.topK ?? 10);
    return rows.map((row, index) => ({
      id: row.id,
      score: 0.95 - index * 0.05,
      metadata: {
        courseId: row.courseId,
        chapterId: row.chapterId,
        conceptId: row.conceptId,
        entityType: "idea",
        contentHash: createHash("sha256").update(row.content, "utf8").digest("hex"),
        profileId: CANONICAL_VECTOR_PROFILE.id,
        vectorId: createVersionedVectorId("idea", row.id, 1),
      },
    }));
  }
}

function createVectorStore(): VectorStore {
  return isCanonicalVectorizeOnlyEnabled()
    ? new CanonicalVectorizeStore()
    : new ReadOnlyCompatibilityStore();
}

export const vectorStore: VectorStore = createVectorStore();
