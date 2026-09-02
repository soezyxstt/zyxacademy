import { createHash } from "node:crypto";
import {
  CANONICAL_VECTOR_PROFILE,
  parseVersionedVectorId,
  type CanonicalVectorProvider,
  type CanonicalVectorRecord,
} from "@/lib/vectorize/contracts";
import type { CanonicalContentV2EmbeddingAdapter } from "@/lib/vectorize/embedding";
import {
  ADMIN_ACCESS_CLASS,
  ADMIN_DOCUMENT_ENTITY_TYPE,
  ADMIN_OPS_KNOWLEDGE_NAMESPACE,
  type AdminKnowledgeChunk,
  type AdminKnowledgeManifest,
  type AdminKnowledgeSourceRecord,
  type AdminKnowledgeSyncOperation,
  type AdminKnowledgeSyncPlan,
  type AdminKnowledgeSyncResult,
} from "./admin-knowledge-contracts";
import {
  loadAllCuratedAdminKnowledgeSources,
  type CuratedSourceContent,
} from "./admin-knowledge-sources";
import {
  chunkAdminKnowledgeSource,
} from "./admin-knowledge-chunker";
import {
  listAllKnowledgeSources,
  listChunksForSource,
  markChunksStale,
  markSourceStale,
  upsertKnowledgeChunks,
  upsertKnowledgeSource,
} from "./admin-knowledge-store";

/**
 * Pluggable Catalog Store interface for hermetic testing and database decoupling.
 */
export interface AdminKnowledgeCatalogStore {
  upsertSource: (source: AdminKnowledgeSourceRecord) => Promise<void>;
  upsertChunks: (chunks: AdminKnowledgeChunk[]) => Promise<void>;
  markSourceStale: (sourceId: string) => Promise<void>;
  markChunksStale: (chunkIds: string[]) => Promise<void>;
  listSources: () => Promise<AdminKnowledgeSourceRecord[]>;
  listChunksForSource: (sourceId: string) => Promise<AdminKnowledgeChunk[]>;
}

/**
 * Computes a deterministic synchronization plan comparing current catalog state
 * against the target curated manifests.
 */
