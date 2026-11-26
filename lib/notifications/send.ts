/**
 * lib/notifications/send.ts
 *
 * Core server-side notification delivery layer.
 *
 * All functions in this file:
 * 1. Persist the inbox record for notifications that need one.
 * 2. Fetch registered tokens and dispatch them through FCM or APNs.
 * 3. Record delivery statistics on the inbox entry.
 * 4. Automatically remove tokens that FCM reports as invalid/expired.
 *
 * IMPORTANT: This module is server-only. It imports firebase-admin which
 * must never be bundled into client code.
 */

import { db } from "@/db";
import {
 userPushTokens,
 activityNotificationPreferences,
 notifications,
 enrollments,
 courses,
 user,
} from "@/db/schema";
import { and, asc, eq, gt, gte, inArray, sql } from "drizzle-orm";
import { adminMessaging } from "@/lib/firebase/admin";
import { randomUUID } from "crypto";
import { getUserLocalePreference } from "@/lib/i18n/preferences";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/locale";
import type { NotificationPayload, NotificationType, SendResult } from "./types";
import { sendApnsNotifications } from "./apns";
import { dispatchTokensByTransport, type PushTokenTarget } from "./dispatch";
import { deferQuietPushes, deferredSendResult } from "./quiet-delivery";
import {
 quizPublishedPayload,
 adminBroadcastPayload,
 renderNotificationPayload,
} from "./templates";

// ─── Delivery stats persisted on every notification row ───────────────────────
export interface DeliveryStats {
 attempted: number;
 succeeded: number;
 failedCount: number;
 sentAt: Date | null;
}

// ─── FCM error codes that signal an invalid / expired token ──────────────────
const INVALID_TOKEN_CODES = new Set([
 "messaging/registration-token-not-registered",
 "messaging/invalid-registration-token",
 "messaging/mismatched-credential",
]);

// ─── Internal: remove stale tokens from the database ─────────────────────────

async function pruneInvalidTokens(tokens: string[]): Promise<void> {
 if (tokens.length === 0) return;
 try {
 await db
 .delete(userPushTokens)
 .where(inArray(userPushTokens.token, tokens));
 console.log(`[FCM] Pruned ${tokens.length} invalid token(s).`);
 } catch (err) {
 console.error("[FCM] Failed to prune invalid tokens:", err);
 }
}

// ─── Internal: persist a notification row to the DB ──────────────────────────

async function persistNotification(
 notificationId: string,
 userId: string,
 payload: NotificationPayload,
): Promise<void> {
 await db.insert(notifications).values({
  id: notificationId,
  userId,
  title: payload.title,
  body: payload.body,
  type: payload.type,
  read: false,
  metadata: payload.metadata ?? {},
  attempted: 0,
  succeeded: 0,
  failedCount: 0,
  sentAt: null,
  createdAt: new Date(),
 });
}

// ─── Internal: send FCM multicast to a list of tokens ────────────────────────

