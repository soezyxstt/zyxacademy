import { db } from "@/db";
import { activityNotificationPreferences, deferredNotificationPushes, notificationQuietPreferences, notifications, pengguna, penggunaPeran, peran, tutorSlots, user } from "@/db/schema";
import { and, eq, exists, gte, inArray, isNull, lte, notExists, or, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { enqueueTask } from "@/lib/queue/cloud-tasks";
import { DEFAULT_QUIET_HOURS, quietHoursEnd, type QuietHours } from "./quiet-hours";
import { getUserLocalePreference } from "@/lib/i18n/preferences";
import { notificationVisibility } from "./discussion-history";
import { getDefaultHomeLinkForRole } from "./catalog";
import type { NotificationPayload } from "./types";
import { getDeferredAvailabilityReminderWeek } from "./tutorial-reminder-policy";

const noDelivery = { attempted: 0, succeeded: 0, failedTokens: [], errors: [] };
const leaseAvailable = (now: Date) => or(isNull(deferredNotificationPushes.leaseUntil), lte(deferredNotificationPushes.leaseUntil, now));
export async function getQuietHours(userId: string): Promise<QuietHours> {
 const [row] = await db.select().from(notificationQuietPreferences).where(eq(notificationQuietPreferences.userId, userId)).limit(1);
 return row ? { enabled: row.enabled, startMinute: row.startMinute, endMinute: row.endMinute, timeZone: row.timeZone } : { ...DEFAULT_QUIET_HOURS };
}

export async function scheduleQuietFlush(userId: string, due: Date, reason = "window") {
 try {
  await enqueueTask({ name: "notifications/quiet.flush", id: `quiet:${userId}:${due.getTime()}:${reason}`,
   data: { userId }, delaySeconds: Math.max(0, Math.ceil((due.getTime() - Date.now()) / 1000)) });
 } catch {
  // The durable queue is authoritative; hourly recovery retries failed scheduling.
  console.error("[notifications] Could not schedule quiet-hour flush");
 }
}

export async function saveQuietHours(userId: string, preference: QuietHours): Promise<QuietHours> {
 const now = new Date();
 await db.insert(notificationQuietPreferences).values({ userId, ...preference, updatedAt: now })
  .onConflictDoUpdate({ target: notificationQuietPreferences.userId, set: { ...preference, updatedAt: now } });
 const due = quietHoursEnd(preference, now) ?? now;
 const pending = await db.update(deferredNotificationPushes).set({ deliverAfter: due })
  .where(and(eq(deferredNotificationPushes.userId, userId), leaseAvailable(now))).returning({ id: deferredNotificationPushes.notificationId });
 if (pending.length) await scheduleQuietFlush(userId, due, "preference-change");
 return preference;
}

/** Only defer persisted inbox rows, so retries do not create duplicates or lose notification contents. */
export async function deferQuietPushes(items: { userId: string; payload: NotificationPayload; after?: string }[]): Promise<Set<string>> {
 const candidates = items.filter(item => item.payload.notificationId && !item.after);
 if (!candidates.length) return new Set();
 const now = new Date();
 const prefs = await db.select().from(notificationQuietPreferences)
  .where(and(inArray(notificationQuietPreferences.userId, [...new Set(candidates.map(item => item.userId))]), eq(notificationQuietPreferences.enabled, true)));
 const byUser = new Map(prefs.map(pref => [pref.userId, pref]));
 const deferred = new Set<string>();
 for (const item of candidates) {
  const preference = byUser.get(item.userId);
  const id = item.payload.notificationId;
  if (!preference || !id) continue;
  const due = quietHoursEnd(preference, now);
  if (!due) continue;
  // Match recipient ownership before enqueuing. Do not keep a separate copy of private discussion content.
  await db.execute(sql`insert into ${deferredNotificationPushes} (notification_id,user_id,deliver_after)
   select id,user_id,${due.toISOString()}::timestamptz from ${notifications}
   where id = ${id} and user_id = ${item.userId}
   on conflict (notification_id) do nothing`);
  deferred.add(item.userId);
  await scheduleQuietFlush(item.userId, due);
 }
 return deferred;
}

/** A queued availability prompt is no longer relevant once the tutor has added
 * any dated slot for its original week, disabled reminders, lost their tutor
 * role, or the week has ended. Other tutor reminders are unaffected. */
async function filterDeferredAvailability(
 userId: string,
 rows: { id: string; type: string; metadata: Record<string, unknown> }[],
 now: Date,
) {
 const eligibility = new Map<string, boolean>();
 const kept: typeof rows = [];
 for (const row of rows) {
  const key = row.metadata.dedupeKey;
  if (row.type !== "tutor_reminder" || typeof key !== "string" || !key.startsWith("tutor_availability:")) {
   kept.push(row);
   continue;
  }
  if (!eligibility.has(key)) {
   const week = getDeferredAvailabilityReminderWeek(key, now);
   let eligible = false;
   if (week) {
    const [active] = await db.select({ id: pengguna.id }).from(pengguna)
     .where(and(eq(pengguna.id, userId), eq(pengguna.status, "active"),
      exists(db.select({ id: penggunaPeran.id }).from(penggunaPeran)
       .innerJoin(peran, eq(peran.id, penggunaPeran.peranId))
       .where(and(eq(penggunaPeran.penggunaId, userId), eq(peran.code, "tutor")))),
      notExists(db.select({ id: activityNotificationPreferences.userId }).from(activityNotificationPreferences)
       .where(and(eq(activityNotificationPreferences.userId, userId), eq(activityNotificationPreferences.tutorAvailabilityEnabled, false)))),
      notExists(db.select({ id: tutorSlots.id }).from(tutorSlots)
       .where(and(eq(tutorSlots.tutorId, userId), gte(tutorSlots.sessionDate, week.start), lte(tutorSlots.sessionDate, week.end)))),
     )).limit(1);
    eligible = Boolean(active);
   }
   eligibility.set(key, eligible);
  }
  if (eligibility.get(key)) kept.push(row);
 }
 return kept;
}

export async function flushQuietUser(userId: string): Promise<{ count: number; rescheduled?: boolean }> {
 const now = new Date();
 const preference = await getQuietHours(userId);
 const nextEnd = quietHoursEnd(preference, now);
 if (nextEnd) {
  await db.update(deferredNotificationPushes).set({ deliverAfter: nextEnd })
   .where(and(eq(deferredNotificationPushes.userId, userId), leaseAvailable(now)));
  await scheduleQuietFlush(userId, nextEnd, "quiet-extended");
  return { count: 0, rescheduled: true };
 }
 const claim = randomUUID();
 const lease = new Date(now.getTime() + 5 * 60_000);
 // Concurrent/retried workers claim a disjoint bounded page. No DB transaction is held during FCM calls.
 const rows = (await db.execute<{ id: string }>(sql`
  update ${deferredNotificationPushes} set claim_id=${claim}, lease_until=${lease.toISOString()}::timestamptz
  where notification_id in (
   select notification_id from ${deferredNotificationPushes}
   where user_id=${userId} and deliver_after <= ${now.toISOString()}::timestamptz
    and (lease_until is null or lease_until <= ${now.toISOString()}::timestamptz)
   order by deliver_after,notification_id limit 200 for update skip locked
  ) returning notification_id as id
 `)).rows;
 if (!rows.length) return { count: 0 };
 const ids = rows.map(row => row.id);
 const claimed = and(eq(deferredNotificationPushes.userId, userId), eq(deferredNotificationPushes.claimId, claim));
 try {
  const visibility = await notificationVisibility(userId, userId, { unreadOnly: true, ids });
  const visible = await db.select({ id: notifications.id, type: notifications.type, metadata: notifications.metadata }).from(notifications)
   .where(and(eq(notifications.userId, userId), inArray(notifications.id, ids), eq(notifications.read, false), visibility));
  const eligible = await filterDeferredAvailability(userId, visible, new Date());
  if (eligible.length) {
   // Recheck a recently edited schedule immediately before sending.
   const newEnd = quietHoursEnd(await getQuietHours(userId));
   if (newEnd) {
    await db.update(deferredNotificationPushes).set({ deliverAfter: newEnd, claimId: null, leaseUntil: null }).where(claimed);
    await scheduleQuietFlush(userId, newEnd, "quiet-extended");
    return { count: 0, rescheduled: true };
   }
   const locale = await getUserLocalePreference(userId);
   const [account] = await db.select({ role: user.role }).from(user).where(eq(user.id, userId)).limit(1);
   const count = eligible.length;
   const en = locale === "en";
   const payload: NotificationPayload = {
    title: en ? `${count} new notification${count === 1 ? "" : "s"}` : `${count} notifikasi baru`,
    body: en ? "Open Zyx Academy to see your updates." : "Buka Zyx Academy untuk melihat kabar terbaru.",
    type: "announcement",
    link: getDefaultHomeLinkForRole(account?.role === "teacher" ? "tutor" : account?.role),
    metadata: { quietDigest: "true", groupKey: "quiet-digest" },
   };
   const { sendPushToUserNow } = await import("./send");
   const result = await sendPushToUserNow(userId, payload);
   if (result.errors.length) throw new Error("QUIET_DIGEST_PROVIDER_FAILED");
   // A provider acknowledgement is at-least-once across a crash; stable OS tags
   // replace the same digest instead of producing a second visible banner.
   await db.update(notifications).set({ sentAt: new Date() }).where(and(eq(notifications.userId, userId), inArray(notifications.id, eligible.map(row => row.id))));
  }
  await db.delete(deferredNotificationPushes).where(claimed);
  if (rows.length === 200) await scheduleQuietFlush(userId, new Date(), "next-page");
  return { count: eligible.length };
 } catch (error) {
  await db.update(deferredNotificationPushes).set({ claimId: null, leaseUntil: null }).where(claimed);
  throw error;
 }
}

export function deferredSendResult() { return { ...noDelivery, failedTokens: [], errors: [] }; }
