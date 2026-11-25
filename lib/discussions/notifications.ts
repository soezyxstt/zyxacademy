import { createHash } from "node:crypto";
import { and, asc, eq, gt, inArray, isNull, lt, lte, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
 accountLocalePreferences, discussionChannels, discussionChannelPreferences, discussionEvents, discussionMessageObservations, discussionMessages,
 discussionNotificationDeliveries, discussionThreadParticipants, discussionThreadReads, discussionThreads, notifications, pengguna, penggunaPeran, peran,
} from "@/db/schema";
import { getDiscussionCandidateUserIdsPage } from "@/lib/discussions/access";
import { getDiscussionRecipientAccess } from "@/lib/discussions/recipient-access";
import { validDiscussionId } from "@/lib/discussions/policy";
import { DEFAULT_LOCALE, normalizeLocale } from "@/lib/i18n/locale";
import { discussionPayload, renderNotificationPayload } from "@/lib/notifications/templates";
import type { PushPageResult } from "@/lib/notifications/send";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Event = typeof discussionEvents.$inferSelect;
type Delivery = typeof discussionNotificationDeliveries.$inferSelect;
type Phase = "direct" | "participants" | "staff" | "push" | "work";
type Cursor = { phase: Phase; after: string | null; mentions?: string[]; legacyParticipantsRestarted?: true };
const PAGE_SIZE = 100;
const LEASE_MS = 5 * 60 * 1000;