export function getPushGroupKey(payload: NotificationPayload): string | undefined {
 if (payload.metadata?.groupKey === "quiet-digest") return "zyx:quiet-digest";
 if (payload.type === "discussion" && payload.metadata?.threadId) return `zyx:discussion:${payload.metadata.threadId}`;
 return payload.notificationId ? `zyx:${payload.notificationId}` : undefined;
}
function androidNotificationChannel(type: NotificationType): string {
 if (type === "discussion") return "zyx_discussions";
 if (type === "tutor_reminder" || type === "tutor_booking") return "zyx_schedule";
 if (["quiz_published", "quiz_graded", "flashcard_reminder", "weekly_progress", "study_reengagement", "tutor_digest"].includes(type)) return "zyx_learning";
 return "zyx_updates";
}
async function sendMulticast(
 tokens: string[],
 payload: NotificationPayload,
 prune = true,
): Promise<{ succeeded: number; failedTokens: string[]; errors: string[] }> {
 if (tokens.length === 0) {
 return { succeeded: 0, failedTokens: [], errors: [] };
 }

 const failedTokens: string[] = [];
 const errors: string[] = [];
 let succeeded = 0;

 // FCM sendEachForMulticast accepts up to 500 tokens at once
 const BATCH_SIZE = 500;
 for (let i = 0; i < tokens.length; i += BATCH_SIZE) {
 const batch = tokens.slice(i, i + BATCH_SIZE);

 try {
 const response = await adminMessaging().sendEachForMulticast({
 tokens: batch,
 notification: {
 title: payload.title,
 body: payload.body,
 imageUrl: payload.imageUrl,
 },
 data: {
 type: payload.type,
 url: payload.link ?? "/dashboard",
 ...(payload.notificationId ? { notificationId: payload.notificationId } : {}),
 ...(payload.metadata ?? {}),
 },
 webpush: {
 fcmOptions: { link: payload.link ?? "/dashboard" },
 notification: {
          icon: "/brand/zyx-app-192.png",
          badge: "/brand/zyx-logo-symbol-black@2x.png",
          tag: getPushGroupKey(payload),
          renotify: false,
 },
 },
 android: {
 priority: payload.type === "discussion" || payload.type === "tutor_reminder" || payload.type === "tutor_booking" ? "high" : "normal",
 notification: {
 channelId: androidNotificationChannel(payload.type),
 tag: getPushGroupKey(payload),
 sound: "default",
 },
 },
 apns: {
 payload: {
 aps: {
 sound: "default",
 },
 },
 },
 });

 response.responses.forEach((res, idx) => {
 if (res.success) {
 succeeded++;
 } else {
 const code = res.error?.code ?? "";
 if (INVALID_TOKEN_CODES.has(code)) {
 failedTokens.push(batch[idx]);
 } else {
 errors.push(`Push delivery: ${code}`);
 }
 }
 });
 } catch (err) {
 const message = err instanceof Error ? err.message : String(err);
 errors.push(`Batch ${i}-${i + BATCH_SIZE}: ${message}`);
 }
 }

 // Prune invalid tokens from the database
 if (prune) await pruneInvalidTokens(failedTokens);

 return { succeeded, failedTokens, errors };
}

// ─── Public: send to a single user ───────────────────────────────────────────

/**
 * Sends a push notification to all registered devices of one user.
 * Also persists a notification record in the database with the same ID
 * embedded in the push payload so native taps can mark it as read.
 */
export async function sendToUser(
 userId: string,
 payload: NotificationPayload,
 deliveryLocale?: Locale,
): Promise<SendResult> {
 if (payload.type === "flashcard_reminder") {
  const [preference] = await db.select({ enabled: activityNotificationPreferences.flashcardsEnabled })
   .from(activityNotificationPreferences).where(eq(activityNotificationPreferences.userId, userId));
  if (preference?.enabled === false) return { attempted: 0, succeeded: 0, failedTokens: [], errors: [] };
 }
 const locale = deliveryLocale ?? (payload.systemTemplate ? (await getUserLocalePreference(userId)) ?? DEFAULT_LOCALE : undefined);
 const renderedPayload = locale ? renderNotificationPayload(payload, locale) : payload;
 const notificationId = renderedPayload.notificationId ?? randomUUID();
 const payloadWithId: NotificationPayload = {
  ...renderedPayload,
  notificationId,
  metadata: {
   ...(renderedPayload.metadata ?? {}),
   notificationId,
  },
 };
 await persistNotification(notificationId, userId, payloadWithId);
 const result = await sendPushToUser(userId, payloadWithId);
 if (result.attempted > 0) {
  const delivery: DeliveryStats = {
   attempted: result.attempted,
   succeeded: result.succeeded,
   failedCount: result.failedTokens.length,
   sentAt: new Date(),
  };
  try {
   await db.update(notifications).set(delivery).where(eq(notifications.id, notificationId));
  } catch (err) {
   console.error("[FCM] Failed to persist notification delivery stats:", err);
   result.errors.push("NOTIFICATION_DELIVERY_STATS_UPDATE_FAILED");
  }
 }

 return result;
}

