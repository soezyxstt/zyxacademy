import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { inArray, sql } from "drizzle-orm";
import { bigint, boolean, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { NextRequest } from "next/server";

const time = (name: string) => timestamp(name, { withTimezone: true }).notNull();
const discussionChannels = pgTable("discussion_channels", { id: text("id").primaryKey(), kind: text("kind").notNull() });
const discussionThreads = pgTable("discussion_threads", { id: text("id").primaryKey(), channelId: text("channel_id").notNull(), authorId: text("author_id").notNull(), title: text("title").notNull(), statusRevision: integer("status_revision").notNull().default(0) });
const discussionMessages = pgTable("discussion_messages", {
 id: text("id").primaryKey(), threadId: text("thread_id").notNull(), authorId: text("author_id"),
 seq: integer("seq").notNull(), kind: text("kind").notNull().default("human"), body: text("body").notNull(), replyToId: text("reply_to_id"), mentionIds: jsonb("mention_ids").$type<string[]>().notNull(),
 createdAt: time("created_at"), editedAt: timestamp("edited_at", { withTimezone: true }), deletedAt: timestamp("deleted_at", { withTimezone: true }),
});
const discussionThreadParticipants = pgTable("discussion_thread_participants", {
 threadId: text("thread_id").notNull(), userId: text("user_id").notNull(), firstSeq: integer("first_seq").notNull(),
 firstCreatedAt: time("first_created_at"), earliestCreatedAt: time("earliest_created_at"), earliestCreatedSeq: integer("earliest_created_seq").notNull(),
}, t => [primaryKey({ columns: [t.threadId, t.userId] })]);
const discussionEvents = pgTable("discussion_events", {
 id: text("id").primaryKey(), channelId: text("channel_id").notNull(), threadId: text("thread_id").notNull(),
 messageId: text("message_id"), messageRevision: integer("message_revision"), statusRevision: integer("status_revision"), participantThroughSeq: integer("participant_through_seq"), actorId: text("actor_id").notNull(), kind: text("kind").notNull(),
 status: text("status").notNull(), createdAt: time("created_at"), processedAt: timestamp("processed_at", { withTimezone: true }),
 attempts: integer("attempts").notNull(), errorCode: text("error_code"), recipientCursor: text("recipient_cursor"),
 retryAt: timestamp("retry_at", { withTimezone: true }).notNull().defaultNow(),
});
const discussionNotificationDeliveries = pgTable("discussion_notification_deliveries", {
 eventId: text("event_id").notNull(), userId: text("user_id").notNull(), staffOnly: boolean("staff_only").notNull().default(false),
 attempts: integer("attempts").notNull().default(0), retryAt: timestamp("retry_at", { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.eventId, t.userId] })]);
const accountLocalePreferences = pgTable("account_locale_preferences", { userId: text("user_id").primaryKey(), locale: text("locale").notNull() });
const pengguna = pgTable("pengguna", { id: text("id").primaryKey(), status: text("status").notNull() });
const penggunaPeran = pgTable("pengguna_peran", { penggunaId: text("pengguna_id").notNull(), peranId: text("peran_id").notNull() });
const peran = pgTable("peran", { id: text("id").primaryKey(), code: text("code").notNull() });
const discussionChannelPreferences = pgTable("discussion_channel_preferences", {
 userId: text("user_id").notNull(), channelId: text("channel_id").notNull(), muted: boolean("muted").notNull(), readRevision: bigint("read_revision", { mode: "bigint" }).notNull().default(0n), updatedAt: time("updated_at"),
});
const discussionThreadReads = pgTable("discussion_thread_reads", {
 userId: text("user_id").notNull(), threadId: text("thread_id").notNull(), throughSeq: integer("through_seq").notNull(), seenStatusRevision: integer("seen_status_revision"), updatedAt: time("updated_at"),
});
const discussionMessageObservations = pgTable("discussion_message_observations", {
 messageId: text("message_id").notNull(), userId: text("user_id").notNull(), revision: integer("revision").notNull(),
}, t => [primaryKey({ columns: [t.messageId, t.userId] })]);
const notifications = pgTable("notifications", {
 id: text("id").primaryKey(), userId: text("user_id").notNull(), title: text("title").notNull(), body: text("body").notNull(),
 type: text("type").notNull(), read: boolean("read").notNull(), metadata: jsonb("metadata").notNull(),
 attempted: integer("attempted").notNull(), succeeded: integer("succeeded").notNull(), failedCount: integer("failed_count").notNull(),
 sentAt: timestamp("sent_at", { withTimezone: true }), createdAt: time("created_at"),
});