export function computeAdminKnowledgeSyncPlan(
  existingSources: AdminKnowledgeSourceRecord[],
  existingChunks: AdminKnowledgeChunk[],
  targetManifests: AdminKnowledgeManifest[]
): AdminKnowledgeSyncPlan {
  const sourcesToInsert: string[] = [];
  const sourcesToUpdate: string[] = [];
  const sourcesToRetain: string[] = [];
  const sourcesToArchive: string[] = [];
  const chunksToUpsert: AdminKnowledgeChunk[] = [];
  const chunkIdsToDelete: string[] = [];
  const chunkIdsToRetain: string[] = [];
  const operations: AdminKnowledgeSyncOperation[] = [];

  const existingSourceMap = new Map<string, AdminKnowledgeSourceRecord>(
    existingSources.map((s) => [s.id, s])
  );
  const existingChunkMap = new Map<string, AdminKnowledgeChunk>(
    existingChunks.map((c) => [c.id, c])
  );
  const targetSourceIds = new Set<string>(targetManifests.map((m) => m.sourceId));

  // 1. Process target manifests
  for (const manifest of targetManifests) {
    const existingSource = existingSourceMap.get(manifest.sourceId);

    if (!existingSource) {
      // New source
      sourcesToInsert.push(manifest.sourceId);
      for (const chunk of manifest.chunks) {
        chunksToUpsert.push(chunk);
        operations.push({
          action: "upsert",
          sourceId: manifest.sourceId,
          chunkId: chunk.id,
          vectorId: chunk.vectorId,
          reason: "New source chunk",
        });
      }
    } else if (
      existingSource.contentHash === manifest.contentHash &&
      existingSource.manifestHash === manifest.manifestHash &&
      existingSource.status === "active"
    ) {
      // Unchanged source
      sourcesToRetain.push(manifest.sourceId);
      for (const chunk of manifest.chunks) {
        chunkIdsToRetain.push(chunk.id);
        operations.push({
          action: "retain",
          sourceId: manifest.sourceId,
          chunkId: chunk.id,
          vectorId: chunk.vectorId,
          reason: "Identical content and manifest hash",
        });
      }

      // Check for orphan chunks in existing DB that are not in new manifest
      const currentChunkIds = new Set(manifest.chunks.map((c) => c.id));
      for (const existingChunk of existingChunks) {
        if (
          existingChunk.sourceId === manifest.sourceId &&
          !currentChunkIds.has(existingChunk.id)
        ) {
          chunkIdsToDelete.push(existingChunk.id);
          operations.push({
            action: "delete",
            sourceId: manifest.sourceId,
            chunkId: existingChunk.id,
            vectorId: existingChunk.vectorId,
            reason: "Orphaned chunk removed from source",
          });
        }
      }
    } else {
      // Modified source
      sourcesToUpdate.push(manifest.sourceId);
      const manifestChunkMap = new Map(manifest.chunks.map((c) => [c.id, c]));

      for (const chunk of manifest.chunks) {
        const existingChunk = existingChunkMap.get(chunk.id);
        if (
          !existingChunk ||
          existingChunk.contentHash !== chunk.contentHash ||
          existingChunk.status !== "active"
        ) {
          chunksToUpsert.push(chunk);
          operations.push({
            action: "upsert",
            sourceId: manifest.sourceId,
            chunkId: chunk.id,
            vectorId: chunk.vectorId,
            reason: "Modified or new chunk in updated source",
          });
        } else {
          chunkIdsToRetain.push(chunk.id);
          operations.push({
            action: "retain",
            sourceId: manifest.sourceId,
            chunkId: chunk.id,
            vectorId: chunk.vectorId,
            reason: "Unchanged chunk in updated source",
          });
        }
      }

      // Existing chunks no longer present in target manifest
      for (const existingChunk of existingChunks) {
        if (
          existingChunk.sourceId === manifest.sourceId &&
          !manifestChunkMap.has(existingChunk.id)
        ) {
          chunkIdsToDelete.push(existingChunk.id);
          operations.push({
            action: "delete",
            sourceId: manifest.sourceId,
            chunkId: existingChunk.id,
            vectorId: existingChunk.vectorId,
            reason: "Obsolete chunk from previous source version",
          });
        }
      }
    }
  }

  // 2. Identify deleted / removed sources
  for (const existingSource of existingSources) {
    if (!targetSourceIds.has(existingSource.id) && existingSource.status === "active") {
      sourcesToArchive.push(existingSource.id);
      for (const existingChunk of existingChunks) {
        if (existingChunk.sourceId === existingSource.id) {
          chunkIdsToDelete.push(existingChunk.id);
          operations.push({
            action: "delete",
            sourceId: existingSource.id,
            chunkId: existingChunk.id,
            vectorId: existingChunk.vectorId,
            reason: "Source removed from curated registry",
          });
        }
      }
    }
  }

  const sortedOps = [...operations].sort((a, b) =>
    `${a.action}:${a.vectorId}`.localeCompare(`${b.action}:${b.vectorId}`)
  );
  const planDigest = sortedOps
    .map((op) => `${op.action}:${op.sourceId}:${op.chunkId}:${op.vectorId}`)
    .join("\n");
  const manifestHash = createHash("sha256").update(planDigest, "utf-8").digest("hex");

  return {
    sourcesToInsert,
    sourcesToUpdate,
    sourcesToRetain,
    sourcesToArchive,
    chunksToUpsert,
    chunkIdsToDelete,
    chunkIdsToRetain,
    manifestHash,
    operations: sortedOps,
  };
}

export interface ExecuteSyncOptions {
  readonly baseDir?: string;
  readonly dryRun?: boolean;
  readonly vectorProvider?: CanonicalVectorProvider;
  readonly embeddingAdapter?: CanonicalContentV2EmbeddingAdapter;
  readonly customSources?: CuratedSourceContent[];
  readonly existingSources?: AdminKnowledgeSourceRecord[];
  readonly existingChunks?: AdminKnowledgeChunk[];
  readonly catalogStore?: AdminKnowledgeCatalogStore;
}

/**
 * Executes an Admin Ops Knowledge synchronization run.
 */
