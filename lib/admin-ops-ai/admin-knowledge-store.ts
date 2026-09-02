import { db as defaultDb } from "@/db";
import {
  adminOpsKnowledgeSources,
  adminOpsKnowledgeChunks,
  adminOpsKnowledgeSyncQueue,
} from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import type {
  AdminKnowledgeChunk,
  AdminKnowledgeSourceRecord,
} from "./admin-knowledge-contracts";

type DatabaseContext = typeof defaultDb;

/**
 * Database storage and catalog operations for Admin Ops Knowledge.
 */

export async function upsertKnowledgeSource(
  source: AdminKnowledgeSourceRecord,
  db: DatabaseContext = defaultDb
): Promise<void> {
  const existing = await db
    .select()
    .from(adminOpsKnowledgeSources)
    .where(eq(adminOpsKnowledgeSources.id, source.id))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(adminOpsKnowledgeSources)
      .set({
        sourcePath: source.sourcePath,
        sourceType: source.sourceType,
        title: source.title,
        version: source.version,
        contentHash: source.contentHash,
        manifestHash: source.manifestHash,
        chunkCount: source.chunkCount,
        status: source.status,
        metadata: source.metadata ? JSON.stringify(source.metadata) : null,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(adminOpsKnowledgeSources.id, source.id));
  } else {
    await db.insert(adminOpsKnowledgeSources).values({
      id: source.id,
      sourcePath: source.sourcePath,
      sourceType: source.sourceType,
      title: source.title,
      version: source.version,
      contentHash: source.contentHash,
      manifestHash: source.manifestHash,
      chunkCount: source.chunkCount,
      status: source.status,
      metadata: source.metadata ? JSON.stringify(source.metadata) : null,
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}

export async function upsertKnowledgeChunks(
  chunks: AdminKnowledgeChunk[],
  db: DatabaseContext = defaultDb
): Promise<void> {
  if (chunks.length === 0) return;

  for (const chunk of chunks) {
    const existing = await db
      .select()
      .from(adminOpsKnowledgeChunks)
      .where(eq(adminOpsKnowledgeChunks.id, chunk.id))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(adminOpsKnowledgeChunks)
        .set({
          sourceId: chunk.sourceId,
          chunkIndex: chunk.chunkIndex,
          locator: chunk.locator,
          headingHierarchy: chunk.headingHierarchy,
          startOffset: chunk.startOffset,
          endOffset: chunk.endOffset,
          content: chunk.content,
          contentHash: chunk.contentHash,
          version: chunk.version,
          status: chunk.status,
          vectorId: chunk.vectorId,
          metadata: chunk.metadata ? JSON.stringify(chunk.metadata) : null,
          updatedAt: new Date(),
        })
        .where(eq(adminOpsKnowledgeChunks.id, chunk.id));
    } else {
      await db.insert(adminOpsKnowledgeChunks).values({
        id: chunk.id,
        sourceId: chunk.sourceId,
        chunkIndex: chunk.chunkIndex,
        locator: chunk.locator,
        headingHierarchy: chunk.headingHierarchy,
        startOffset: chunk.startOffset,
        endOffset: chunk.endOffset,
        content: chunk.content,
        contentHash: chunk.contentHash,
        version: chunk.version,
        status: chunk.status,
        vectorId: chunk.vectorId,
        metadata: chunk.metadata ? JSON.stringify(chunk.metadata) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
}

export async function markSourceStale(
  sourceId: string,
  db: DatabaseContext = defaultDb
): Promise<void> {
  await db
    .update(adminOpsKnowledgeSources)
    .set({ status: "stale", updatedAt: new Date() })
    .where(eq(adminOpsKnowledgeSources.id, sourceId));
}

export async function markChunksStale(
  chunkIds: string[],
  db: DatabaseContext = defaultDb
): Promise<void> {
  if (chunkIds.length === 0) return;
  await db
    .update(adminOpsKnowledgeChunks)
    .set({ status: "stale", updatedAt: new Date() })
    .where(inArray(adminOpsKnowledgeChunks.id, chunkIds));
}

export async function getKnowledgeSourceById(
  sourceId: string,
  db: DatabaseContext = defaultDb
): Promise<AdminKnowledgeSourceRecord | null> {
  const rows = await db
    .select()
    .from(adminOpsKnowledgeSources)
    .where(eq(adminOpsKnowledgeSources.id, sourceId))
    .limit(1);

  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    id: row.id,
    sourcePath: row.sourcePath,
    sourceType: row.sourceType,
    title: row.title,
    version: row.version,
    contentHash: row.contentHash,
    manifestHash: row.manifestHash,
    chunkCount: row.chunkCount,
    status: row.status,
    metadata: row.metadata ? (typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata) : undefined,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listAllKnowledgeSources(
  db: DatabaseContext = defaultDb
): Promise<AdminKnowledgeSourceRecord[]> {
  const rows = await db.select().from(adminOpsKnowledgeSources);
  return rows.map((row) => ({
    id: row.id,
    sourcePath: row.sourcePath,
    sourceType: row.sourceType,
    title: row.title,
    version: row.version,
    contentHash: row.contentHash,
    manifestHash: row.manifestHash,
    chunkCount: row.chunkCount,
    status: row.status,
    metadata: row.metadata ? (typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata) : undefined,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function listActiveKnowledgeSources(
  db: DatabaseContext = defaultDb
): Promise<AdminKnowledgeSourceRecord[]> {
  const rows = await db
    .select()
    .from(adminOpsKnowledgeSources)
    .where(eq(adminOpsKnowledgeSources.status, "active"));

  return rows.map((row) => ({
    id: row.id,
    sourcePath: row.sourcePath,
    sourceType: row.sourceType,
    title: row.title,
    version: row.version,
    contentHash: row.contentHash,
    manifestHash: row.manifestHash,
    chunkCount: row.chunkCount,
    status: row.status,
    metadata: row.metadata ? (typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata) : undefined,
    lastSyncedAt: row.lastSyncedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function getChunksByVectorIds(
  vectorIds: string[],
  db: DatabaseContext = defaultDb
): Promise<AdminKnowledgeChunk[]> {
  if (vectorIds.length === 0) return [];
  const rows = await db
    .select()
    .from(adminOpsKnowledgeChunks)
    .where(inArray(adminOpsKnowledgeChunks.vectorId, vectorIds));

  return rows.map((row) => ({
    id: row.id,
    sourceId: row.sourceId,
    chunkIndex: row.chunkIndex,
    locator: row.locator,
    headingHierarchy: Array.isArray(row.headingHierarchy) ? row.headingHierarchy : [],
    startOffset: row.startOffset,
    endOffset: row.endOffset,
    content: row.content,
    contentHash: row.contentHash,
    version: row.version,
    status: row.status,
    vectorId: row.vectorId,
    metadata: row.metadata ? (typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata) : undefined,
  }));
}

export async function listChunksForSource(
  sourceId: string,
  db: DatabaseContext = defaultDb
): Promise<AdminKnowledgeChunk[]> {
  const rows = await db
    .select()
    .from(adminOpsKnowledgeChunks)
    .where(eq(adminOpsKnowledgeChunks.sourceId, sourceId));

  return rows.map((row) => ({
    id: row.id,
    sourceId: row.sourceId,
    chunkIndex: row.chunkIndex,
    locator: row.locator,
    headingHierarchy: Array.isArray(row.headingHierarchy) ? row.headingHierarchy : [],
    startOffset: row.startOffset,
    endOffset: row.endOffset,
    content: row.content,
    contentHash: row.contentHash,
    version: row.version,
    status: row.status,
    vectorId: row.vectorId,
    metadata: row.metadata ? (typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata) : undefined,
  }));
}

export async function enqueueAdminKnowledgeSync(
  input: {
    action: "sync_source" | "sync_all" | "delete_source";
    sourceId?: string;
    payload: unknown;
  },
  db: DatabaseContext = defaultDb
): Promise<string> {
  const id = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await db.insert(adminOpsKnowledgeSyncQueue).values({
    id,
    sourceId: input.sourceId ?? null,
    action: input.action,
    status: "pending",
    payload: JSON.stringify(input.payload),
    attempts: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return id;
}
