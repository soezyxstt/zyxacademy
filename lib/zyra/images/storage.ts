import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { zyraMessageAttachments } from "@/db/schema";
import { daysFrom } from "@/lib/date-utils";
import { buildZyraAttachmentKey } from "@/lib/storage/keys";
import { storage, STORAGE_PROVIDER_MODE } from "@/lib/storage";
import {
  assertZyraImageCount,
  assertZyraImageRequestBytes,
  ZYRA_IMAGE_MAX_REQUEST_BYTES,
  ZYRA_IMAGE_RETENTION_DAYS,
  type ZyraImageAttachmentRecord,
  type ZyraImageMime,
} from "./contracts";
import { sanitizeZyraImage } from "./sanitizer";

function requireDownload() {
  if (!storage.download) throw new Error("ZYRA_PRIVATE_STORAGE_DOWNLOAD_UNAVAILABLE");
  return storage.download.bind(storage);
}

function toRecord(row: typeof zyraMessageAttachments.$inferSelect): ZyraImageAttachmentRecord {
  return {
    id: row.id,
    studentId: row.studentId,
    courseId: row.courseId,
    sessionId: row.sessionId,
    messageId: row.messageId,
    objectKey: row.objectKey,
    mimeType: row.mimeType as ZyraImageMime,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    status: row.status,
    expiresAt: row.expiresAt,
  };
}

export async function createZyraImageAttachment(input: {
  studentId: string;
  courseId: string;
  sessionId: string;
  bytes: Uint8Array;
  declaredMimeType: string;
}): Promise<ZyraImageAttachmentRecord> {
  if (STORAGE_PROVIDER_MODE === "uploadthing") {
    throw new Error("ZYRA_PRIVATE_STORAGE_REQUIRED");
  }
  const sanitized = await sanitizeZyraImage(input.bytes, input.declaredMimeType);
  const id = randomUUID();
  const createdAt = new Date();
  const expiresAt = daysFrom(ZYRA_IMAGE_RETENTION_DAYS, createdAt);
  const objectKey = buildZyraAttachmentKey({
    attachmentId: id,
    extension: sanitized.extension,
    createdAt,
  });

  await storage.upload(sanitized.bytes, `${id}.${sanitized.extension}`, sanitized.mimeType, { key: objectKey });
  try {
    const [row] = await db.insert(zyraMessageAttachments).values({
      id,
      studentId: input.studentId,
      courseId: input.courseId,
      sessionId: input.sessionId,
      objectKey,
      mimeType: sanitized.mimeType,
      byteSize: sanitized.bytes.byteLength,
      width: sanitized.width,
      height: sanitized.height,
      sanitizedSha256: sanitized.sanitizedSha256,
      sanitizerVersion: sanitized.sanitizerVersion,
      status: "uploaded",
      createdAt,
      expiresAt,
    }).returning();
    if (!row) throw new Error("ZYRA_ATTACHMENT_RECORD_NOT_CREATED");
    return toRecord(row);
  } catch (error) {
    await storage.delete(objectKey).catch(() => undefined);
    throw error;
  }
}

export async function getZyraAttachmentForScope(input: {
  id: string;
  studentId: string;
  courseId: string;
  sessionId: string;
}): Promise<ZyraImageAttachmentRecord | null> {
  const [row] = await db
    .select()
    .from(zyraMessageAttachments)
    .where(and(
      eq(zyraMessageAttachments.id, input.id),
      eq(zyraMessageAttachments.studentId, input.studentId),
      eq(zyraMessageAttachments.courseId, input.courseId),
      eq(zyraMessageAttachments.sessionId, input.sessionId),
      ne(zyraMessageAttachments.status, "deleted"),
      ne(zyraMessageAttachments.status, "expired"),
      gt(zyraMessageAttachments.expiresAt, new Date()),
    ))
    .limit(1);
  return row ? toRecord(row) : null;
}

export async function deleteZyraAttachment(id: string, ownerId: string): Promise<void> {
  const [row] = await db
    .select({ objectKey: zyraMessageAttachments.objectKey })
    .from(zyraMessageAttachments)
    .where(and(eq(zyraMessageAttachments.id, id), eq(zyraMessageAttachments.studentId, ownerId)))
    .limit(1);
  if (!row) return;
  await storage.delete(row.objectKey).catch(() => undefined);
  await db.update(zyraMessageAttachments)
    .set({ status: "deleted", deletedAt: new Date() })
    .where(and(eq(zyraMessageAttachments.id, id), eq(zyraMessageAttachments.studentId, ownerId)));
}

export async function loadZyraImageParts(input: {
  ids: readonly string[];
  studentId: string;
  courseId: string;
  sessionId: string;
  promptBytes: number;
}): Promise<Array<{ type: "image"; mimeType: ZyraImageMime; data: string }>> {
  assertZyraImageCount(input.ids.length);
  const download = requireDownload();
  const parts: Array<{ type: "image"; mimeType: ZyraImageMime; data: string }> = [];
  let totalBytes = 0;
  for (const id of input.ids) {
    const record = await getZyraAttachmentForScope({ ...input, id });
    if (!record) throw new Error("ZYRA_ATTACHMENT_NOT_FOUND");
    const bytes = await download(record.objectKey);
    totalBytes += bytes.byteLength;
    assertZyraImageRequestBytes(totalBytes, input.promptBytes);
    parts.push({
      type: "image",
      mimeType: record.mimeType,
      data: Buffer.from(bytes).toString("base64"),
    });
  }
  if (totalBytes + input.promptBytes > ZYRA_IMAGE_MAX_REQUEST_BYTES) throw new Error("REQUEST_TOO_LARGE");
  return parts;
}

export async function markZyraAttachmentsDispatched(ids: readonly string[], ownerId: string): Promise<void> {
  assertZyraImageCount(ids.length);
  const now = new Date();
  for (const id of ids) {
    await db.update(zyraMessageAttachments)
      .set({ status: "dispatched", providerDispatchedAt: now })
      .where(and(eq(zyraMessageAttachments.id, id), eq(zyraMessageAttachments.studentId, ownerId)));
  }
}

/**
 * Removes expired private objects and then marks their rows. Expiry already
 * blocks reads, so a temporary storage failure is safe to retry later.
 */
export async function sweepExpiredZyraAttachments(limit = 100): Promise<{
  inspected: number;
  deleted: number;
  failed: number;
}> {
  const boundedLimit = Math.max(1, Math.min(Math.floor(limit), 500));
  const rows = await db
    .select({ id: zyraMessageAttachments.id, objectKey: zyraMessageAttachments.objectKey })
    .from(zyraMessageAttachments)
    .where(and(
      lt(zyraMessageAttachments.expiresAt, new Date()),
      inArray(zyraMessageAttachments.status, ["uploaded", "attached", "dispatched", "failed"]),
    ))
    .limit(boundedLimit);

  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await storage.delete(row.objectKey);
      await db.update(zyraMessageAttachments)
        .set({ status: "expired", deletedAt: new Date() })
        .where(eq(zyraMessageAttachments.id, row.id));
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  return { inspected: rows.length, deleted, failed };
}
