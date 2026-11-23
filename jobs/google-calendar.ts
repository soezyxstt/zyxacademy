import { and, asc, eq, gt, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { defineJob } from "./define-job";
import { centralCalendarConfigured, syncGoogleCalendar } from "@/lib/google-calendar/sync";
import { hasCalendarScope } from "@/lib/google-calendar/shared";

export const googleCalendarSyncWorker = defineJob({
  id: "google-calendar-sync", triggers: [{ event: "google-calendar/sync.requested" }],
  concurrency: { limit: 1, key: "event.data.target" }, retries: 3,
}, async ({ event, step }) => {
  if (typeof event.data.target !== "string") throw new Error("Calendar target required");
  const target = event.data.target;
  await step.run("sync", () => syncGoogleCalendar(target));
});

export const googleCalendarSyncCron = defineJob({
  id: "google-calendar-sync-cron", triggers: [{ cron: "0 20 * * *" }], retries: 3,
}, async ({ step }) => {
  // Keyset pages avoid one unbounded account query and isolate retries per page.
  let cursor = "";
  for (let page = 0; ; page++) {
    const batch = await step.run(`accounts-${page}`, () => db.select({ id: account.id, userId: account.userId, scope: account.scope })
      .from(account).where(and(eq(account.providerId, "google"), gt(account.id, cursor), isNotNull(account.refreshToken))).orderBy(asc(account.id)).limit(100));
    for (const row of batch) {
      if (!hasCalendarScope(row.scope)) continue;
      await step.enqueueTask(`user-${row.id}`, { name: "google-calendar/sync.requested", data: { target: `user:${row.userId}` } });
    }
    if (batch.length < 100) break;
    cursor = batch[batch.length - 1].id;
  }
  if (centralCalendarConfigured()) await step.enqueueTask("central", { name: "google-calendar/sync.requested", data: { target: "central" } });
});
