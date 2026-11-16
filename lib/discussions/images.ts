import { randomUUID } from "node:crypto";
import { addMinutes } from "date-fns";
import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { discussionAttachments, discussionMessages, discussionThreads, gamificationSocialRateLimits } from "@/db/schema";
import { daysFrom } from "@/lib/date-utils";
import { storage, STORAGE_PROVIDER_MODE } from "@/lib/storage";
import { buildDiscussionImageKey } from "@/lib/storage/keys";
import { getDiscussionActor, requireDiscussionChannelAccess, requireDiscussionMessageAccess } from "@/lib/discussions/access";
import { DISCUSSION_IMAGE_MAX_BYTES, DISCUSSION_IMAGE_MAX_COUNT, DISCUSSION_IMAGE_PREVIEW_MAX_BYTES, DiscussionImageError, makeDiscussionImagePreview, requireDiscussionPrivateStorage, sanitizeDiscussionImage, type DiscussionImageMime } from "./image-policy";
import { deleteDiscussionImageObjects } from "./image-sweep";
import type { DiscussionAttachment } from "./contracts";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AttachmentRow = typeof discussionAttachments.$inferSelect;

export type DiscussionImageDTO = {
  id: string;
  name: string;
  mime: DiscussionImageMime;
  size: number;
  width: number;
  height: number;
  url: string;
  downloadUrl: string;
  previewAvailable: boolean;
};

function hasPreview(row: AttachmentRow): boolean {
  return Boolean(row.previewStorageKey && Number.isInteger(row.previewSize) && row.previewSize! > 0 && row.previewSize! <= DISCUSSION_IMAGE_PREVIEW_MAX_BYTES);
}

function imageDto(row: AttachmentRow): DiscussionImageDTO {
  if (!row.mime || !["image/jpeg", "image/png", "image/webp"].includes(row.mime) || !row.size || !row.width || !row.height) {
    throw new Error("DISCUSSION_IMAGE_INVALID");
  }
  const url = `/api/discussions/attachments/${encodeURIComponent(row.id)}`;
  return { id: row.id, name: row.name, mime: row.mime as DiscussionImageMime, size: row.size, width: row.width, height: row.height, url, downloadUrl: `${url}?download=1`, previewAvailable: hasPreview(row) };
}

