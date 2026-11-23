import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { discussionAttachments, discussionMessages, discussionThreads } from "@/db/schema";
import { storage, STORAGE_PROVIDER_MODE } from "@/lib/storage";
import { getDiscussionActor, requireDiscussionChannelAccess, requireDiscussionMessageAccess } from "@/lib/discussions/access";
import {
  DISCUSSION_IMAGE_MAX_BYTES,
  DISCUSSION_IMAGE_MAX_COUNT,
  DISCUSSION_IMAGE_PREVIEW_MAX_BYTES,
  hasDiscussionImagePreview,
  requireDiscussionPrivateStorage,
  toDiscussionImageDto,
  type DiscussionImageDTO,
} from "./image-policy";
import type { DiscussionAttachment } from "./contracts";

export type { DiscussionImageDTO } from "./image-policy";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

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
  return rows.map(toDiscussionImageDto);
}

export async function listDiscussionAttachmentsForMessages(
  actorId: string,
  messageIds: readonly string[],
  verifiedMessageChannels?: ReadonlyMap<string, string>,
): Promise<Map<string, DiscussionAttachment[]>> {
  const ids = [...new Set(messageIds)];
  if (ids.length > 60 || ids.some(id => typeof id !== "string" || !id || id.length > 160)) throw new Error("DISCUSSION_INVALID");
  if (!ids.length) return new Map();
  let messageChannels: Map<string, string>;
  if (verifiedMessageChannels) {
    messageChannels = new Map(ids.flatMap(id => {
      const channelId = verifiedMessageChannels.get(id);
      return channelId ? [[id, channelId] as const] : [];
    }));
  } else {
    const messages = await db.select({ id: discussionMessages.id, channelId: discussionThreads.channelId }).from(discussionMessages)
      .innerJoin(discussionThreads, eq(discussionThreads.id, discussionMessages.threadId))
      .where(and(inArray(discussionMessages.id, ids), isNull(discussionMessages.deletedAt)));
    const { getAccessibleDiscussionChannels } = await import("./access");
    const allowed = new Set((await getAccessibleDiscussionChannels(actorId, { channelIds: messages.map(row => row.channelId) })).map(row => row.id));
    messageChannels = new Map(messages.filter(row => allowed.has(row.channelId)).map(row => [row.id, row.channelId]));
  }
  if (!messageChannels.size) return new Map();
  const rows = await db.select().from(discussionAttachments).where(and(inArray(discussionAttachments.messageId, [...messageChannels.keys()]),
    eq(discussionAttachments.status, "attached"))).orderBy(asc(discussionAttachments.createdAt), asc(discussionAttachments.id)).limit(messageChannels.size * DISCUSSION_IMAGE_MAX_COUNT);
  const result = new Map<string, DiscussionAttachment[]>();
  for (const row of rows) {
    if (!row.messageId || messageChannels.get(row.messageId) !== row.channelId) continue;
    const items = result.get(row.messageId) ?? [];
    if (items.length < DISCUSSION_IMAGE_MAX_COUNT) items.push(toDiscussionImageDto(row));
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
  const image = toDiscussionImageDto(row);
  if (preview && !hasDiscussionImagePreview(row)) return null;
  const bytes = await storage.download(preview ? row.previewStorageKey! : row.storageKey);
  const expectedSize = preview ? row.previewSize! : image.size;
  const maxSize = preview ? DISCUSSION_IMAGE_PREVIEW_MAX_BYTES : DISCUSSION_IMAGE_MAX_BYTES;
  if (!bytes.byteLength || bytes.byteLength !== expectedSize || bytes.byteLength > maxSize) return null;
  return { bytes, image };
}

export { sweepDiscussionImages } from "./image-sweep";
