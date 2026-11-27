import { wakeOutbox } from "@/lib/queue/outbox";
import { randomUUID } from "node:crypto";
import { addMinutes } from "date-fns";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { discussionAttachments, gamificationSocialRateLimits } from "@/db/schema";
import { daysFrom } from "@/lib/date-utils";
import { storage, STORAGE_PROVIDER_MODE } from "@/lib/storage";
import { buildDiscussionImageKey } from "@/lib/storage/keys";
import { getDiscussionActor, requireDiscussionChannelAccess } from "@/lib/discussions/access";
import {
  DISCUSSION_IMAGE_MAX_BYTES,
  DiscussionImageError,
  requireDiscussionPrivateStorage,
  sanitizeDiscussionImageFilename,
  toDiscussionImageDto,
  type DiscussionImageDTO,
} from "./image-policy";
import { makeDiscussionImagePreview, sanitizeDiscussionImage } from "./image-sanitizer";
import { deleteDiscussionImageObjects } from "./image-sweep";

export async function uploadDiscussionImage(input: { actorId: string; channelId: string; file: File }): Promise<DiscussionImageDTO & { expiresAt: string }> {
  requireDiscussionPrivateStorage(STORAGE_PROVIDER_MODE);
  const actor = await getDiscussionActor(input.actorId);
  await requireDiscussionChannelAccess(actor, input.channelId);
  if (!input.file.size || input.file.size > DISCUSSION_IMAGE_MAX_BYTES) throw new Error("DISCUSSION_IMAGE_SIZE");
  const sourceExtension = input.file.type === "image/jpeg" ? "jpg" : input.file.type === "image/png" ? "png" : input.file.type === "image/webp" ? "webp" : null;
  if (!sourceExtension) throw new DiscussionImageError("format");
  const id = randomUUID();
  const createdAt = new Date();
  const storageKey = buildDiscussionImageKey({ channelId: input.channelId, attachmentId: id, extension: sourceExtension });
  const previewStorageKey = buildDiscussionImageKey({ channelId: input.channelId, attachmentId: id, extension: "webp", variant: "preview" });

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`discussion:uploads:${actor.id}`}, 0))`);
    const rate = await tx.execute<{ attempts: number }>(sql`insert into ${gamificationSocialRateLimits} (user_id, action, window_key, attempts, expires_at)
      values (${actor.id}, 'discussion_upload', 'rolling', 1, now() + interval '1 minute')
      on conflict (user_id, action, window_key) do update set
        attempts = case when ${gamificationSocialRateLimits.expiresAt} <= now() then 1 else ${gamificationSocialRateLimits.attempts} + 1 end,
        expires_at = case when ${gamificationSocialRateLimits.expiresAt} <= now() then now() + interval '1 minute' else ${gamificationSocialRateLimits.expiresAt} end
      returning attempts`);
    const attempts = Number(rate.rows[0]?.attempts);
    if (!Number.isInteger(attempts) || attempts < 1 || attempts > 24) throw new Error("DISCUSSION_IMAGE_RATE_LIMIT");
    const [count] = await tx.select({ value: sql<number>`count(*)::int` }).from(discussionAttachments).where(and(
      eq(discussionAttachments.uploaderId, actor.id),
      inArray(discussionAttachments.status, ["pending", "ready"]),
      gt(discussionAttachments.expiresAt, createdAt),
    ));
    if ((count?.value ?? 0) >= 16) throw new Error("DISCUSSION_IMAGE_PENDING_LIMIT");
    await requireDiscussionChannelAccess(actor, input.channelId, tx);
    wakeOutbox("discussion/images.sweep-continue", daysFrom(1, createdAt).getTime());
    await tx.insert(discussionAttachments).values({
      id, channelId: input.channelId, uploaderId: actor.id, messageId: null, status: "pending", storageKey, previewStorageKey,
      name: sanitizeDiscussionImageFilename(input.file.name, sourceExtension), mime: null, size: null, width: null, height: null,
      createdAt, expiresAt: daysFrom(1, createdAt),
    });
  });

  try {
    const image = await sanitizeDiscussionImage(new Uint8Array(await input.file.arrayBuffer()), input.file.type);
    const preview = await makeDiscussionImagePreview(image.bytes);
    const name = sanitizeDiscussionImageFilename(input.file.name, image.extension);
    const row = await db.transaction(async (tx) => {
      const [pending] = await tx.select().from(discussionAttachments).where(and(
        eq(discussionAttachments.id, id), eq(discussionAttachments.status, "pending"), gt(discussionAttachments.expiresAt, new Date()),
      )).for("update");
      if (!pending) throw new Error("DISCUSSION_IMAGE_EXPIRED");
      await requireDiscussionChannelAccess(actor, input.channelId, tx);
      await storage.upload(image.bytes, name, image.mime, { key: storageKey });
      await storage.upload(preview, "preview.webp", "image/webp", { key: previewStorageKey });
      const [ready] = await tx.update(discussionAttachments).set({ status: "ready", name, mime: image.mime, size: image.bytes.byteLength, width: image.width, height: image.height, previewSize: preview.byteLength }).where(and(
        eq(discussionAttachments.id, id), eq(discussionAttachments.status, "pending"), gt(discussionAttachments.expiresAt, new Date()),
      )).returning();
      if (!ready) throw new Error("DISCUSSION_IMAGE_EXPIRED");
      return ready;
    });
    return { ...toDiscussionImageDto(row), expiresAt: row.expiresAt.toISOString() };
  } catch (error) {
    try {
      const [claimed] = await db.update(discussionAttachments).set({ status: "deleting", expiresAt: addMinutes(new Date(), 5) }).where(and(
        eq(discussionAttachments.id, id), eq(discussionAttachments.status, "pending"),
      )).returning({ id: discussionAttachments.id });
      if (claimed) {
        await deleteDiscussionImageObjects(storageKey, previewStorageKey);
        await db.update(discussionAttachments).set({ status: "failed", expiresAt: daysFrom(1) })
          .where(and(eq(discussionAttachments.id, id), eq(discussionAttachments.status, "deleting")));
      }
    } catch {
      // The pending or deleting row remains eligible for a later sweep.
    }
    throw error;
  }
}
