import { wakeOutbox } from "@/lib/queue/outbox";
import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { discussionAiRequests, discussionAttachments, discussionChannels, discussionEvents, discussionMessages, discussionThreads, studentQuizAttempts } from "@/db/schema";
import { getDiscussionActor, requireDiscussionMessageAccess } from "./access";
import { canForwardDiscussion, validDiscussionId, validDiscussionText } from "./policy";

export type DiscussionExpectedSource = { id: string; revision: number };
export type DiscussionSourceSnapshot = { contextIds: string[]; attachmentSets: Array<{ messageId: string; ids: string[] }> };

/** The worker supplies every message and forwarded source used to generate the answer. */
export async function publishDiscussionZyraAnswer(requestId: string, body: string, expectedSources?: DiscussionExpectedSource[], snapshot?: DiscussionSourceSnapshot) {
 if (!validDiscussionId(requestId) || !validDiscussionText(body, 12000)) throw new Error("DISCUSSION_INVALID");
 return db.transaction(async tx => {
  const requests = await tx.select().from(discussionAiRequests).where(or(eq(discussionAiRequests.id, requestId), eq(discussionAiRequests.requestId, requestId))).limit(2).for("update");
  if (requests.length !== 1 || requests[0].kind !== "zyra") throw new Error("DISCUSSION_UNAVAILABLE");
  const request = requests[0], actor = await getDiscussionActor(request.requestedById, tx);
  const source = await requireDiscussionMessageAccess(actor, request.messageId, tx);
  if (source.message.authorId !== actor.id || !source.message.askZyra || source.message.deletedAt) throw new Error("DISCUSSION_AI_SOURCE_CHANGED");
  if (request.status === "completed" && request.answerMessageId) return { messageId: request.answerMessageId, threadId: source.thread.id };
  if (request.status !== "processing") throw new Error("DISCUSSION_CONFLICT");
  if (!Array.isArray(expectedSources) || !expectedSources.length || expectedSources.length > 64 ||
   expectedSources.some(item => !item || !validDiscussionId(item.id) || !Number.isSafeInteger(item.revision) || item.revision < 1) ||
   new Set(expectedSources.map(item => item.id)).size !== expectedSources.length || !expectedSources.some(item => item.id === source.message.id)) {
   throw new Error("DISCUSSION_AI_SOURCE_CHANGED");
  }
  const expected = new Map(expectedSources.map(item => [item.id, item.revision]));
  if (!snapshot || !Array.isArray(snapshot.contextIds) || snapshot.contextIds.length < 1 || snapshot.contextIds.length > 6 ||
   new Set(snapshot.contextIds).size !== snapshot.contextIds.length || snapshot.contextIds.at(-1) !== source.message.id ||
   snapshot.contextIds.some(id => !expected.has(id)) || !Array.isArray(snapshot.attachmentSets) || snapshot.attachmentSets.length !== expected.size ||
   snapshot.attachmentSets.some(item => !item || !expected.has(item.messageId) || !Array.isArray(item.ids) || item.ids.length > 4 ||
    item.ids.some(id => !validDiscussionId(id)) || new Set(item.ids).size !== item.ids.length) ||
   new Set(snapshot.attachmentSets.map(item => item.messageId)).size !== expected.size) throw new Error("DISCUSSION_AI_SOURCE_CHANGED");
  const [thread] = await tx.select().from(discussionThreads).where(eq(discussionThreads.id, source.thread.id)).limit(1).for("update");
  if (!thread || thread.status !== "open") throw new Error("DISCUSSION_AI_SOURCE_CHANGED");
  const locked = await tx.select().from(discussionMessages).where(inArray(discussionMessages.id, [...expected.keys()]))
   .orderBy(asc(discussionMessages.id)).for("share");
  if (locked.length !== expected.size || locked.some(message => message.deletedAt || message.revision !== expected.get(message.id))) {
   throw new Error("DISCUSSION_AI_SOURCE_CHANGED");
  }
  const context = snapshot.contextIds.map(id => locked.find(message => message.id === id)!);
  const forwarded = new Set(context.flatMap(message => message.forwardedFromId ? [message.forwardedFromId] : []));
  if (context.some(message => message.threadId !== source.thread.id || message.seq > source.message.seq || (message.forwardedFromId && !expected.has(message.forwardedFromId))) ||
   locked.some(message => !snapshot.contextIds.includes(message.id) && !forwarded.has(message.id))) {
   throw new Error("DISCUSSION_AI_SOURCE_CHANGED");
  }
  for (const message of locked) {
   try { await requireDiscussionMessageAccess(actor, message.id, tx); } catch (error) {
    if (error instanceof Error && error.message === "DISCUSSION_UNAVAILABLE") throw new Error("DISCUSSION_AI_SOURCE_CHANGED");
    throw error;
   }
  }
  const prior = await tx.select().from(discussionMessages).where(and(eq(discussionMessages.threadId, source.thread.id),
   lt(discussionMessages.seq, source.message.seq), isNull(discussionMessages.deletedAt)))
   .orderBy(desc(discussionMessages.seq)).limit(30).for("share");
  const currentContext: string[] = [];
  for (const message of prior) {
   if (message.forwardedFromId) {
    try {
     const original = await requireDiscussionMessageAccess(actor, message.forwardedFromId, tx);
     if (original.message.deletedAt || original.message.messageType === "forward" || !canForwardDiscussion(original.channel, source.channel)) continue;
    } catch (error) {
     if (error instanceof Error && error.message === "DISCUSSION_UNAVAILABLE") continue;
     throw error;
    }
   }
   currentContext.push(message.id);
   if (currentContext.length === 5) break;
  }
  currentContext.reverse().push(source.message.id);
  if (JSON.stringify(currentContext) !== JSON.stringify(snapshot.contextIds)) throw new Error("DISCUSSION_AI_SOURCE_CHANGED");
  const attachments = await tx.select({ id: discussionAttachments.id, messageId: discussionAttachments.messageId }).from(discussionAttachments)
   .where(and(inArray(discussionAttachments.messageId, [...expected.keys()]), eq(discussionAttachments.status, "attached"))).orderBy(asc(discussionAttachments.id)).for("share");
  for (const set of snapshot.attachmentSets) {
   const actual = attachments.filter(row => row.messageId === set.messageId).map(row => row.id).sort();
   if (JSON.stringify(actual) !== JSON.stringify([...set.ids].sort())) throw new Error("DISCUSSION_AI_SOURCE_CHANGED");
  }
  const [activeAttempt] = await tx.select({ id: studentQuizAttempts.id }).from(studentQuizAttempts)
   .where(and(eq(studentQuizAttempts.studentId, actor.id), eq(studentQuizAttempts.status, "in_progress"))).limit(1);
  if (activeAttempt) throw new Error("DISCUSSION_AI_SOURCE_CHANGED");
  const messageId = crypto.randomUUID(), now = new Date();
  await tx.update(discussionThreads).set({ nextSeq: sql`${discussionThreads.nextSeq} + 1`, answerCount: sql`${discussionThreads.answerCount} + 1`, lastActivityAt: now }).where(eq(discussionThreads.id, thread.id));
  await tx.insert(discussionMessages).values({ id: messageId, threadId: thread.id, authorId: null, kind: "zyra", messageType: "answer",
   body: body.trim(), seq: thread.nextSeq, revision: 1, requestId: `discussion-ai:${request.id}`, skinId: source.message.skinId, createdAt: now });
  await tx.update(discussionAiRequests).set({ status: "completed", answerMessageId: messageId, resultText: body.trim(), completedAt: now, updatedAt: now }).where(eq(discussionAiRequests.id, request.id));
  wakeOutbox("discussion/notifications.continue");
  await tx.insert(discussionEvents).values({ id: crypto.randomUUID(), channelId: source.channel.id, threadId: thread.id, messageId, actorId: actor.id, kind: "message",
   messageRevision: 1, participantThroughSeq: thread.nextSeq, recipientCursor: JSON.stringify({ phase: "direct", after: null, mentions: [] }) });
  await tx.update(discussionChannels).set({ countRevision: sql`${discussionChannels.countRevision} + 1` }).where(eq(discussionChannels.id, source.channel.id));
  return { messageId, threadId: thread.id };
 });
}
