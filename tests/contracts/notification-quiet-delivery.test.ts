import { afterAll, beforeAll, beforeEach, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import { discussionChannels, notifications, deferredNotificationPushes } from "@/db/schema";
import type { NotificationPayload } from "@/lib/notifications/types";

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
let quiet: typeof import("@/lib/notifications/quiet-delivery");
let providerFails = false;
let allowed = true;
const sent: Array<{ userId: string; payload: NotificationPayload }> = [];
const scheduled: Array<{ name: string; data: unknown; delaySeconds: number }> = [];

function activeWindow() {
  const now = new Date();
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  return { enabled: true, timeZone: "UTC", startMinute: (minute + 1435) % 1440, endMinute: (minute + 15) % 1440 };
}
const disabled = { enabled: false, timeZone: "UTC", startMinute: 1320, endMinute: 420 };
const item = (id: string, userId = "owner") => ({ userId, payload: { notificationId: id, title: "Private", body: "Content", type: "announcement" as const } });

async function seed(id: string, options: { userId?: string; read?: boolean; discussion?: boolean } = {}) {
  await testDb.insert(notifications).values({
    id, userId: options.userId ?? "owner", title: "Private", body: "Content",
    type: options.discussion ? "discussion" : "announcement", read: options.read ?? false,
    metadata: options.discussion ? { channelId: "channel", threadId: "thread" } : {},
  });
}

beforeAll(async () => {
  client = await PGlite.create();
  await client.exec(`
    create table "user" (id text primary key, role text);
    create table "session" (id text primary key);
    create table user_push_tokens (id text primary key);
    create table discussion_channels (id text primary key);
    create table notifications (id text primary key, user_id text not null references "user"(id), title text not null,
      body text not null, type text not null, read bool not null default false, metadata jsonb not null,
      attempted bigint not null default 0, succeeded bigint not null default 0, failed_count bigint not null default 0,
      sent_at timestamptz, created_at timestamptz not null default now());
    insert into "user" values ('owner', 'student'), ('other', 'student');
    insert into discussion_channels values ('channel');
  `);
  await client.exec(readFileSync("drizzle-postgres/0044_native_notification_delivery.sql", "utf8"));
  testDb = drizzle(client);
  mock.module("@/db", () => ({ db: testDb }));
  mock.module("@/lib/queue/cloud-tasks", () => ({ enqueueTask: async (task: typeof scheduled[number]) => { scheduled.push(task); } }));
  mock.module("@/lib/i18n/preferences", () => ({ getUserLocalePreference: async () => "en" }));
  mock.module("@/lib/discussions/access", () => ({
    getDiscussionChannelVisibility: async () => ({
      actor: { role: "student" },
      predicate: eq(discussionChannels.id, allowed ? "channel" : "denied"),
    }),
  }));
  mock.module("@/lib/notifications/send", () => ({
    sendPushToUserNow: async (userId: string, payload: NotificationPayload) => {
      sent.push({ userId, payload });
      return { attempted: 1, succeeded: providerFails ? 0 : 1, failedTokens: [], errors: providerFails ? ["temporary"] : [] };
    },
  }));
  quiet = await import("@/lib/notifications/quiet-delivery");
});

beforeEach(async () => {
  await client.exec("truncate deferred_notification_pushes, notification_quiet_preferences, notifications");
  sent.length = 0; scheduled.length = 0; allowed = true; providerFails = false;
});
afterAll(async () => { await client?.close(); });

test("quiet delivery keeps inbox rows, deduplicates retries and schedules release", async () => {
  await quiet.saveQuietHours("owner", activeWindow());
  await seed("one");
  expect(await quiet.deferQuietPushes([item("one")])).toEqual(new Set(["owner"]));
  expect(await quiet.deferQuietPushes([item("one")])).toEqual(new Set(["owner"]));
  expect(await testDb.select().from(deferredNotificationPushes)).toHaveLength(1);
  expect(await testDb.select().from(notifications)).toHaveLength(1);
  expect(scheduled.every(task => task.name === "notifications/quiet.flush" && task.delaySeconds > 0)).toBe(true);
  expect(await quiet.flushQuietUser("owner")).toEqual({ count: 0, rescheduled: true });
  expect(sent).toHaveLength(0);
});

test("preference changes release unread and authorized entries only; failed delivery retries", async () => {
  await quiet.saveQuietHours("owner", activeWindow());
  await seed("unread"); await seed("read"); await seed("revoked", { discussion: true });
  await seed("other", { userId: "other" });
  for (const id of ["unread", "read", "revoked", "other"]) await quiet.deferQuietPushes([item(id)]);
  expect(await testDb.select().from(deferredNotificationPushes)).toHaveLength(3);
  await testDb.update(notifications).set({ read: true }).where(eq(notifications.id, "read"));
  allowed = false;
  await quiet.saveQuietHours("owner", disabled);
  providerFails = true;
  await expect(quiet.flushQuietUser("owner")).rejects.toThrow("QUIET_DIGEST_PROVIDER_FAILED");
  const pending = await testDb.select().from(deferredNotificationPushes);
  expect(pending).toHaveLength(3);
  expect(pending.every(row => row.claimId === null && row.leaseUntil === null)).toBe(true);
  providerFails = false;
  expect(await quiet.flushQuietUser("owner")).toEqual({ count: 1 });
  expect(await quiet.flushQuietUser("owner")).toEqual({ count: 0 });
  expect(sent).toHaveLength(2);
  expect(sent[1]).toMatchObject({ userId: "owner", payload: { title: "1 new notification", metadata: { groupKey: "quiet-digest" } } });
  expect(await testDb.select().from(deferredNotificationPushes)).toHaveLength(0);
  const rows = await testDb.select().from(notifications);
  expect(rows).toHaveLength(4);
  expect(rows.filter(row => row.sentAt !== null).map(row => row.id)).toEqual(["unread"]);
});

test("release pages are bounded, do not claim another user's queue, and schedule continuation", async () => {
  await quiet.saveQuietHours("owner", activeWindow());
  await quiet.saveQuietHours("other", activeWindow());
  await client.exec(`insert into notifications (id,user_id,title,body,type,metadata)
    select 'batch-' || n, 'owner', 'Private', 'Content', 'announcement', '{}'::jsonb from generate_series(1,201) n`);
  await seed("other", { userId: "other" });
  await client.exec(`insert into deferred_notification_pushes (notification_id,user_id,deliver_after)
    select id,user_id,now() from notifications`);
  await quiet.saveQuietHours("owner", disabled);
  expect(await quiet.flushQuietUser("owner")).toEqual({ count: 200 });
  expect(scheduled.some(task => task.name === "notifications/quiet.flush" && task.delaySeconds === 0)).toBe(true);
  expect(await quiet.flushQuietUser("owner")).toEqual({ count: 1 });
  expect(await quiet.flushQuietUser("owner")).toEqual({ count: 0 });
  expect((await testDb.select().from(deferredNotificationPushes)).map(row => row.userId)).toEqual(["other"]);
  expect(sent.map(entry => entry.payload.title)).toEqual(["200 new notifications", "1 new notification"]);
});
