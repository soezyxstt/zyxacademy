import { defineJob } from "./define-job";
import { db } from "@/db";
import { deferredNotificationPushes } from "@/db/schema";
import { and, asc, gt, isNull, lte, or } from "drizzle-orm";
import { flushQuietUser } from "@/lib/notifications/quiet-delivery";

export const quietNotificationWorker = defineJob({
 id: "notification-quiet-recovery", name: "Release quiet-hour notification digests",
 triggers: [{ event: "notifications/quiet.flush" }, { cron: "0 * * * *" }],
 retries: 5,
}, async ({ event, step }) => {
 const userId = event.data.userId;
 if (typeof userId === "string" && userId) return step.run("flush-user", () => flushQuietUser(userId));
 const after = typeof event.data.after === "string" ? event.data.after : "";
 const now = new Date();
 const users = await step.run("scan-due-recipients", async () => db.selectDistinct({ userId: deferredNotificationPushes.userId })
  .from(deferredNotificationPushes).where(and(lte(deferredNotificationPushes.deliverAfter, now),
   or(isNull(deferredNotificationPushes.leaseUntil), lte(deferredNotificationPushes.leaseUntil, now)),
   after ? gt(deferredNotificationPushes.userId, after) : undefined))
  .orderBy(asc(deferredNotificationPushes.userId)).limit(101));
 for (const item of users.slice(0,100)) await step.enqueueTask(`recipient:${item.userId}`, {
  name: "notifications/quiet.flush", id: `quiet-recovery:${item.userId}:${Math.floor(now.getTime()/3_600_000)}`, data: { userId: item.userId },
 });
 if (users.length > 100) await step.enqueueTask("next-page", {
  name: "notification-quiet-recovery", id: `quiet-recovery-page:${users[99].userId}:${Math.floor(now.getTime()/3_600_000)}`, data: { after: users[99].userId },
 });
 return { recipients: Math.min(users.length, 100) };
});