let client: PGlite;
let testDb: ReturnType<typeof drizzle>;
const fixtureSql = `
 create table discussion_channels (id text primary key, kind text not null);
 create table discussion_threads (id text primary key, channel_id text not null, author_id text not null, title text not null, status_revision integer not null default 0);
 create table discussion_messages (id text primary key, thread_id text not null, author_id text, seq integer not null, kind text not null default 'human', body text not null, reply_to_id text, mention_ids jsonb not null, created_at timestamptz not null, edited_at timestamptz, deleted_at timestamptz);
 create table discussion_thread_participants (thread_id text not null, user_id text not null, first_seq integer not null, first_created_at timestamptz not null, earliest_created_at timestamptz not null, earliest_created_seq integer not null, primary key (thread_id, user_id));
 create function track_test_participant() returns trigger language plpgsql as $$ begin
  if new.author_id is not null then
   insert into discussion_thread_participants values (new.thread_id, new.author_id, new.seq, new.created_at, new.created_at, new.seq)
   on conflict (thread_id, user_id) do update set
    first_created_at = case when excluded.first_seq < discussion_thread_participants.first_seq then excluded.first_created_at else discussion_thread_participants.first_created_at end,
    first_seq = least(discussion_thread_participants.first_seq, excluded.first_seq),
    earliest_created_seq = case when excluded.earliest_created_at < discussion_thread_participants.earliest_created_at or
     (excluded.earliest_created_at = discussion_thread_participants.earliest_created_at and excluded.earliest_created_seq < discussion_thread_participants.earliest_created_seq)
     then excluded.earliest_created_seq else discussion_thread_participants.earliest_created_seq end,
    earliest_created_at = least(discussion_thread_participants.earliest_created_at, excluded.earliest_created_at);
  end if; return new; end $$;
 create trigger track_test_participant after insert on discussion_messages for each row execute function track_test_participant();
 create table discussion_events (id text primary key, channel_id text not null, thread_id text not null, message_id text, message_revision integer, status_revision integer, participant_through_seq integer check (participant_through_seq is null or participant_through_seq >= 0), actor_id text not null, kind text not null, status text not null, created_at timestamptz not null, processed_at timestamptz, attempts integer not null, error_code text, recipient_cursor text, retry_at timestamptz not null default now());
 create table discussion_notification_deliveries (event_id text not null, user_id text not null, staff_only boolean not null default false, attempts integer not null default 0, retry_at timestamptz not null default now(), primary key (event_id, user_id));
 create table account_locale_preferences (user_id text primary key, locale text not null);
 create table pengguna (id text primary key, status text not null);
 create table pengguna_peran (pengguna_id text not null, peran_id text not null);
 create table peran (id text primary key, code text not null);
 create table discussion_channel_preferences (user_id text not null, channel_id text not null, muted boolean not null, read_revision bigint not null default 0 check (read_revision >= 0), updated_at timestamptz not null, primary key (user_id, channel_id));
 create table discussion_thread_reads (user_id text not null, thread_id text not null, through_seq integer not null, seen_status_revision integer, updated_at timestamptz not null);
 create table discussion_message_observations (message_id text not null, user_id text not null, revision integer not null check (revision > 0), primary key (message_id, user_id));
 create table notifications (id text primary key, user_id text not null, title text not null, body text not null, type text not null, read boolean not null default false, metadata jsonb not null, attempted integer not null default 0, succeeded integer not null default 0, failed_count integer not null default 0, sent_at timestamptz, created_at timestamptz not null default now());
 create index idx_notifications_user_type_read_thread on notifications (user_id, type, read, (metadata->>'threadId')) where metadata->>'threadId' is not null;
`;
const denied = new Set<string>();
const roles = new Map<string, "student" | "tutor" | "admin">();
let staff: string[] = [];
let pushes: Array<{ userId: string; payload: any }> = [];
let failPushFor = "";
let failAccessFor = "";
let knownChannels = new Set<string>();
let scopeCalls = 0;
let queryCount = 0;
let session = { user: { id: "owner", role: "student" } };
let requestHeaders = new Headers({ cookie: "session=test" });
const originalFirebase = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

let dispatchDiscussionEvents: typeof import("@/lib/discussions/notifications").dispatchDiscussionEvents;
let discussionNotificationId: typeof import("@/lib/discussions/notifications").discussionNotificationId;
let clearDiscussionNotificationsThroughSeq: typeof import("@/lib/discussions/notifications").clearDiscussionNotificationsThroughSeq;
let GET: typeof import("@/app/api/notifications/history/route").GET;
let PATCH: typeof import("@/app/api/notifications/read/route").PATCH;
const eventTime = new Date("2026-01-01T12:00:00Z");
const earlier = new Date("2026-01-01T11:00:00Z");

beforeAll(async () => {
 client = await PGlite.create();
 await client.exec(fixtureSql);
 testDb = drizzle(client, { logger: { logQuery: () => { queryCount++; } } });
 mock.module("@/db", () => ({ db: testDb }));
 mock.module("@/db/schema", () => ({ accountLocalePreferences, discussionChannels, discussionThreads, discussionMessages, discussionThreadParticipants, discussionEvents, discussionNotificationDeliveries, discussionChannelPreferences, discussionThreadReads, discussionMessageObservations, notifications, pengguna, penggunaPeran, peran }));
 mock.module("@/lib/discussions/access", () => ({
  canAccessDiscussionChannel: async (userId: string, channelId: string) => {
   if (userId === failAccessFor) throw new Error("temporary access failure");
   return !denied.has(`${userId}:${channelId}`);
  },
  getDiscussionActor: async (id: string) => ({ id, role: roles.get(id) ?? "student" }),
  getDiscussionCandidateUserIdsPage: async (_channelId: string, options: { cursor?: string | null; limit?: number }) => {
   const items = [...staff].sort().filter(id => !options.cursor || id > options.cursor);
   const limit = options.limit ?? 100;
   return { items: items.slice(0, limit), nextCursor: items.length > limit ? items[limit - 1] : null };
  },
  getDiscussionChannelVisibility: async (id: string) => {
   scopeCalls++;
   const allowed = [...knownChannels].filter(channelId => !denied.has(`${id}:${channelId}`));
   return { actor: { id, role: roles.get(id) ?? "student" }, predicate: allowed.length ? inArray(discussionChannels.id, allowed) : sql`false` };
  },
 }));
 mock.module("@/lib/discussions/recipient-access", () => ({
  getDiscussionRecipientAccess: async (channelId: string, ids: readonly string[]) => {
   if (ids.includes(failAccessFor)) throw new Error("temporary access failure");
   return new Map(ids.filter(id => !denied.has(`${id}:${channelId}`)).map(id => [id, { id, role: roles.get(id) ?? "student" }]));
  },
 }));
 mock.module("@/lib/notifications/send", () => ({ sendPushToUsers: async (items: Array<{ userId: string; payload: any }>) => new Map(items.map(({ userId, payload }) => {
  pushes.push({ userId, payload });
  return [userId, { attempted: 1, succeeded: userId === failPushFor ? 0 : 1, failedTokens: [], errors: userId === failPushFor ? ["temporary"] : [] }];
 })) }));
 mock.module("@/lib/auth", () => ({ auth: { api: { getSession: async () => session } } }));
 mock.module("next/headers", () => ({ headers: async () => requestHeaders }));
 ({ dispatchDiscussionEvents, discussionNotificationId, clearDiscussionNotificationsThroughSeq } = await import("@/lib/discussions/notifications"));
 ({ GET } = await import("@/app/api/notifications/history/route"));
 ({ PATCH } = await import("@/app/api/notifications/read/route"));
});