function imageName(name: string, extension: string): string {
  const base = name.split(/[\\/]/).pop()?.replace(/\.[^.]*$/, "").replace(/[\u0000-\u001f\u007f"]/g, "_").trim().slice(0, 100);
  return `${base || "gambar"}.${extension}`;
}

export async function uploadDiscussionImage(input: { actorId: string; channelId: string; file: File }): Promise<DiscussionImageDTO> {
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
    await tx.insert(discussionAttachments).values({
      id, channelId: input.channelId, uploaderId: actor.id, messageId: null, status: "pending", storageKey, previewStorageKey,
      name: imageName(input.file.name, sourceExtension), mime: null, size: null, width: null, height: null,
      createdAt, expiresAt: daysFrom(1, createdAt),
    });
  });

  try {
    const image = await sanitizeDiscussionImage(new Uint8Array(await input.file.arrayBuffer()), input.file.type);
    const preview = await makeDiscussionImagePreview(image.bytes);
    const name = imageName(input.file.name, image.extension);
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
    return imageDto(row);
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

export async function attachDiscussionImages(tx: Tx, input: {
  actorId: string; channelId: string; messageId: string; attachmentIds: string[];
}): Promise<void> {
  const ids = input.attachmentIds;
  if (ids.length > DISCUSSION_IMAGE_MAX_COUNT || new Set(ids).size !== ids.length || ids.some((id) => !id)) throw new Error("DISCUSSION_IMAGE_COUNT");
  if (!ids.length) return;
  const actor = await getDiscussionActor(input.actorId, tx);
  const [message] = await tx.select({ id: discussionMessages.id, authorId: discussionMessages.authorId, deletedAt: discussionMessages.deletedAt, channelId: discussionThreads.channelId })
    .from(discussionMessages).innerJoin(discussionThreads, eq(discussionMessages.threadId, discussionThreads.id))
    .where(eq(discussionMessages.id, input.messageId)).for("update", { of: discussionMessages });
  if (!message || message.deletedAt || message.authorId !== actor.id || message.channelId !== input.channelId) throw new Error("DISCUSSION_IMAGE_SCOPE");
  await requireDiscussionMessageAccess(actor, input.messageId, tx);
  const existing = await tx.select({ id: discussionAttachments.id }).from(discussionAttachments)
    .where(and(eq(discussionAttachments.messageId, input.messageId), eq(discussionAttachments.status, "attached")));
  if (existing.length + ids.length > DISCUSSION_IMAGE_MAX_COUNT) throw new Error("DISCUSSION_IMAGE_COUNT");
  async function rejectMissing(missing: string[]): Promise<never> {
    const expired = await tx.select({ id: discussionAttachments.id }).from(discussionAttachments).where(and(
      inArray(discussionAttachments.id, missing), eq(discussionAttachments.uploaderId, actor.id), eq(discussionAttachments.channelId, input.channelId),
      or(and(eq(discussionAttachments.status, "ready"), sql`${discussionAttachments.expiresAt} <= clock_timestamp()`),
       inArray(discussionAttachments.status, ["deleting", "failed", "expired"])), isNull(discussionAttachments.messageId),
    )).for("update");
    throw new Error(expired.length === missing.length ? "DISCUSSION_ATTACHMENT_EXPIRED" : "DISCUSSION_IMAGE_SCOPE");
  }
  const eligible = await tx.select({ id: discussionAttachments.id }).from(discussionAttachments).where(and(
    inArray(discussionAttachments.id, ids), eq(discussionAttachments.uploaderId, actor.id), eq(discussionAttachments.channelId, input.channelId),
    eq(discussionAttachments.status, "ready"), isNull(discussionAttachments.messageId), gt(discussionAttachments.expiresAt, sql`clock_timestamp()`),
  )).for("update");
  if (eligible.length !== ids.length) return rejectMissing(ids.filter(id => !eligible.some(row => row.id === id)));
  const claimed = await tx.update(discussionAttachments).set({ status: "attached", messageId: input.messageId }).where(and(
    inArray(discussionAttachments.id, ids), eq(discussionAttachments.uploaderId, actor.id), eq(discussionAttachments.channelId, input.channelId),
    eq(discussionAttachments.status, "ready"), isNull(discussionAttachments.messageId), gt(discussionAttachments.expiresAt, sql`clock_timestamp()`),
  )).returning({ id: discussionAttachments.id });
  if (claimed.length !== ids.length) return rejectMissing(ids.filter(id => !claimed.some(row => row.id === id)));
}

export async function listDiscussionMessageAttachments(actorId: string, messageId: string): Promise<DiscussionImageDTO[]> {
  const actor = await getDiscussionActor(actorId);
  const { channel, message } = await requireDiscussionMessageAccess(actor, messageId);
  if (message.deletedAt) return [];
  const rows = await db.select().from(discussionAttachments).where(and(
    eq(discussionAttachments.messageId, messageId), eq(discussionAttachments.channelId, channel.id), eq(discussionAttachments.status, "attached"),
  )).orderBy(asc(discussionAttachments.createdAt)).limit(DISCUSSION_IMAGE_MAX_COUNT);
  return rows.map(imageDto);
}

export async function listDiscussionAttachmentsForMessages(actorId: string, messageIds: readonly string[]): Promise<Map<string, DiscussionAttachment[]>> {
  const ids = [...new Set(messageIds)];
  if (ids.length > 60 || ids.some(id => typeof id !== "string" || !id || id.length > 160)) throw new Error("DISCUSSION_INVALID");
  if (!ids.length) return new Map();
  const messages = await db.select({ id: discussionMessages.id, channelId: discussionThreads.channelId }).from(discussionMessages)
    .innerJoin(discussionThreads, eq(discussionThreads.id, discussionMessages.threadId))
    .where(and(inArray(discussionMessages.id, ids), isNull(discussionMessages.deletedAt)));
  const { getAccessibleDiscussionChannels } = await import("./access");
  const allowed = new Set((await getAccessibleDiscussionChannels(actorId, { channelIds: messages.map(row => row.channelId) })).map(row => row.id));
  const messageChannels = new Map(messages.filter(row => allowed.has(row.channelId)).map(row => [row.id, row.channelId]));
  if (!messageChannels.size) return new Map();
  const rows = await db.select().from(discussionAttachments).where(and(inArray(discussionAttachments.messageId, [...messageChannels.keys()]),
    eq(discussionAttachments.status, "attached"))).orderBy(asc(discussionAttachments.createdAt), asc(discussionAttachments.id)).limit(messageChannels.size * DISCUSSION_IMAGE_MAX_COUNT);
  const result = new Map<string, DiscussionAttachment[]>();
  for (const row of rows) {
    if (!row.messageId || messageChannels.get(row.messageId) !== row.channelId) continue;
    const items = result.get(row.messageId) ?? [];
    if (items.length < DISCUSSION_IMAGE_MAX_COUNT) items.push(imageDto(row));
    result.set(row.messageId, items);
  }
  return result;
}

export async function readDiscussionImage(actorId: string, id: string, preview = false): Promise<{ bytes: Uint8Array; image: DiscussionImageDTO } | null> {
  requireDiscussionPrivateStorage(STORAGE_PROVIDER_MODE);
  const actor = await getDiscussionActor(actorId);
  const [row] = await db.select().from(discussionAttachments).where(eq(discussionAttachments.id, id)).limit(1);
  if (!row) return null;
  if (row.status === "ready" && !row.messageId && row.uploaderId === actor.id && row.expiresAt > new Date()) {
    await requireDiscussionChannelAccess(actor, row.channelId);
  } else if (row.status === "attached" && row.messageId) {
    const { channel, message } = await requireDiscussionMessageAccess(actor, row.messageId);
    if (channel.id !== row.channelId || message.deletedAt) return null;
  } else return null;
  if (!storage.download) return null;
  const image = imageDto(row);
  if (preview && !hasPreview(row)) return null;
  const bytes = await storage.download(preview ? row.previewStorageKey! : row.storageKey);
  const expectedSize = preview ? row.previewSize! : image.size;
  const maxSize = preview ? DISCUSSION_IMAGE_PREVIEW_MAX_BYTES : DISCUSSION_IMAGE_MAX_BYTES;
  if (!bytes.byteLength || bytes.byteLength !== expectedSize || bytes.byteLength > maxSize) return null;
  return { bytes, image };
}

export { sweepDiscussionImages } from "./image-sweep";
