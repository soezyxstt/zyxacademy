import { addMinutes } from "date-fns";
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { discussionAttachments } from "@/db/schema";
import { daysFrom } from "@/lib/date-utils";
import { storage, STORAGE_PROVIDER_MODE } from "@/lib/storage";
import { requireDiscussionPrivateStorage } from "./image-storage-policy";

export async function deleteDiscussionImageObjects(storageKey: string, previewStorageKey: string | null): Promise<void> {
  const keys = [...new Set([storageKey, previewStorageKey].filter((key): key is string => Boolean(key)))];
  const results = await Promise.allSettled(keys.map((key) => storage.delete(key)));
  if (results.some((result) => result.status === "rejected")) throw new Error("DISCUSSION_IMAGE_DELETE_FAILED");
}

export async function sweepDiscussionImages(input: { limit?: number } = {}): Promise<{ inspected: number; deleted: number; failed: number }> {
  requireDiscussionPrivateStorage(STORAGE_PROVIDER_MODE);
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(100, Math.floor(input.limit!))) : 50;
  const now = new Date();
  const rows = await db.transaction(async (tx) => {
    const expired = await tx.select({ id: discussionAttachments.id, storageKey: discussionAttachments.storageKey, previewStorageKey: discussionAttachments.previewStorageKey, status: discussionAttachments.status }).from(discussionAttachments).where(and(
      inArray(discussionAttachments.status, ["pending", "ready", "failed", "deleting"]), lte(discussionAttachments.expiresAt, now),
    )).orderBy(asc(discussionAttachments.expiresAt)).limit(limit).for("update", { skipLocked: true });
    if (expired.length) await tx.update(discussionAttachments).set({ status: "deleting", expiresAt: addMinutes(now, 5) })
      .where(inArray(discussionAttachments.id, expired.map((row) => row.id)));
    return expired;
  });
  let deleted = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      await deleteDiscussionImageObjects(row.storageKey, row.previewStorageKey);
      if (row.status === "failed") {
        // Keep ownership evidence so a retained draft can re-upload after storage cleanup.
        await db.update(discussionAttachments).set({ status: "expired" }).where(and(eq(discussionAttachments.id, row.id), eq(discussionAttachments.status, "deleting")));
      } else {
        // Retry deletion after a day in case an interrupted upload finishes late.
        await db.update(discussionAttachments).set({ status: "failed", expiresAt: daysFrom(1) })
          .where(and(eq(discussionAttachments.id, row.id), eq(discussionAttachments.status, "deleting")));
      }
      deleted++;
    } catch {
      failed++;
    }
  }
  return { inspected: rows.length, deleted, failed };
}