async function sendToTargets(
 targets: PushTokenTarget[],
 payload: NotificationPayload,
 prune = true,
): Promise<SendResult> {
 const result = await dispatchTokensByTransport(targets, payload, {
  sendFcm: (tokens, p) => sendMulticast(tokens, p, false),
  sendApns: (tokens, p) => sendApnsNotifications(tokens, p),
 });
 if (prune && result.failedTokens.length > 0) {
  await pruneInvalidTokens(result.failedTokens);
 }
 return result;
}

/** Sends an already rendered payload without creating an inbox row. */
export async function sendPushToUser(userId: string, renderedPayload: NotificationPayload): Promise<SendResult> {
 const deferred = await deferQuietPushes([{ userId, payload: renderedPayload }]);
 if (deferred.has(userId)) return deferredSendResult();
 return sendPushToUserNow(userId, renderedPayload);
}

// Keep pre-migration registrations until they can rebind; a bound token is
// deliverable only while its owning account session remains active.
function activePushSessionPredicate() {
 if (!userPushTokens.sessionId) return sql`true`;
 return sql`(${userPushTokens.sessionId} is null or exists (
  select 1 from "session" push_session
  where push_session.id = ${userPushTokens.sessionId}
   and push_session.user_id = ${userPushTokens.userId}
   and push_session.expires_at > now()
 ))`;
}

/** Internal immediate transport used by the quiet-hour worker after rechecking the schedule. */
export async function sendPushToUserNow(userId: string, renderedPayload: NotificationPayload): Promise<SendResult> {
 const hasTransportColumn = Boolean((userPushTokens as unknown as Record<string, unknown>).transport);
 const rows: PushTokenTarget[] = hasTransportColumn
  ? await db
    .select({ token: userPushTokens.token, transport: userPushTokens.transport })
    .from(userPushTokens)
    .where(and(eq(userPushTokens.userId, userId), activePushSessionPredicate()))
  : await db
    .select({ token: userPushTokens.token })
    .from(userPushTokens)
    .where(eq(userPushTokens.userId, userId));

 return sendToTargets(rows, renderedPayload, true);
}

export type PushPageResult = SendResult & { nextCursor?: string };

/** One durable page per recipient, at most 100 tokens each and ten recipients. */
export async function sendPushToUsers(items: { userId: string; payload: NotificationPayload; after?: string }[]): Promise<Map<string, PushPageResult>> {
 const results = new Map<string, PushPageResult>();
 if (!items.length) return results;
 const ids = items.map(item => item.userId);
 if (items.length > 10 || new Set(ids).size !== ids.length) throw new Error("INVALID_PUSH_RECIPIENT_BATCH");
 const deferred = await deferQuietPushes(items);
 for (const id of deferred) results.set(id, deferredSendResult());
 items = items.filter(item => !deferred.has(item.userId));
 if (!items.length) return results;
 const hasTransportColumn = Boolean((userPushTokens as unknown as Record<string, unknown>).transport);
 const rows = (await db.execute<{ id: string; userId: string; token: string; transport?: string }>(
  hasTransportColumn
   ? sql`
    select registry.id, recipient.user_id as "userId", registry.token, registry.transport
    from jsonb_to_recordset(${JSON.stringify(items.map(item => ({ user_id: item.userId, after_id: item.after ?? null })))}::jsonb) as recipient(user_id text, after_id text)
    cross join lateral (
     select id, token, transport from ${userPushTokens} where user_id = recipient.user_id
      and ${activePushSessionPredicate()}
      and (user_id, id) >= (recipient.user_id, coalesce(recipient.after_id, ''))
      and (recipient.after_id is null or id > recipient.after_id) order by user_id, id limit 101
    ) registry
   `
   : sql`
    select registry.id, recipient.user_id as "userId", registry.token
    from jsonb_to_recordset(${JSON.stringify(items.map(item => ({ user_id: item.userId, after_id: item.after ?? null })))}::jsonb) as recipient(user_id text, after_id text)
    cross join lateral (
     select id, token from ${userPushTokens} where user_id = recipient.user_id
      and ${activePushSessionPredicate()}
      and (user_id, id) >= (recipient.user_id, coalesce(recipient.after_id, ''))
      and (recipient.after_id is null or id > recipient.after_id) order by user_id, id limit 101
    ) registry
   `
 )).rows;
 const tokens = new Map<string, typeof rows>();
 for (const row of rows) {
  const userTokens = tokens.get(row.userId) ?? [];
  userTokens.push(row);
  tokens.set(row.userId, userTokens);
 }
 const invalid: string[] = [];
 for (let i = 0; i < items.length; i += 10) {
  await Promise.all(items.slice(i, i + 10).map(async ({ userId, payload }) => {
   const page = tokens.get(userId) ?? [];
   const userTargets = page.slice(0, 100).map(row => ({ token: row.token, transport: row.transport }));
   try {
    const result = await sendToTargets(userTargets, payload, false);
    invalid.push(...result.failedTokens);
    results.set(userId, { ...result, ...(result.errors.length === 0 && page.length > 100 ? { nextCursor: page[99].id } : {}) });
   } catch (error) {
    results.set(userId, { attempted: userTargets.length, succeeded: 0, failedTokens: [],
     errors: [error instanceof Error ? error.message : String(error)] });
   }
  }));
 }
 await pruneInvalidTokens(invalid);
 return results;
}