async function seed(kind = "course") {
 knownChannels.add("channel");
 await testDb.insert(accountLocalePreferences).values({ userId: "owner", locale: "en" });
 await testDb.insert(discussionChannels).values({ id: "channel", kind });
 await testDb.insert(discussionThreads).values({ id: "thread", channelId: "channel", authorId: "owner", title: "Private question title" });
 await testDb.insert(discussionMessages).values([
  { id: "first", threadId: "thread", authorId: "participant", seq: 1, body: "Private question body", mentionIds: [], createdAt: earlier },
  { id: "reply", threadId: "thread", authorId: "actor", seq: 2, body: "Private reply body", replyToId: "first", mentionIds: ["mentioned", "muted", "revoked"], createdAt: eventTime },
 ]);
 await testDb.insert(discussionEvents).values({ id: "event", channelId: "channel", threadId: "thread", messageId: "reply", messageRevision: 1, participantThroughSeq: 2, actorId: "actor", kind: "message", status: "pending", attempts: 0, createdAt: eventTime });
}

beforeEach(async () => {
 await client.exec("truncate notifications, discussion_notification_deliveries, account_locale_preferences, discussion_events, discussion_messages, discussion_message_observations, discussion_thread_participants, discussion_threads, discussion_channels, discussion_channel_preferences, discussion_thread_reads, pengguna, pengguna_peran, peran");
 denied.clear(); roles.clear(); staff = []; pushes = []; failPushFor = ""; failAccessFor = ""; knownChannels = new Set(); scopeCalls = 0;
 session = { user: { id: "owner", role: "student" } };
 requestHeaders = new Headers({ cookie: "session=test" });
 process.env.FIREBASE_SERVICE_ACCOUNT_JSON = "test-only";
});

async function drain() {
 const total = { processed: 0, failed: 0, hasMore: false };
 for (let i = 0; i < 100; i++) {
  const result = await dispatchDiscussionEvents();
  total.processed += result.processed;
  total.failed += result.failed;
  if (!result.hasMore) return total;
 }
 throw new Error("unexpected notification continuation loop");
}