export async function executeAdminKnowledgeSync(
  options: ExecuteSyncOptions = {}
): Promise<AdminKnowledgeSyncResult> {
  const baseDir = options.baseDir ?? process.cwd();
  const dryRun = Boolean(options.dryRun);
  const store = options.catalogStore;

  // 1. Load curated sources
  const sources =
    options.customSources ?? (await loadAllCuratedAdminKnowledgeSources(baseDir));

  // 2. Chunk sources into manifests
  const manifests = sources.map((source) => chunkAdminKnowledgeSource(source));

  // 3. Fetch existing catalog records
  let existingSources: AdminKnowledgeSourceRecord[];
  let existingChunks: AdminKnowledgeChunk[];

  if (options.existingSources && options.existingChunks) {
    existingSources = options.existingSources;
    existingChunks = options.existingChunks;
  } else if (store) {
    existingSources = await store.listSources();
    const allChunks: AdminKnowledgeChunk[] = [];
    for (const src of existingSources) {
      const srcChunks = await store.listChunksForSource(src.id);
      allChunks.push(...srcChunks);
    }
    existingChunks = allChunks;
  } else {
    try {
      existingSources = await listAllKnowledgeSources();
      const allChunks: AdminKnowledgeChunk[] = [];
      for (const src of existingSources) {
        const srcChunks = await listChunksForSource(src.id);
        allChunks.push(...srcChunks);
      }
      existingChunks = allChunks;
    } catch {
      existingSources = [];
      existingChunks = [];
    }
  }

  // 4. Compute synchronization plan
  const plan = computeAdminKnowledgeSyncPlan(existingSources, existingChunks, manifests);

  // 5. Apply database and vector updates if not dryRun
  if (!dryRun) {
    const sourceMap = new Map(sources.map((s) => [s.id, s]));

    // Update sources in catalog
    for (const manifest of manifests) {
      const source = sourceMap.get(manifest.sourceId);
      if (source) {
        const record: AdminKnowledgeSourceRecord = {
          id: manifest.sourceId,
          sourcePath: manifest.sourcePath,
          sourceType: source.sourceType,
          title: source.title,
          version: manifest.version,
          contentHash: manifest.contentHash,
          manifestHash: manifest.manifestHash,
          chunkCount: manifest.chunkCount,
          status: "active",
        };
        if (store) {
          await store.upsertSource(record);
        } else {
          await upsertKnowledgeSource(record);
        }
      }
    }

    // Mark archived sources as stale
    for (const sourceId of plan.sourcesToArchive) {
      if (store) {
        await store.markSourceStale(sourceId);
      } else {
        await markSourceStale(sourceId);
      }
    }

    // Upsert chunks in catalog
    if (plan.chunksToUpsert.length > 0) {
      if (store) {
        await store.upsertChunks(plan.chunksToUpsert);
      } else {
        await upsertKnowledgeChunks(plan.chunksToUpsert);
      }
    }

    // Mark deleted chunks as stale in catalog
    if (plan.chunkIdsToDelete.length > 0) {
      if (store) {
        await store.markChunksStale(plan.chunkIdsToDelete);
      } else {
        await markChunksStale(plan.chunkIdsToDelete);
      }
    }

    // Vector operations
    if (options.vectorProvider && options.embeddingAdapter) {
      // 5a. Upsert vectors
      if (plan.chunksToUpsert.length > 0) {
        const vectorRecords: CanonicalVectorRecord[] = [];
        for (const chunk of plan.chunksToUpsert) {
          const values = await options.embeddingAdapter.embedDocument(
            chunk.locator,
            chunk.content
          );
          const parsedVectorId = parseVersionedVectorId(chunk.vectorId);
          vectorRecords.push({
            id: chunk.vectorId,
            values,
            metadata: {
              namespace: ADMIN_OPS_KNOWLEDGE_NAMESPACE,
              entityType: ADMIN_DOCUMENT_ENTITY_TYPE,
              entityId: parsedVectorId.entityId,
              version: chunk.version,
              status: "active",
              accessClass: ADMIN_ACCESS_CLASS,
              language: "id",
              profileId: CANONICAL_VECTOR_PROFILE.id,
              contentHash: chunk.contentHash,
            },
          });
        }
        await options.vectorProvider.upsert({
          profileId: CANONICAL_VECTOR_PROFILE.id,
          vectors: vectorRecords,
        });
      }

      // 5b. Delete vectors
      if (plan.chunkIdsToDelete.length > 0) {
        await options.vectorProvider.delete({
          profileId: CANONICAL_VECTOR_PROFILE.id,
          ids: plan.chunkIdsToDelete,
        });
      }
    }
  }

  const insertedSourcesCount = plan.sourcesToInsert.length;
  const updatedSourcesCount = plan.sourcesToUpdate.length;
  const unchangedSourcesCount = plan.sourcesToRetain.length;
  const deletedSourcesCount = plan.sourcesToArchive.length;
  const totalSourcesCount = manifests.length;

  const upsertedChunksCount = plan.chunksToUpsert.length;
  const deletedChunksCount = plan.chunkIdsToDelete.length;
  const unchangedChunksCount = plan.chunkIdsToRetain.length;
  const totalChunksCount = manifests.reduce((sum, m) => sum + m.chunkCount, 0);

  return {
    sources: {
      total: totalSourcesCount,
      inserted: insertedSourcesCount,
      updated: updatedSourcesCount,
      unchanged: unchangedSourcesCount,
      deleted: deletedSourcesCount,
    },
    chunks: {
      total: totalChunksCount,
      upserted: upsertedChunksCount,
      deleted: deletedChunksCount,
      unchanged: unchangedChunksCount,
      stale: deletedChunksCount,
    },
    manifestHash: plan.manifestHash,
    operations: plan.operations,
  };
}