// ─── Public: send to multiple users ──────────────────────────────────────────

const SEND_CONCURRENCY = 10;
const BROADCAST_PAGE_SIZE = 100;

function addDeliveryResult(total: SendResult, result: SendResult) {
 total.attempted += result.attempted;
 total.succeeded += result.succeeded;
 total.failedTokens.push(...result.failedTokens);
 total.errors.push(...result.errors);
}

/** Sends to a bounded number of recipients at a time and records failures. */
export async function sendToMany(
 userIds: string[],
 payload: NotificationPayload,
 deliveryLocales?: Record<string, Locale>,
): Promise<SendResult> {
 const total: SendResult = { attempted: 0, succeeded: 0, failedTokens: [], errors: [] };
 for (let offset = 0; offset < userIds.length; offset += SEND_CONCURRENCY) {
  const batch = userIds.slice(offset, offset + SEND_CONCURRENCY);
  const results = await Promise.allSettled(batch.map(uid => sendToUser(uid, payload, deliveryLocales?.[uid])));
  for (const result of results) {
   if (result.status === "fulfilled") addDeliveryResult(total, result.value);
   else total.errors.push(result.reason instanceof Error ? result.reason.message : String(result.reason));
  }
 }
 return total;
}

/** Includes every registered account, even accounts without push tokens. */
export async function sendBroadcast(payload: NotificationPayload): Promise<SendResult> {
 const total: SendResult = { attempted: 0, succeeded: 0, failedTokens: [], errors: [] };
 let cursor: string | undefined;
 while (true) {
  const page: Array<{ id: string }> = await db.select({ id: user.id }).from(user)
   .where(cursor === undefined ? undefined : gt(user.id, cursor))
   .orderBy(asc(user.id))
   .limit(BROADCAST_PAGE_SIZE);
  if (page.length === 0) break;
  addDeliveryResult(total, await sendToMany(page.map(row => row.id), payload));
  if (page.length < BROADCAST_PAGE_SIZE) break;
  cursor = page[page.length - 1].id;
 }
 return total;
}

/**
 * Checks whether a user already received a notification of a given type with
 * the specified dedupeKey since `since`. Used by interval cron jobs to stay
 * idempotent across retries and overlapping windows.
 */
export async function hasRecentNotificationByDedupeKey(input: {
 userId: string;
 type: NotificationType;
 dedupeKey: string;
 since?: Date;
}): Promise<boolean> {
 const conditions = [
  eq(notifications.userId, input.userId),
  eq(notifications.type, input.type),
  sql`${notifications.metadata}->>'dedupeKey' = ${input.dedupeKey}`,
 ];
 if (input.since) {
  conditions.push(gte(notifications.createdAt, input.since));
 }
 const [row] = await db
  .select({ id: notifications.id })
  .from(notifications)
  .where(and(...conditions))
  .limit(1);
 return Boolean(row);
}