export function discussionNotificationId(eventId: string, userId: string) {
 const hash = createHash("sha256").update(JSON.stringify(["discussion", eventId, userId])).digest("hex");
 return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-${((parseInt(hash[16], 16) & 3) | 8).toString(16)}${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

/** Call within the same transaction as the monotonic thread-read update. */
export async function clearDiscussionNotificationsThroughSeq(tx: Tx, input: { userId: string; threadId: string; throughSeq: number }) {
 await tx.select({ id: discussionThreads.id }).from(discussionThreads)
  .where(eq(discussionThreads.id, input.threadId)).for("update");
 await tx.update(notifications).set({ read: true }).where(and(
  eq(notifications.userId, input.userId), eq(notifications.type, "discussion"), eq(notifications.read, false),
  sql`${notifications.metadata}->>'threadId' = ${input.threadId}`,
  sql`coalesce(${notifications.metadata}->>'eventKind', '') <> 'report'`,
  sql`exists (select 1 from ${discussionEvents} event
   where event.id = ${notifications.metadata}->>'eventId' and event.thread_id = ${input.threadId}
    and case when event.kind = 'resolved' then
     (case when ${notifications.metadata}->>'seq' ~ '^[0-9]{1,15}$' then (${notifications.metadata}->>'seq')::numeric <= ${input.throughSeq} else false end)
     and event.status_revision is not null and exists (
     select 1 from ${discussionThreadReads} seen where seen.user_id = ${input.userId}
      and seen.thread_id = event.thread_id and seen.seen_status_revision >= event.status_revision)
    when event.kind in ('question', 'message', 'edit', 'delete') then event.message_revision is not null and exists (
     select 1 from ${discussionMessageObservations} seen where seen.user_id = ${input.userId}
      and seen.message_id = event.message_id and seen.revision >= event.message_revision)
    else false end)`,
 ));
}

function eligibleEvents() {
 const now = new Date();
 return or(
  and(or(eq(discussionEvents.status, "pending"), eq(discussionEvents.status, "failed")), lte(discussionEvents.retryAt, now)),
  and(eq(discussionEvents.status, "processing"), or(isNull(discussionEvents.processedAt), lt(discussionEvents.processedAt, new Date(now.getTime() - LEASE_MS)))),
 );
}

async function claimEvent(excluded: string[]): Promise<Event | undefined> {
 return db.transaction(async tx => {
  const [row] = await tx.select().from(discussionEvents).where(and(
   eligibleEvents(), excluded.length ? notInArray(discussionEvents.id, excluded) : undefined,
  )).orderBy(asc(discussionEvents.retryAt), asc(discussionEvents.createdAt), asc(discussionEvents.id)).limit(1).for("update", { skipLocked: true });
  if (!row) return undefined;
  const [claimed] = await tx.update(discussionEvents).set({
   status: "processing", processedAt: new Date(), errorCode: null,
  }).where(eq(discussionEvents.id, row.id)).returning();
  return claimed;
 });
}

function lease(event: Event) {
 if (!event.processedAt) throw new Error("DISCUSSION_LEASE_LOST");
 return and(eq(discussionEvents.id, event.id), eq(discussionEvents.status, "processing"), eq(discussionEvents.processedAt, event.processedAt));
}

async function heartbeat(event: Event) {
 const [owned] = await db.update(discussionEvents).set({ processedAt: new Date() }).where(lease(event))
  .returning({ processedAt: discussionEvents.processedAt });
 if (!owned?.processedAt) throw new Error("DISCUSSION_LEASE_LOST");
 event.processedAt = owned.processedAt;
}

async function finish(event: Event, result: { cursor?: Cursor; failed?: boolean; errorCode?: string } = {}) {
 const attempts = result.failed ? Math.min(event.attempts + 1, 2147483647) : event.attempts;
 const delay = result.failed ? Math.min(15 * 60_000, 30_000 * 2 ** Math.min(attempts - 1, 5)) : 0;
 const [updated] = await db.update(discussionEvents).set({
  status: result.failed ? "failed" : result.cursor ? "pending" : "completed",
  recipientCursor: result.cursor ? JSON.stringify(result.cursor) : event.recipientCursor,
  attempts, retryAt: new Date(Date.now() + delay),
  processedAt: result.cursor && !result.failed ? null : new Date(),
  errorCode: result.failed ? result.errorCode ?? "DISCUSSION_DELIVERY_FAILED" : null,
 }).where(lease(event)).returning({ id: discussionEvents.id });
 if (!updated) throw new Error("DISCUSSION_LEASE_LOST");
}

function retryDelay(attempts: number) {
 return Math.min(15 * 60_000, 30_000 * 2 ** Math.min(attempts - 1, 5));
}

function infrastructureFailure(error: unknown): boolean {
 let current = error;
 for (let i = 0; i < 4 && current && typeof current === "object"; i++) {
  const value = current as { code?: unknown; cause?: unknown };
  const code = typeof value.code === "string" ? value.code : "";
  if (/^(08|53|57P0|40P01|40001|ECONN|ETIMEDOUT)/.test(code)) return true;
  current = value.cause;
 }
 return false;
}

async function ownLease(tx: Tx, event: Event) {
 const [owned] = await tx.select({ id: discussionEvents.id }).from(discussionEvents).where(lease(event)).for("share");
 if (!owned) throw new Error("DISCUSSION_LEASE_LOST");
}

async function recipientState(client: Pick<Tx, "select">, event: Event, ids: string[]) {
 const preferences = await client.select().from(discussionChannelPreferences).where(and(
  eq(discussionChannelPreferences.channelId, event.channelId), inArray(discussionChannelPreferences.userId, ids),
 ));
 const reads = event.kind === "report" ? [] : await client.select().from(discussionThreadReads).where(and(
  eq(discussionThreadReads.threadId, event.threadId), inArray(discussionThreadReads.userId, ids),
 ));
 const observations = event.kind !== "report" && event.messageId && event.messageRevision != null
  ? await client.select().from(discussionMessageObservations).where(and(
   eq(discussionMessageObservations.messageId, event.messageId), inArray(discussionMessageObservations.userId, ids))) : [];
 const locales = await client.select().from(accountLocalePreferences).where(inArray(accountLocalePreferences.userId, ids));
 return {
  preferences: new Map(preferences.map(row => [row.userId, row])),
  reads: new Map(reads.map(row => [row.userId, row])),
  observations: new Map(observations.map(row => [row.userId, row.revision])),
  locales: new Map(locales.map(row => [row.userId, normalizeLocale(row.locale) ?? DEFAULT_LOCALE])),
 };
}

function allowedByState(event: Event, userId: string, seq: number, state: Awaited<ReturnType<typeof recipientState>>) {
 const preference = state.preferences.get(userId);
 // Event timestamps can predate preference changes that happened before the event acquired its thread lock.
 if (preference?.muted) return false;
 if (event.kind === "report") return true;
 const read = state.reads.get(userId);
 if (event.kind === "resolved") return !read || read.throughSeq < seq || event.statusRevision == null || read.seenStatusRevision == null || read.seenStatusRevision < event.statusRevision;
 if (event.kind === "question" || event.kind === "message" || event.kind === "edit" || event.kind === "delete") {
  const revision = state.observations.get(userId);
  return event.messageRevision == null || revision == null || revision < event.messageRevision;
 }
 return true;
}

async function failDelivery(event: Event, row: Delivery) {
 const attempts = Math.min(row.attempts + 1, 2147483647);
 await db.transaction(async tx => {
  await ownLease(tx, event);
  await tx.update(discussionNotificationDeliveries).set({ attempts, retryAt: new Date(Date.now() + retryDelay(attempts)) }).where(and(
   eq(discussionNotificationDeliveries.eventId, event.id), eq(discussionNotificationDeliveries.userId, row.userId),
  ));
 });
}

/** A failed batch is split until the failing recipient is durably isolated. */
function isPushTransportConfigured(): boolean {
 return Boolean(
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
  (process.env.APNS_KEY_ID?.trim() &&
   process.env.APNS_TEAM_ID?.trim() &&
   process.env.APNS_PRIVATE_KEY?.trim() &&
   process.env.APNS_BUNDLE_ID?.trim()),
 );
}

async function deliverBatch(event: Event, rows: Delivery[], seq: number, excludedId: string | null): Promise<void> {
 if (!rows.length) return;
 try {
  await db.transaction(async tx => {
   await ownLease(tx, event);
   const [thread] = await tx.select({ id: discussionThreads.id }).from(discussionThreads)
    .where(eq(discussionThreads.id, event.threadId)).for("update");
   if (!thread) throw new Error("DISCUSSION_SOURCE_MISSING");
   const ids = rows.map(row => row.userId).filter(id => id !== excludedId);
   if (ids.length) {
    const actors = await getDiscussionRecipientAccess(event.channelId, ids, tx);
    const state = await recipientState(tx, event, ids);
    const values: Array<typeof notifications.$inferInsert> = [];
    for (const row of rows) {
     const actor = actors.get(row.userId);
     if (!actor || (event.kind === "report" ? actor.role !== "admin" : row.staffOnly && actor.role === "student")
      || !allowedByState(event, row.userId, seq, state)) continue;
     const payload = renderNotificationPayload(discussionPayload({
      role: actor.role, channelId: event.channelId, threadId: event.threadId, messageId: event.messageId, seq, report: event.kind === "report",
     }), state.locales.get(row.userId) ?? DEFAULT_LOCALE);
     values.push({
      id: discussionNotificationId(event.id, row.userId), userId: row.userId, type: "discussion",
      title: payload.title, body: payload.body, read: false, createdAt: event.createdAt,
      metadata: { ...payload.metadata, eventAt: event.createdAt.toISOString(), eventId: event.id, eventKind: event.kind,
       staffOnly: row.staffOnly, pushState: isPushTransportConfigured() ? "pending" : "done" },
     });
    }
    if (values.length) await tx.insert(notifications).values(values).onConflictDoNothing();
   }
   await tx.delete(discussionNotificationDeliveries).where(and(
    eq(discussionNotificationDeliveries.eventId, event.id), inArray(discussionNotificationDeliveries.userId, rows.map(row => row.userId)),
   ));
  });
 } catch (error) {
  if ((error instanceof Error && error.message === "DISCUSSION_LEASE_LOST") || infrastructureFailure(error)) throw error;
  if (rows.length === 1) return failDelivery(event, rows[0]);
  const middle = Math.floor(rows.length / 2);
  await deliverBatch(event, rows.slice(0, middle), seq, excludedId);
  await deliverBatch(event, rows.slice(middle), seq, excludedId);
 }
}

async function queueRecipients(event: Event, ids: string[], staffOnly: boolean, seq: number, excludedId: string | null) {
 const candidates = [...new Set(ids.filter(id => id !== excludedId && validDiscussionId(id)))];
 if (!candidates.length) return;
 // Commit candidates before the event cursor can advance, including recipients that cannot yet be authorized.
 const rows = await db.transaction(async tx => {
  await ownLease(tx, event);
  return tx.insert(discussionNotificationDeliveries).values(candidates.map(userId => ({
   eventId: event.id, userId, staffOnly,
  }))).onConflictDoNothing().returning();
 });
 await deliverBatch(event, rows, seq, excludedId);
}

type InboxRow = typeof notifications.$inferSelect;

async function writePushOutcomes(rows: { id: string; result: PushPageResult }[]): Promise<void> {
 if (!rows.length) return;
 const sentAt = new Date().toISOString();
 try {
  await db.execute(sql`update ${notifications} as n set
   attempted = n.attempted + outcome.attempted::integer, succeeded = n.succeeded + outcome.succeeded::integer,
   failed_count = n.failed_count + outcome.failed_count::integer, sent_at = coalesce(outcome.sent_at::timestamptz, n.sent_at),
   metadata = n.metadata || jsonb_build_object('pushContinue', outcome.next_cursor is not null)
    || case when outcome.next_cursor is not null then jsonb_build_object('pushCursor', outcome.next_cursor)
     when outcome.done::boolean then '{"pushState":"done"}'::jsonb else '{}'::jsonb end
   from (values ${sql.join(rows.map(({ id, result }) => sql`(${id}, ${result.attempted}, ${result.succeeded},
    ${result.attempted - result.succeeded}, ${result.attempted ? sentAt : null}, ${result.errors.length === 0}, ${result.nextCursor ?? null})`), sql`, `)})
   as outcome(id, attempted, succeeded, failed_count, sent_at, done, next_cursor) where n.id = outcome.id`);
 } catch (error) {
  if (infrastructureFailure(error)) throw error;
  if (rows.length === 1) return;
  const middle = Math.floor(rows.length / 2);
  await writePushOutcomes(rows.slice(0, middle));
  await writePushOutcomes(rows.slice(middle));
 }
}

/** Push remains at-least-once when the provider acknowledgement is uncertain. */
async function pushBatch(event: Event, rows: InboxRow[], seq: number, excludedId: string | null): Promise<void> {
 if (!rows.length) return;
 await heartbeat(event);
 try {
  if (!isPushTransportConfigured()) {
   await db.update(notifications).set({ metadata: sql`${notifications.metadata} || '{"pushState":"done"}'::jsonb` })
    .where(inArray(notifications.id, rows.map(row => row.id)));
   return;
  }
  const ids = rows.map(row => row.userId).filter(id => id !== excludedId);
  const actors = await getDiscussionRecipientAccess(event.channelId, ids);
  const state = ids.length ? await recipientState(db, event, ids) : null;
  const eligible = rows.filter(row => {
   const actor = actors.get(row.userId);
   const metadata = row.metadata as Record<string, unknown>;
   return actor && !row.read && state && allowedByState(event, row.userId, seq, state)
    && (event.kind === "report" ? actor.role === "admin" : metadata.staffOnly !== true || actor.role !== "student");
  });
  const allowed = new Set(eligible.map(row => row.id));
  const dropped = rows.filter(row => !allowed.has(row.id)).map(row => row.id);
  if (dropped.length) await db.update(notifications).set({ metadata: sql`${notifications.metadata} || '{"pushState":"done"}'::jsonb` })
   .where(inArray(notifications.id, dropped));
  if (!eligible.length) return;
  const { sendPushToUsers } = await import("@/lib/notifications/send");
  const items = eligible.map(row => {
   const actor = actors.get(row.userId)!;
   const metadata = row.metadata as Record<string, unknown>;
   const payload = renderNotificationPayload(discussionPayload({
    role: actor.role, channelId: event.channelId, threadId: event.threadId, messageId: event.messageId, seq, report: event.kind === "report",
   }), state!.locales.get(row.userId) ?? DEFAULT_LOCALE);
   return { userId: row.userId, payload: { ...payload, notificationId: row.id }, ...(typeof metadata.pushCursor === "string" ? { after: metadata.pushCursor } : {}) };
  });
  const results = await sendPushToUsers(items);
  await writePushOutcomes(eligible.map(row => ({ id: row.id, result: results.get(row.userId)! })));
 } catch (error) {
  if ((error instanceof Error && error.message === "DISCUSSION_LEASE_LOST") || infrastructureFailure(error)) throw error;
  if (rows.length === 1) return;
  const middle = Math.floor(rows.length / 2);
  await pushBatch(event, rows.slice(0, middle), seq, excludedId);
  await pushBatch(event, rows.slice(middle), seq, excludedId);
 }
}

function cursorFor(event: Event): Cursor {
 if (!event.recipientCursor) return { phase: event.kind === "report" ? "staff" : "direct", after: null };
 try {
  const cursor = JSON.parse(event.recipientCursor) as Cursor;
  if (["direct", "participants", "staff", "push", "work"].includes(cursor.phase) && (cursor.after === null || validDiscussionId(cursor.after))
   && (cursor.phase !== "work" || cursor.after === null)
   && (event.kind !== "report" || cursor.phase === "staff" || cursor.phase === "push" || cursor.phase === "work")
   && (cursor.legacyParticipantsRestarted === undefined || cursor.legacyParticipantsRestarted === true)
   && (cursor.mentions === undefined || (Array.isArray(cursor.mentions) && cursor.mentions.length <= 10 && cursor.mentions.every(validDiscussionId)))) return cursor;
 } catch { /* Invalid durable progress must not complete the event. */ }
 throw new Error("DISCUSSION_INVALID_CURSOR");
}

async function adminPage(after: string | null) {
 const rows = await db.selectDistinct({ id: pengguna.id }).from(pengguna)
  .innerJoin(penggunaPeran, eq(penggunaPeran.penggunaId, pengguna.id)).innerJoin(peran, eq(peran.id, penggunaPeran.peranId))
  .where(and(eq(pengguna.status, "active"), eq(peran.code, "admin"), after ? gt(pengguna.id, after) : undefined))
  .orderBy(asc(pengguna.id)).limit(PAGE_SIZE + 1);
 return { items: rows.slice(0, PAGE_SIZE).map(row => row.id), nextCursor: rows.length > PAGE_SIZE ? rows[PAGE_SIZE - 1].id : null };
}

function excludedSender(event: Event, message: typeof discussionMessages.$inferSelect | undefined): string | null {
 if (!message || (event.kind !== "question" && event.kind !== "message")) return event.actorId;
 if (message.kind === "zyra" && message.authorId === null) return null;
 if (message.kind === "human" && message.authorId) return message.authorId;
 throw new Error("DISCUSSION_INVALID_MESSAGE_AUTHOR");
}

async function processEvent(event: Event): Promise<{ cursor?: Cursor; failed?: boolean }> {
 const [source] = await db.select({ channel: discussionChannels, thread: discussionThreads }).from(discussionThreads)
  .innerJoin(discussionChannels, eq(discussionChannels.id, discussionThreads.channelId))
  .where(and(eq(discussionThreads.id, event.threadId), eq(discussionChannels.id, event.channelId))).limit(1);
 if (!source) throw new Error("DISCUSSION_SOURCE_MISSING");
 const [message] = event.messageId ? await db.select().from(discussionMessages).where(and(
  eq(discussionMessages.id, event.messageId), eq(discussionMessages.threadId, event.threadId),
 )).limit(1) : [];
 if (event.kind !== "resolved" && !message) throw new Error("DISCUSSION_MESSAGE_MISSING");
 const [latest] = message ? [message] : event.participantThroughSeq != null ? [{ seq: event.participantThroughSeq }]
  : await db.select({ seq: sql<number>`coalesce(max(${discussionMessages.seq}), 0)` }).from(discussionMessages).where(and(
   eq(discussionMessages.threadId, event.threadId), lte(discussionMessages.createdAt, event.createdAt),
  ));
 const seq = Number(latest?.seq ?? 0);
 const savedCursor = cursorFor(event);
 // Old progress may have skipped earlier participants using timestamp filtering.
 const cursor: Cursor = event.kind !== "report" && event.participantThroughSeq == null && !savedCursor.legacyParticipantsRestarted
  ? savedCursor.phase === "direct" ? { ...savedCursor, legacyParticipantsRestarted: true }
   : { phase: "participants", after: null, legacyParticipantsRestarted: true }
  : savedCursor;
 const excludedId = excludedSender(event, message);
 await heartbeat(event);
 if (cursor.phase === "direct" && cursor.mentions === undefined && message?.editedAt
  && (event.kind === "question" || event.kind === "message") && message.editedAt >= event.createdAt)
  throw new Error("DISCUSSION_MENTION_SNAPSHOT_MISSING");
 if (cursor.phase === "push") {
  const pending = and(eq(notifications.type, "discussion"), sql`${notifications.metadata}->>'eventId' = ${event.id}`,
   sql`${notifications.metadata}->>'pushState' = 'pending'`);
  const rows = await db.select().from(notifications).where(and(pending, cursor.after ? gt(notifications.userId, cursor.after) : undefined))
   .orderBy(asc(notifications.userId)).limit(PAGE_SIZE + 1);
  const page = rows.slice(0, PAGE_SIZE);
  const chunk = isPushTransportConfigured() ? 10 : PAGE_SIZE;
  for (let i = 0; i < page.length; i += chunk) await pushBatch(event, page.slice(i, i + chunk), seq, excludedId);
  if (rows.length > PAGE_SIZE) return { cursor: { ...cursor, phase: "push", after: rows[PAGE_SIZE - 1].userId } };
  return { cursor: { ...cursor, phase: "work", after: null } };
 }
 if (cursor.phase === "work") {
  const due = await db.select().from(discussionNotificationDeliveries).where(and(
   eq(discussionNotificationDeliveries.eventId, event.id), lte(discussionNotificationDeliveries.retryAt, new Date()),
  )).orderBy(asc(discussionNotificationDeliveries.retryAt), asc(discussionNotificationDeliveries.userId)).limit(PAGE_SIZE);
  if (due.length) {
   await deliverBatch(event, due, seq, excludedId);
   return { cursor: { ...cursor, phase: "work", after: null } };
  }
  const [remaining] = await db.select({ userId: discussionNotificationDeliveries.userId }).from(discussionNotificationDeliveries)
   .where(eq(discussionNotificationDeliveries.eventId, event.id)).limit(1);
  const [continuation] = await db.select({ id: notifications.id }).from(notifications).where(and(
   eq(notifications.type, "discussion"), sql`${notifications.metadata}->>'eventId' = ${event.id}`,
   sql`${notifications.metadata}->>'pushState' = 'pending'`, sql`${notifications.metadata}->>'pushContinue' = 'true'`,
  )).limit(1);
  if (continuation) return { cursor: { ...cursor, phase: "push", after: null } };
  const [pending] = await db.select({ id: notifications.id }).from(notifications).where(and(
   eq(notifications.type, "discussion"), sql`${notifications.metadata}->>'eventId' = ${event.id}`,
   sql`${notifications.metadata}->>'pushState' = 'pending'`,
  )).limit(1);
  return remaining || pending ? { cursor: { ...cursor, phase: pending ? "push" : "work", after: null }, failed: true } : {};
 }
 let items: string[], nextCursor: string | null;
 if (cursor.phase === "direct") {
  const mentions = cursor.mentions ?? message?.mentionIds ?? [];
  if (!Array.isArray(mentions) || mentions.length > 10 || !mentions.every(validDiscussionId)) throw new Error("DISCUSSION_INVALID_MENTIONS");
  const [reply] = message?.replyToId ? await db.select({ authorId: discussionMessages.authorId }).from(discussionMessages).where(and(
   eq(discussionMessages.id, message.replyToId), eq(discussionMessages.threadId, event.threadId),
  )).limit(1) : [];
  const all = [...new Set([source.thread.authorId, reply?.authorId, ...mentions]
   .filter((id): id is string => typeof id === "string" && id.length > 0))].sort().filter(id => !cursor.after || id > cursor.after);
  items = all.slice(0, PAGE_SIZE);
  nextCursor = all.length > PAGE_SIZE ? items[items.length - 1] : null;
 } else if (cursor.phase === "participants") {
  // A legacy event has no reliable historical boundary, so include current participants.
  const rows = await db.select({ userId: discussionThreadParticipants.userId }).from(discussionThreadParticipants).where(and(
   eq(discussionThreadParticipants.threadId, event.threadId),
   event.participantThroughSeq != null ? lte(discussionThreadParticipants.firstSeq, event.participantThroughSeq) : undefined,
   cursor.after ? gt(discussionThreadParticipants.userId, cursor.after) : undefined,
  )).orderBy(asc(discussionThreadParticipants.userId)).limit(PAGE_SIZE + 1);
  items = rows.slice(0, PAGE_SIZE).map(row => row.userId);
  nextCursor = rows.length > PAGE_SIZE ? items[items.length - 1] : null;
 } else {
  ({ items, nextCursor } = event.kind === "report" ? await adminPage(cursor.after)
   : await getDiscussionCandidateUserIdsPage(event.channelId, { cursor: cursor.after, limit: PAGE_SIZE }));
 }
 await queueRecipients(event, items, cursor.phase === "staff", seq, excludedId);
 if (nextCursor) return { cursor: { ...cursor, after: nextCursor } };
 if (cursor.phase === "direct") return { cursor: { ...cursor, phase: "participants", after: null } };
 if (cursor.phase === "participants" && event.kind === "question" && (source.channel.kind === "technical" || source.channel.kind === "academic"))
  return { cursor: { ...cursor, phase: "staff", after: null } };
 return { cursor: { ...cursor, phase: "push", after: null } };
}

export async function dispatchDiscussionEvents(input: { limit?: number } = {}) {
 const limit = Math.min(50, Math.max(1, Math.floor(input.limit ?? 20) || 20));
 const excluded: string[] = [];
 let processed = 0;
 let failed = 0;
 while (excluded.length < limit) {
  const event = await claimEvent(excluded);
  if (!event) break;
  excluded.push(event.id);
  try {
   const result = await processEvent(event);
   await finish(event, result);
   if (result.failed) failed++;
   else if (!result.cursor) processed++;
  } catch (error) {
   if (!(error instanceof Error && error.message === "DISCUSSION_LEASE_LOST")) await finish(event, {
    failed: true, errorCode: error instanceof Error && error.message === "DISCUSSION_MENTION_SNAPSHOT_MISSING" ? error.message : undefined,
   });
   failed++;
  }
 }
 const [more] = await db.select({ id: discussionEvents.id }).from(discussionEvents).where(eligibleEvents()).limit(1);
 return { processed, failed, hasMore: Boolean(more) };
}