async function makeRetriesDue() {
 await client.exec("update discussion_events set retry_at = now() - interval '1 second' where status = 'failed'; update discussion_notification_deliveries set retry_at = now() - interval '1 second'");
}
afterAll(async () => {
 if (originalFirebase === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
 else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = originalFirebase;
 await client?.close();
});

describe("discussion notification outbox", () => {
 test("deduplicates recipients and excludes actor, muted and revoked users", async () => {
  await seed();
  denied.add("revoked:channel");
  await testDb.insert(discussionChannelPreferences).values({ userId: "muted", channelId: "channel", muted: true, updatedAt: earlier });
  expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
  const rows = await testDb.select().from(notifications);
  expect(rows.map(row => row.userId).sort()).toEqual(["mentioned", "owner", "participant"]);
  expect(new Set(rows.map(row => row.id)).size).toBe(3);
  expect(rows.find(row => row.userId === "owner")?.id).toBe(discussionNotificationId("event", "owner"));
  expect(pushes.map(row => row.userId).sort()).toEqual(["mentioned", "owner", "participant"]);
  expect(pushes.find(row => row.userId === "owner")?.payload).toMatchObject({ title: "Discussion update", link: "/discussions?thread=thread&message=reply", metadata: { url: "/discussions?thread=thread&message=reply" } });
  expect(JSON.stringify(pushes)).not.toContain("Private question title");
  expect(JSON.stringify(pushes)).not.toContain("Private reply body");
  expect(await dispatchDiscussionEvents()).toEqual({ processed: 0, failed: 0, hasMore: false });
 });

 test("retries failures without inserting another row or re-sending completed recipients", async () => {
  await seed();
  failPushFor = "owner";
  expect(await drain()).toEqual({ processed: 0, failed: 1, hasMore: false });
  const firstCount = (await testDb.select().from(notifications)).length;
  const firstOwnerPushes = pushes.filter(row => row.userId === "owner").length;
  failPushFor = "";
  await makeRetriesDue();
  expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
  expect((await testDb.select().from(notifications)).length).toBe(firstCount);
  expect(pushes.filter(row => row.userId === "owner")).toHaveLength(firstOwnerPushes + 1);
  expect(pushes.filter(row => row.userId === "participant")).toHaveLength(1);
 });

 test("does not retry a push after the channel is muted", async () => {
  await seed();
  failPushFor = "owner";
  await drain();
  const beforeMute = pushes.filter(row => row.userId === "owner").length;
  await testDb.insert(discussionChannelPreferences).values({ userId: "owner", channelId: "channel", muted: true, updatedAt: new Date() });
  failPushFor = "";
  await makeRetriesDue();
  expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
  expect(pushes.filter(row => row.userId === "owner")).toHaveLength(beforeMute);
 });

 test("uses an event mention snapshot after the source message changes", async () => {
  await seed();
  await client.exec(`update discussion_events set recipient_cursor = '{"phase":"direct","after":null,"mentions":["original-mention"]}'; update discussion_messages set mention_ids = '[]'::jsonb where id = 'reply'`);
  expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
  expect((await testDb.select().from(notifications)).some(row => row.userId === "original-mention")).toBe(true);
 });

 test("sequence snapshots survive older transaction timestamps for messages, edits, deletes and status", async () => {
  for (const kind of ["message", "edit", "delete", "resolved"] as const) {
   await client.exec("truncate notifications, discussion_notification_deliveries, account_locale_preferences, discussion_events, discussion_messages, discussion_message_observations, discussion_thread_participants, discussion_threads, discussion_channels, discussion_channel_preferences, discussion_thread_reads");
   denied.clear();
   await seed();
   delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
   // Model B's transaction starting before A commits, then B receiving the later sequence.
   await client.exec(`update discussion_messages set seq = 6, created_at = '2026-01-01T10:00:00Z', reply_to_id = null, mention_ids = '[]'::jsonb where id = 'reply';
    update discussion_events set kind = '${kind}', message_id = ${kind === "resolved" ? "null" : kind === "message" ? "'reply'" : "'first'"},
     message_revision = ${kind === "message" ? 1 : 2}, status_revision = 2, participant_through_seq = 6, created_at = '2026-01-01T10:00:00Z'`);
   await testDb.insert(discussionMessages).values([
    ...["eligible", "muted", "revoked", "seen"].map((authorId, index) => ({ id: `before-${authorId}`, threadId: "thread", authorId,
     seq: index + 2, body: "", mentionIds: [], createdAt: eventTime })),
    { id: "late", threadId: "thread", authorId: "late", seq: 7, body: "", mentionIds: [], createdAt: new Date("2026-01-01T09:00:00Z") },
   ]);
   await testDb.insert(discussionChannelPreferences).values([
    { userId: "eligible", channelId: "channel", muted: false, updatedAt: earlier },
    { userId: "muted", channelId: "channel", muted: true, updatedAt: earlier },
   ]);
   denied.add("revoked:channel");
   await testDb.insert(discussionThreadReads).values({ userId: "seen", threadId: "thread", throughSeq: 6, seenStatusRevision: 2, updatedAt: eventTime });
   if (kind !== "resolved") await testDb.insert(discussionMessageObservations).values({ userId: "seen", messageId: kind === "message" ? "reply" : "first", revision: kind === "message" ? 1 : 2 });
   expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
   const rows = await testDb.select().from(notifications);
   const eligible = rows.find(row => row.userId === "eligible");
   expect(eligible).toBeDefined();
   expect((eligible?.metadata as any).seq).toBe(kind === "message" || kind === "resolved" ? "6" : "1");
   for (const id of ["late", "muted", "revoked", "seen"]) expect(rows.some(row => row.userId === id)).toBe(false);
   await client.exec(`update discussion_events set status = 'pending', processed_at = null, retry_at = now(), recipient_cursor = '{"phase":"participants","after":null}'`);
   expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
   expect(await testDb.select().from(notifications)).toHaveLength(rows.length);
  }
 });

 test("legacy events restart a partially completed participant scan and include current eligible participants", async () => {
  await seed();
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  await testDb.insert(discussionMessages).values([
   { id: "legacy-late", threadId: "thread", authorId: "legacy-late", seq: 3, body: "", mentionIds: [], createdAt: new Date("2026-01-02T00:00:00Z") },
   { id: "legacy-muted", threadId: "thread", authorId: "legacy-muted", seq: 4, body: "", mentionIds: [], createdAt: eventTime },
   { id: "legacy-revoked", threadId: "thread", authorId: "legacy-revoked", seq: 5, body: "", mentionIds: [], createdAt: eventTime },
  ]);
  await testDb.insert(discussionChannelPreferences).values({ userId: "legacy-muted", channelId: "channel", muted: true, updatedAt: earlier });
  denied.add("legacy-revoked:channel");
  await client.exec(`update discussion_events set participant_through_seq = null, recipient_cursor = '{"phase":"push","after":"z"}'`);
  expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
  const rows = await testDb.select().from(notifications);
  expect(rows.some(row => row.userId === "legacy-late")).toBe(true);
  expect(rows.some(row => row.userId === "participant")).toBe(true);
  expect(rows.some(row => row.userId === "legacy-muted" || row.userId === "legacy-revoked")).toBe(false);
  expect(JSON.parse((await testDb.select().from(discussionEvents))[0].recipientCursor!).legacyParticipantsRestarted).toBe(true);
 });

 test("does not complete an edited event when its mention snapshot is missing", async () => {
  await seed();
  await client.exec("update discussion_messages set edited_at = now(), mention_ids = '[]'::jsonb where id = 'reply'");
  expect(await drain()).toEqual({ processed: 0, failed: 1, hasMore: false });
  const [event] = await testDb.select().from(discussionEvents);
  expect(event.status).toBe("failed");
  expect(event.errorCode).toBe("DISCUSSION_MENTION_SNAPSHOT_MISSING");
 });

 test("skips a thread already read and recovers an expired event lease", async () => {
  await seed();
  await testDb.insert(discussionThreadReads).values({ userId: "owner", threadId: "thread", throughSeq: 2, updatedAt: new Date() });
  await testDb.insert(discussionMessageObservations).values({ userId: "owner", messageId: "reply", revision: 1 });
  await client.exec("update discussion_events set status = 'processing', attempts = 2, processed_at = '2026-01-01T11:00:00Z'");
  expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
  expect((await testDb.select().from(notifications)).some(row => row.userId === "owner")).toBe(false);
  expect((await testDb.select().from(discussionEvents))[0].attempts).toBe(2);
 });

 test("notifies only currently authorized staff on a new private team question", async () => {
  await seed("technical");
  await client.exec("update discussion_events set kind = 'question'; update discussion_messages set mention_ids = '[]'::jsonb where id = 'reply'; delete from discussion_messages where id = 'first'; delete from discussion_thread_participants where user_id = 'participant'; update discussion_messages set reply_to_id = null where id = 'reply'");
  staff = ["admin", "tutor", "student"];
  roles.set("admin", "admin"); roles.set("tutor", "tutor");
  denied.add("tutor:channel");
  await drain();
  expect((await testDb.select().from(notifications)).map(row => row.userId).sort()).toEqual(["admin", "owner"]);
  expect(pushes.find(row => row.userId === "admin")?.payload.link).toBe("/discussions?thread=thread&message=reply");
 });

 test("pages through more than 500 private-channel staff candidates", async () => {
  await seed("technical");
  await client.exec("update discussion_events set kind = 'question'; update discussion_messages set mention_ids = '[]'::jsonb, reply_to_id = null where id = 'reply'; delete from discussion_messages where id = 'first'; delete from discussion_thread_participants where user_id = 'participant'");
  staff = Array.from({ length: 510 }, (_, i) => `admin-${String(i).padStart(3, "0")}`);
  for (const id of staff) roles.set(id, "admin");
  denied.add("admin-155:channel");
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
  const rows = await testDb.select().from(notifications);
  expect(rows).toHaveLength(510);
  expect(rows.some(row => row.userId === "admin-509")).toBe(true);
  expect(rows.some(row => row.userId === "admin-155")).toBe(false);
 }, 120_000);

 test("a message observation clears its notification beyond the contiguous watermark", async () => {
  await seed();
  await drain();
  await testDb.insert(discussionMessageObservations).values({ userId: "owner", messageId: "reply", revision: 1 });
  await testDb.transaction(tx => clearDiscussionNotificationsThroughSeq(tx as never, { userId: "owner", threadId: "thread", throughSeq: 1 }));
  expect((await testDb.select().from(notifications)).find(row => row.userId === "owner")?.read).toBe(true);
  await testDb.transaction(tx => clearDiscussionNotificationsThroughSeq(tx as never, { userId: "owner", threadId: "thread", throughSeq: 2 }));
  expect((await testDb.select().from(notifications)).find(row => row.userId === "owner")?.read).toBe(true);
 });

 test("continues past 500 participants while one access failure persists, then recovers without duplicates", async () => {
  await seed();
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  await client.exec("update discussion_messages set seq = 1000 where id = 'reply'; update discussion_events set participant_through_seq = 1000");
  await testDb.insert(discussionMessages).values(Array.from({ length: 550 }, (_, i) => ({
   id: `message-${i}`, threadId: "thread", authorId: `member-${String(i).padStart(3, "0")}`,
   seq: i + 10, body: "private", mentionIds: [], createdAt: earlier,
  })));
  await testDb.insert(discussionChannelPreferences).values({ userId: "member-120", channelId: "channel", muted: true, updatedAt: earlier });
  await testDb.insert(discussionThreadReads).values({ userId: "member-220", threadId: "thread", throughSeq: 1000, updatedAt: new Date() });
  await testDb.insert(discussionMessageObservations).values({ userId: "member-220", messageId: "reply", revision: 1 });
  denied.add("member-320:channel");
  failAccessFor = "member-050";
  expect(await drain()).toEqual({ processed: 0, failed: 1, hasMore: false });
  let rows = await testDb.select().from(notifications);
  expect(rows.some(row => row.userId === "member-501")).toBe(true);
  expect(rows.some(row => row.userId === "member-050")).toBe(false);
  expect((await testDb.select().from(discussionNotificationDeliveries)).map(row => row.userId)).toEqual(["member-050"]);
  await makeRetriesDue();
  expect(await drain()).toEqual({ processed: 0, failed: 1, hasMore: false });
  expect((await testDb.select().from(notifications))).toHaveLength(rows.length);
  failAccessFor = "";
  await makeRetriesDue();
  expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
  rows = await testDb.select().from(notifications);
  expect(rows).toHaveLength(552);
  expect(new Set(rows.map(row => row.id)).size).toBe(rows.length);
  for (const id of ["member-120", "member-220", "member-320"]) expect(rows.some(row => row.userId === id)).toBe(false);
  expect(rows.some(row => row.userId === "member-549")).toBe(true);
  expect(rows.some(row => row.userId === "member-050")).toBe(true);
  expect(await testDb.select().from(discussionNotificationDeliveries)).toHaveLength(0);
 }, 120_000);

 test("isolates a persistent inbox insert failure and retries it after later pages", async () => {
  await seed();
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  await client.exec("update discussion_messages set seq = 1000 where id = 'reply'; update discussion_events set participant_through_seq = 1000");
  await testDb.insert(discussionMessages).values(Array.from({ length: 510 }, (_, i) => ({
   id: `message-${i}`, threadId: "thread", authorId: `member-${String(i).padStart(3, "0")}`,
   seq: i + 10, body: "private", mentionIds: [], createdAt: earlier,
  })));
  await client.exec(`create function reject_one_inbox() returns trigger language plpgsql as $$
   begin if new.user_id = 'member-050' then raise exception 'recipient unavailable'; end if; return new; end $$;
   create trigger reject_one before insert on notifications for each row execute function reject_one_inbox()`);
  expect(await drain()).toEqual({ processed: 0, failed: 1, hasMore: false });
  expect((await testDb.select().from(notifications)).some(row => row.userId === "member-501")).toBe(true);
  expect((await testDb.select().from(discussionNotificationDeliveries)).map(row => row.userId)).toEqual(["member-050"]);
  await client.exec("drop trigger reject_one on notifications; drop function reject_one_inbox()");
  await makeRetriesDue();
  expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
  const rows = await testDb.select().from(notifications);
  expect(rows.filter(row => row.userId === "member-050")).toHaveLength(1);
  expect(new Set(rows.map(row => row.id)).size).toBe(rows.length);
 }, 120_000);

 test("uses bounded SQL work per 100 recipients without Firebase", async () => {
  async function measure(count: number) {
   await client.exec("truncate notifications, discussion_notification_deliveries, account_locale_preferences, discussion_events, discussion_messages, discussion_message_observations, discussion_thread_participants, discussion_threads, discussion_channels, discussion_channel_preferences, discussion_thread_reads");
   await seed();
   await client.exec("update discussion_messages set seq = 1000 where id = 'reply'; update discussion_events set participant_through_seq = 1000");
   await testDb.insert(discussionMessages).values(Array.from({ length: count }, (_, i) => ({
    id: `message-${i}`, threadId: "thread", authorId: `member-${String(i).padStart(3, "0")}`,
    seq: i + 10, body: "private", mentionIds: [], createdAt: earlier,
   })));
   queryCount = 0;
   expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
   return queryCount;
  }
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const hundred = await measure(100);
  const fiveHundred = await measure(500);
  expect(hundred).toBeLessThan(140);
  expect(fiveHundred).toBeLessThanOrEqual(hundred + 4 * 35);
 }, 120_000);

 test("excludes a human sender but not a Zyra invoker who is another participant", async () => {
  await seed();
  delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
  expect((await testDb.select().from(notifications)).some(row => row.userId === "actor")).toBe(false);
  await testDb.insert(discussionMessages).values({
   id: "zyra-answer", threadId: "thread", authorId: null, kind: "zyra", seq: 3, body: "Answer", mentionIds: [], createdAt: eventTime,
  });
  await testDb.insert(discussionEvents).values({
   id: "zyra-event", channelId: "channel", threadId: "thread", messageId: "zyra-answer", actorId: "actor",
   kind: "message", status: "pending", attempts: 0, participantThroughSeq: 3, createdAt: eventTime,
   recipientCursor: JSON.stringify({ phase: "direct", after: null, mentions: [] }),
  });
  expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
  const rows = await testDb.select().from(notifications);
  expect(rows.filter(row => row.userId === "actor").map(row => row.id)).toEqual([discussionNotificationId("zyra-event", "actor")]);
 });

 test("keeps discovering later recipients while an earlier push remains retriable", async () => {
  await seed();
  await client.exec("update discussion_messages set seq = 1000 where id = 'reply'; update discussion_events set participant_through_seq = 1000");
  await testDb.insert(discussionMessages).values(Array.from({ length: 205 }, (_, i) => ({
   id: `message-${i}`, threadId: "thread", authorId: `member-${String(i).padStart(3, "0")}`,
   seq: i + 10, body: "private", mentionIds: [], createdAt: earlier,
  })));
  failPushFor = "owner";
  expect(await drain()).toEqual({ processed: 0, failed: 1, hasMore: false });
  let rows = await testDb.select().from(notifications);
  expect(rows.some(row => row.userId === "member-204")).toBe(true);
  expect((rows.find(row => row.userId === "owner")?.metadata as any).pushState).toBe("pending");
  const ownerCount = pushes.filter(row => row.userId === "owner").length;
  denied.add("owner:channel");
  failPushFor = "";
  await makeRetriesDue();
  expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
  rows = await testDb.select().from(notifications);
  expect((rows.find(row => row.userId === "owner")?.metadata as any).pushState).toBe("done");
  expect(pushes.filter(row => row.userId === "owner")).toHaveLength(ownerCount);
 }, 120_000);

 test("backs off old failed events and continues to fresh work", async () => {
  await seed();
  await testDb.insert(discussionEvents).values(Array.from({ length: 20 }, (_, i) => ({
   id: `old-${i}`, channelId: "missing", threadId: "missing", messageId: "missing", actorId: "actor",
   kind: "message", status: "pending", attempts: 0, createdAt: earlier, retryAt: earlier,
  })));
  expect(await dispatchDiscussionEvents({ limit: 20 })).toEqual({ processed: 0, failed: 20, hasMore: true });
  expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
  expect((await testDb.select().from(notifications)).some(row => row.userId === "owner")).toBe(true);
 });

 test("notifies participants about edits, deletions and status after an earlier read", async () => {
  for (const kind of ["edit", "delete", "resolved"]) {
   await client.exec("truncate notifications, discussion_notification_deliveries, account_locale_preferences, discussion_events, discussion_messages, discussion_thread_participants, discussion_threads, discussion_channels, discussion_channel_preferences, discussion_thread_reads");
   await seed();
   await testDb.insert(discussionThreadReads).values({ userId: "owner", threadId: "thread", throughSeq: 2, updatedAt: earlier });
   await client.exec(`update discussion_events set kind = '${kind}', message_id = ${kind === "resolved" ? "null" : "'reply'"}`);
   if (kind === "delete") await client.exec("update discussion_messages set deleted_at = now() where id = 'reply'");
   expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
   expect((await testDb.select().from(notifications)).some(row => row.userId === "owner")).toBe(true);
  }
 });

 test("a newer edit stays unread despite an older transaction timestamp and an advanced sequence", async () => {
  await seed();
  await testDb.insert(discussionThreadReads).values({ userId: "owner", threadId: "thread", throughSeq: 1000, updatedAt: new Date() });
  await testDb.insert(discussionMessageObservations).values({ userId: "owner", messageId: "reply", revision: 1 });
  await client.exec("update discussion_events set kind = 'edit', message_revision = 2, created_at = '2026-01-01T10:00:00Z'");
  expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
  const id = discussionNotificationId("event", "owner");
  expect((await testDb.select().from(notifications)).find(row => row.id === id)?.read).toBe(false);
  await testDb.transaction(tx => clearDiscussionNotificationsThroughSeq(tx as never, { userId: "owner", threadId: "thread", throughSeq: 1000 }));
  expect((await testDb.select().from(notifications)).find(row => row.id === id)?.read).toBe(false);
  await client.exec("update discussion_message_observations set revision = 2 where user_id = 'owner' and message_id = 'reply'");
  await testDb.transaction(tx => clearDiscussionNotificationsThroughSeq(tx as never, { userId: "owner", threadId: "thread", throughSeq: 1000 }));
  expect((await testDb.select().from(notifications)).find(row => row.id === id)?.read).toBe(true);
 });

 test("reports reach only currently authorized admins with a generic reports link", async () => {
  await seed();
  await client.exec("update discussion_events set kind = 'report', actor_id = 'admin-actor'");
  await client.exec("insert into peran values ('admin-role', 'admin'), ('tutor-role', 'tutor'); insert into pengguna values ('admin', 'active'), ('admin-actor', 'active'), ('admin-revoked', 'active'), ('tutor', 'active'); insert into pengguna_peran values ('admin', 'admin-role'), ('admin-actor', 'admin-role'), ('admin-revoked', 'admin-role'), ('tutor', 'tutor-role')");
  roles.set("admin", "admin"); roles.set("admin-actor", "admin"); roles.set("admin-revoked", "admin"); roles.set("tutor", "tutor");
  denied.add("admin-revoked:channel");
  expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
  const rows = await testDb.select().from(notifications);
  expect(rows.map(row => row.userId)).toEqual(["admin"]);
  expect(pushes).toHaveLength(1);
  expect(pushes[0].payload.link).toBe("/discussions?discussionTab=reports");
  expect(JSON.stringify(pushes)).not.toContain("Private");
  expect(JSON.stringify(pushes)).not.toContain("admin-actor");
  await testDb.transaction(tx => clearDiscussionNotificationsThroughSeq(tx as never, { userId: "admin", threadId: "thread", throughSeq: 100 }));
  expect((await testDb.select().from(notifications))[0].read).toBe(false);
  session = { user: { id: "admin", role: "student" } };
  roles.set("admin", "student");
  const history = await GET(new NextRequest("http://localhost/api/notifications/history?countOnly=true"));
  expect((await history.json()).unreadCount).toBe(0);
 });

 test("drops a pending report push if the recipient loses the admin role", async () => {
  await seed();
  await client.exec("update discussion_events set kind = 'report'; insert into peran values ('admin-role', 'admin'); insert into pengguna values ('admin', 'active'); insert into pengguna_peran values ('admin', 'admin-role')");
  roles.set("admin", "admin");
  failPushFor = "admin";
  expect(await drain()).toEqual({ processed: 0, failed: 1, hasMore: false });
  const attempted = pushes.length;
  roles.set("admin", "student");
  failPushFor = "";
  await makeRetriesDue();
  expect(await drain()).toEqual({ processed: 1, failed: 0, hasMore: false });
  expect(pushes).toHaveLength(attempted);
  expect(((await testDb.select().from(notifications))[0].metadata as any).pushState).toBe("done");
 });

 test("rejects report progress that points at participant fanout", async () => {
  await seed();
  await client.exec(`update discussion_events set kind = 'report', recipient_cursor = '{"phase":"direct","after":null}'`);
  expect(await drain()).toEqual({ processed: 0, failed: 1, hasMore: false });
  expect(await testDb.select().from(notifications)).toHaveLength(0);
 });
});

describe("notification history and read", () => {
 test("filters revoked discussions before count and both pages", async () => {
  knownChannels = new Set(["revoked", "allowed"]);
  await testDb.insert(discussionChannels).values([...knownChannels].map(id => ({ id, kind: "course" })));
  const values = Array.from({ length: 50 }, (_, i) => ({
   id: `row-${i}`, userId: "owner", title: "Activity", body: "Open discussion", type: "discussion", read: false,
   metadata: { channelId: i < 25 ? "revoked" : "allowed" }, createdAt: new Date(1000 * (100 - i)),
  }));
  await testDb.insert(notifications).values(values);
  denied.add("owner:revoked");
  const first = await GET(new NextRequest("http://localhost/api/notifications/history?limit=20&page=1"));
  const firstBody = await first.json();
  expect(first.headers.get("cache-control")).toBe("private, no-store");
  expect(firstBody.unreadCount).toBe(25);
  expect(firstBody.notifications).toHaveLength(20);
  expect(firstBody.notifications.every((row: any) => row.metadata.channelId === "allowed")).toBe(true);
  const second = await GET(new NextRequest("http://localhost/api/notifications/history?limit=20&page=2"));
  expect((await second.json()).notifications).toHaveLength(5);
  const count = await GET(new NextRequest("http://localhost/api/notifications/history?countOnly=true"));
  expect((await count.json()).unreadCount).toBe(25);
  session = { user: { id: "admin-viewer", role: "admin" } };
  denied.add("admin-viewer:allowed");
  const admin = await GET(new NextRequest("http://localhost/api/notifications/history?userId=owner"));
  expect((await admin.json()).unreadCount).toBe(0);
 });

 test("mark all clears more than one visible page", async () => {
  await testDb.insert(notifications).values(Array.from({ length: 35 }, (_, i) => ({
   id: `row-${i}`, userId: "owner", title: "Title", body: "Body", type: "announcement", read: false, metadata: {}, createdAt: eventTime,
  })));
  const response = await PATCH(new NextRequest("http://localhost/api/notifications/read", { method: "PATCH", body: JSON.stringify({ all: true }) }));
  expect(response.status).toBe(200);
  expect((await testDb.select().from(notifications)).filter(row => !row.read)).toHaveLength(0);
 });

 test("mark all preserves notifications outside current access, including after access returns", async () => {
  knownChannels.add("visible"); knownChannels.add("revoked");
  await testDb.insert(discussionChannels).values([{ id: "visible", kind: "global" }, { id: "revoked", kind: "course" }]);
  await testDb.insert(notifications).values([
   { id: "visible-notification", userId: "owner", title: "Title", body: "Body", type: "discussion", read: false, metadata: { channelId: "visible" }, createdAt: eventTime },
   { id: "revoked-notification", userId: "owner", title: "Title", body: "Body", type: "discussion", read: false, metadata: { channelId: "revoked" }, createdAt: eventTime },
   { id: "ordinary-notification", userId: "owner", title: "Title", body: "Body", type: "announcement", read: false, metadata: {}, createdAt: eventTime },
  ]);
  denied.add("owner:revoked");
  expect((await (await GET(new NextRequest("http://localhost/api/notifications/history"))).json()).unreadCount).toBe(2);
  expect((await PATCH(new NextRequest("http://localhost/api/notifications/read", { method: "PATCH", body: JSON.stringify({ all: true }) }))).status).toBe(200);
  const rows = await testDb.select().from(notifications);
  expect(rows.find(row => row.id === "revoked-notification")?.read).toBe(false);
  expect(rows.filter(row => row.id !== "revoked-notification").every(row => row.read)).toBe(true);
  denied.delete("owner:revoked");
  expect((await (await GET(new NextRequest("http://localhost/api/notifications/history"))).json()).unreadCount).toBe(1);
 });

 test("uses one batched channel scope lookup as history grows", async () => {
  knownChannels.add("channel-0");
  await testDb.insert(discussionChannels).values({ id: "channel-0", kind: "global" });
  await testDb.insert(notifications).values({ id: "row-0", userId: "owner", title: "Title", body: "Body", type: "discussion", read: false,
   metadata: { channelId: "channel-0" }, createdAt: eventTime });
  expect((await (await GET(new NextRequest("http://localhost/api/notifications/history?countOnly=true"))).json()).unreadCount).toBe(1);
  expect(scopeCalls).toBe(1);
  const rows = Array.from({ length: 599 }, (_, i) => {
   const channelId = `channel-${i + 1}`;
   knownChannels.add(channelId);
   return { id: `row-${i + 1}`, userId: "owner", title: "Title", body: "Body", type: "discussion", read: false,
    metadata: { channelId }, createdAt: eventTime };
  });
  await testDb.insert(notifications).values(rows);
  await testDb.insert(discussionChannels).values(rows.map(row => ({ id: row.metadata.channelId, kind: "course" })));
  scopeCalls = 0;
  expect((await (await GET(new NextRequest("http://localhost/api/notifications/history?countOnly=true"))).json()).unreadCount).toBe(600);
  expect(scopeCalls).toBe(1);
 });
});
