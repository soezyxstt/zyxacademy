/**
 * lib/notifications/send.ts
 *
 * Core server-side notification delivery layer.
 *
 * All functions in this file:
 * 1. Fetch FCM tokens from the database for the target user(s).
 * 2. Send via Firebase Admin SDK (multicast for efficiency).
 * 3. Persist a record to the `notifications` table.
 * 4. Automatically remove tokens that FCM reports as invalid/expired.
 *
 * IMPORTANT: This module is server-only. It imports firebase-admin which
 * must never be bundled into client code.
 */

import { db } from "@/db";
import {
 userPushTokens,
 notifications,
 enrollments,
 courses,
} from "@/db/schema";
import { eq, inArray } from "drizzle-orm";
import { adminMessaging } from "@/lib/firebase/admin";
import { randomUUID } from "crypto";
import type { NotificationPayload, SendResult } from "./types";
import {
 quizPublishedPayload,
 adminBroadcastPayload,
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
 userId: string,
 payload: NotificationPayload,
 delivery: DeliveryStats
): Promise<void> {
 try {
  await db.insert(notifications).values({
  id: randomUUID(),
  userId,
  title: payload.title,
  body: payload.body,
  type: payload.type,
  read: false,
  metadata: (payload.metadata ?? {}) as Record<string, unknown>,
  attempted: delivery.attempted,
  succeeded: delivery.succeeded,
  failedCount: delivery.failedCount,
  sentAt: delivery.sentAt,
  createdAt: new Date(),
  });
 } catch (err) {
  // Non-fatal ; push was already sent; log and continue.
  console.error("[FCM] Failed to persist notification record:", err);
 }
}

// ─── Internal: send FCM multicast to a list of tokens ────────────────────────

async function sendMulticast(
 tokens: string[],
 payload: NotificationPayload
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
 ...(payload.metadata ?? {}),
 },
 webpush: {
 fcmOptions: { link: payload.link ?? "/dashboard" },
 notification: {
          icon: "/brand/zyx-app-192.png",
          badge: "/brand/zyx-logo-symbol-black@2x.png",
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
 errors.push(`Token ${batch[idx]}: ${code}`);
 }
 }
 });
 } catch (err) {
 const message = err instanceof Error ? err.message : String(err);
 errors.push(`Batch ${i}-${i + BATCH_SIZE}: ${message}`);
 }
 }

 // Prune invalid tokens from the database
 await pruneInvalidTokens(failedTokens);

 return { succeeded, failedTokens, errors };
}

// ─── Public: send to a single user ───────────────────────────────────────────

/**
 * Sends a push notification to all registered devices of one user.
 * Also persists a notification record in the database.
 */
export async function sendToUser(
 userId: string,
 payload: NotificationPayload
): Promise<SendResult> {
 const rows = await db
 .select({ token: userPushTokens.token })
 .from(userPushTokens)
 .where(eq(userPushTokens.userId, userId));

 const tokens = rows.map((r) => r.token);
 const result = await sendMulticast(tokens, payload);

 // Persist one notification record per user (not per token)
 await persistNotification(userId, payload, {
  attempted: tokens.length,
  succeeded: result.succeeded,
  failedCount: result.failedTokens.length,
  sentAt: tokens.length > 0 ? new Date() : null,
 });

 return {
 attempted: tokens.length,
 succeeded: result.succeeded,
 failedTokens: result.failedTokens,
 errors: result.errors,
 };
}

// ─── Public: send to multiple users ──────────────────────────────────────────

/**
 * Sends a notification to multiple users concurrently.
 * Uses Promise.allSettled so one failure doesn't block the rest.
 */
export async function sendToMany(
 userIds: string[],
 payload: NotificationPayload
): Promise<SendResult> {
 const results = await Promise.allSettled(
 userIds.map((uid) => sendToUser(uid, payload))
 );

 return results.reduce<SendResult>(
 (acc, r) => {
 if (r.status === "fulfilled") {
 acc.attempted += r.value.attempted;
 acc.succeeded += r.value.succeeded;
 acc.failedTokens.push(...r.value.failedTokens);
 acc.errors.push(...r.value.errors);
 } else {
 acc.errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
 }
 return acc;
 },
 { attempted: 0, succeeded: 0, failedTokens: [], errors: [] }
 );
}

// ─── Public: broadcast to all users with tokens ──────────────────────────────

/**
 * Sends a notification to every user who has at least one registered FCM token.
 * Designed for admin broadcast use cases.
 */
export async function sendBroadcast(payload: NotificationPayload): Promise<SendResult> {
 // Fetch distinct userIds that have tokens registered
 const rows = await db
 .selectDistinct({ userId: userPushTokens.userId })
 .from(userPushTokens);

 const userIds = rows.map((r) => r.userId);
 return sendToMany(userIds, payload);
}

// ─── Domain-specific senders ──────────────────────────────────────────────────

/**
 * Notifies all students enrolled in a course that a new quiz is published.
 *
 * @param quizTitle - Title of the quiz.
 * @param courseId - Course ID to find enrolled students.
 * @param courseTitle - Human-readable course title.
 * @param quizUrl - Deep link to the quiz.
 */
export async function sendQuizPublished(
 quizTitle: string,
 courseId: string,
 courseTitle: string,
 quizUrl: string
): Promise<SendResult> {
 // Find all enrolled students for this course
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
 *
 * @param title - Notification title.
 * @param body - Notification body.
 * @param link - Optional URL to open on click.
 * @param target - "all" | specific userIds[].
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