/**
 * Sends an essential transactional email (such as course activation or critical
 * operational alert) that bypasses optional marketing/reminder preferences.
 */
export async function sendTransactionalEmail(input: {
 userId: string;
 render: (locale: Locale, recipient: { name: string; email: string }) => { subject: string; html: string };
 locale?: Locale;
 from?: string;
}): Promise<{ status: "sent"; emailId: string } | { status: "skipped"; reason: string }> {
 if (!process.env.RESEND_API_KEY) {
  return { status: "skipped", reason: "resend_not_configured" };
 }
 const [recipient] = await db
  .select({ email: user.email, name: user.name })
  .from(user)
  .where(eq(user.id, input.userId))
  .limit(1);
 if (!recipient?.email) {
  return { status: "skipped", reason: "account_email_not_found" };
 }
 const locale = input.locale ?? (await getUserLocalePreference(input.userId)) ?? DEFAULT_LOCALE;
 const rendered = input.render(locale, { name: recipient.name ?? "Zyx Learner", email: recipient.email });
 const { resend } = await import("@/lib/resend");
 const { data, error } = await resend.emails.send({
  from: input.from ?? `Zyx Academy <${process.env.NEXT_PUBLIC_BRAND_EMAIL || "contact@zyxacademy.com"}>`,
  to: recipient.email,
  subject: rendered.subject,
  html: rendered.html,
 });
 if (error || !data?.id) {
  throw new Error(`TRANSACTIONAL_EMAIL_SEND_FAILED:${error?.message ?? "missing_email_id"}`);
 }
 return { status: "sent", emailId: data.id };
}

// ─── Domain-specific senders ──────────────────────────────────────────────────

/**
 * Notifies all students enrolled in a course that a new quiz is published.
 */
export async function sendQuizPublished(
 quizTitle: string,
 courseId: string,
 courseTitle: string,
 quizUrl: string
): Promise<SendResult> {
 const enrolled = await db
 .select({ userId: enrollments.userId })
 .from(enrollments)
 .where(eq(enrollments.courseId, courseId));

 const userIds = enrolled.map((e) => e.userId);
 const payload = quizPublishedPayload(quizTitle, courseTitle, quizUrl);
 return sendToMany(userIds, payload);
}

/**
 * Publish notifications are a best-effort side effect. The quiz status is
 * already persisted before this function is called, so notification failures
 * must never turn a successful publish into an HTTP 500 response.
 */
export async function notifyQuizPublishedBestEffort(input: {
 quizTitle: string;
 courseId: string;
 quizUrl: string;
 templateId?: string;
}): Promise<void> {
 try {
  const [courseRow] = await db
   .select({ title: courses.title })
   .from(courses)
   .where(eq(courses.id, input.courseId))
   .limit(1);

  const result = await sendQuizPublished(
   input.quizTitle,
   input.courseId,
   courseRow?.title ?? "mata kuliah",
   input.quizUrl,
  );

  if (result.errors.length > 0) {
   console.error("[FCM] Quiz publish notification completed with errors.", {
    templateId: input.templateId,
    courseId: input.courseId,
    errorCount: result.errors.length,
   });
  }
 } catch (error) {
  console.error("[FCM] Quiz publish notification failed.", {
   templateId: input.templateId,
   courseId: input.courseId,
   error: error instanceof Error ? error.message : String(error),
  });
 }
}

/**
 * Sends an admin-composed broadcast message.
 */
export async function sendAdminBroadcast(
 title: string,
 body: string,
 link: string,
 target: "all" | string[]
): Promise<SendResult> {
 const payload = adminBroadcastPayload(title, body, link);

 if (target === "all") {
  return sendBroadcast(payload);
 }

 return sendToMany(target, payload);
}
