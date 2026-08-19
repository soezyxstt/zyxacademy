import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditMutasi } from "@/db/schema";
import { storage } from "@/lib/storage";
import { buildAuthoringContextKey } from "@/lib/storage/keys";
import { assertSafeRunId } from "@/lib/staging/migration-ledger";
import { buildAuthoringContextPack, serializeAuthoringContextPack } from "./context-pack";
import { loadAuthoringContextInput } from "./snapshot";
import { daysFrom } from "@/lib/date-utils";

export type AuthoringContextExportOptions = {
  runId: string;
  courseId: string;
  actorId: string;
  snapshotId: string;
  createdAt?: string;
  retentionUntil?: string;
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isoAfterDays(createdAt: string, days: number): string {
  return daysFrom(days, new Date(createdAt)).toISOString();
}

export async function exportAuthoringContext(options: AuthoringContextExportOptions) {
  const runId = assertSafeRunId(options.runId);
  const createdAt = options.createdAt ?? new Date().toISOString();
  const retentionUntil = options.retentionUntil ?? isoAfterDays(createdAt, 7);
  const input = await loadAuthoringContextInput({ courseId: options.courseId, snapshotId: options.snapshotId, createdAt, retentionUntil });
  const pack = buildAuthoringContextPack(input);
  const bytes = serializeAuthoringContextPack(pack);
  const objectKey = buildAuthoringContextKey({ runId, packId: pack.manifest.packId });
  await storage.upload(bytes, `${pack.manifest.packId}.zip`, "application/zip", {
    key: objectKey,
    metadata: {
      packId: pack.manifest.packId,
      snapshotId: options.snapshotId,
      packChecksum: pack.checksum,
      retentionUntil,
    },
  });
  try {
    await db.insert(auditMutasi).values({
      id: `audit-authoring-${pack.manifest.packId}-${runId}`,
      actorId: options.actorId,
      entityType: "authoring_context_pack",
      entityId: pack.manifest.packId,
      action: "exported",
      beforeSnapshot: null,
      afterSnapshot: {
        packId: pack.manifest.packId,
        courseId: options.courseId,
        snapshotId: options.snapshotId,
        policyVersion: pack.manifest.policyVersion,
        sourceEntityVersions: pack.manifest.files,
        holdoutExcludedCount: pack.holdoutExcludedCount,
        artifactChecksum: sha256(bytes),
        objectKey,
        retentionUntil,
        byteLength: bytes.byteLength,
      },
      correlationId: runId,
    });
  } catch (error) {
    await storage.delete(objectKey).catch(() => undefined);
    throw error;
  }
  return {
    packId: pack.manifest.packId,
    snapshotId: pack.manifest.snapshotId,
    courseId: pack.manifest.courseId,
    packChecksum: pack.checksum,
    artifactChecksum: sha256(bytes),
    objectKey,
    retentionUntil,
    holdoutExcludedCount: pack.holdoutExcludedCount,
    byteLength: bytes.byteLength,
  };
}

export async function listAuthoringContextExports(limit = 20) {
  return db
    .select({ id: auditMutasi.id, entityId: auditMutasi.entityId, action: auditMutasi.action, afterSnapshot: auditMutasi.afterSnapshot, correlationId: auditMutasi.correlationId, createdAt: auditMutasi.createdAt })
    .from(auditMutasi)
    .where(eq(auditMutasi.entityType, "authoring_context_pack"))
    .orderBy(desc(auditMutasi.createdAt))
    .limit(Math.min(Math.max(limit, 1), 100));
}

export async function downloadAuthoringContextExport(packId: string): Promise<{
  bytes: Uint8Array;
  filename: string;
  retentionUntil: string;
}> {
  const [row] = await db
    .select({ afterSnapshot: auditMutasi.afterSnapshot })
    .from(auditMutasi)
    .where(and(eq(auditMutasi.entityType, "authoring_context_pack"), eq(auditMutasi.entityId, packId)))
    .orderBy(desc(auditMutasi.createdAt))
    .limit(1);
  const objectKey = row?.afterSnapshot?.objectKey;
  const retentionUntil = row?.afterSnapshot?.retentionUntil;
  if (typeof objectKey !== "string" || typeof retentionUntil !== "string") throw new Error("AUTHORING_CONTEXT_NOT_FOUND");
  if (new Date(retentionUntil).getTime() <= Date.now()) throw new Error("AUTHORING_CONTEXT_EXPIRED");
  if (!storage.download) throw new Error("AUTHORING_CONTEXT_STORAGE_DOWNLOAD_UNAVAILABLE");
  return {
    bytes: await storage.download(objectKey),
    filename: `${packId}.zip`,
    retentionUntil,
  };
}
