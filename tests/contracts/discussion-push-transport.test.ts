import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { boolean, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { discussionPayload, renderNotificationPayload } from "@/lib/notifications/templates";

const userPushTokens = pgTable("user_push_tokens", { userId: text("user_id").notNull(), token: text("token").notNull() });
const notifications = pgTable("notifications", {
 id: text("id").primaryKey(), userId: text("user_id").notNull(), title: text("title").notNull(), body: text("body").notNull(),
 type: text("type").notNull(), read: boolean("read").notNull(), metadata: jsonb("metadata").notNull(),
 attempted: integer("attempted").notNull(), succeeded: integer("succeeded").notNull(), failedCount: integer("failed_count").notNull(),
 sentAt: timestamp("sent_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});
const enrollments = pgTable("enrollments", { userId: text("user_id"), courseId: text("course_id") });
const courses = pgTable("courses", { id: text("id") });
const user = pgTable("user", { id: text("id") });
const notificationQuietPreferences = pgTable("notification_quiet_preferences", { userId: text("user_id"), enabled: boolean("enabled") });
let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
let sendPushToUser: typeof import("@/lib/notifications/send").sendPushToUser;
let sendToUser: typeof import("@/lib/notifications/send").sendToUser;
let multicast: any;
let rowPresentAtPush = false;

beforeAll(async () => {
 client = await PGlite.create();
 await client.exec(`
  create table user_push_tokens (user_id text not null, token text not null);
  create table notification_quiet_preferences (user_id text, enabled bool);
  create table notifications (id text primary key, user_id text not null, title text not null, body text not null, type text not null, read boolean not null, metadata jsonb not null, attempted integer not null, succeeded integer not null, failed_count integer not null, sent_at timestamptz, created_at timestamptz not null);
  insert into user_push_tokens values ('recipient', 'local-fake-token');
 `);
 testDb = drizzle(client);
 mock.module("@/db", () => ({ db: testDb }));
 mock.module("@/db/schema", () => ({ userPushTokens, notifications, enrollments, courses, user, notificationQuietPreferences }));
 mock.module("@/lib/i18n/preferences", () => ({ getUserLocalePreference: async () => "en" }));
 mock.module("@/lib/firebase/admin", () => ({ adminMessaging: () => ({ sendEachForMulticast: async (payload: any) => {
  multicast = payload;
  if (payload.data.notificationId) {
   rowPresentAtPush = (await testDb.select().from(notifications)).some(row => row.id === payload.data.notificationId);
  }
  return { responses: [{ success: true }] };
 } }) }));
 ({ sendPushToUser, sendToUser } = await import("@/lib/notifications/send"));
});
afterAll(async () => { await client.close(); });

describe("discussion push transport", () => {
 test("push-only delivery does not persist another inbox record", async () => {
  const payload = renderNotificationPayload(discussionPayload({ role: "tutor", channelId: "channel", threadId: "thread", seq: 3 }), "en");
  expect(await sendPushToUser("recipient", payload)).toMatchObject({ attempted: 1, succeeded: 1, errors: [] });
  expect(await testDb.select().from(notifications)).toHaveLength(0);
  expect(multicast.notification).toMatchObject({ title: "Discussion update", body: "There is new activity in a discussion." });
  expect(multicast.data.url).toBe("/discussions?thread=thread");
  expect(multicast.webpush.fcmOptions.link).toBe(multicast.data.url);
 });

 test("existing sendToUser still persists one localized row", async () => {
  const payload = discussionPayload({ role: "student", channelId: "channel", threadId: "thread", seq: 3 });
  await sendToUser("recipient", payload);
  const rows = await testDb.select().from(notifications);
  expect(rows).toHaveLength(1);
  expect(rowPresentAtPush).toBe(true);
  expect(multicast.data.notificationId).toBe(rows[0].id);
  expect(rows[0]).toMatchObject({ title: "Discussion update", attempted: 1, succeeded: 1 });
 });
});
