import { afterAll, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";

const client = await PGlite.create();
await client.exec(`
 create table "user" (id text primary key);
 create table pengguna (id text primary key, status text not null);
 create table peran (id text primary key, code text not null);
 create table pengguna_peran (id text primary key, pengguna_id text not null, peran_id text not null);
 create table gamification_social_rate_limits (user_id text not null, action text not null, window_key text not null, attempts bigint not null, expires_at timestamptz not null, primary key (user_id, action, window_key));
 create table discussion_channels (id text primary key, kind text not null, title text not null, course_id text, legacy_course_id text, requester_id text, created_at timestamptz not null default now(), count_revision bigint not null default 0);
 create table discussion_threads (id text primary key, channel_id text not null, author_id text not null, title text not null, status text not null default 'open', labels jsonb not null default '[]', help_kind text, next_seq int not null default 1, answer_count int not null default 0 check (answer_count >= 0), created_at timestamptz not null default now(), last_activity_at timestamptz not null default now());
 create table discussion_messages (id text primary key, thread_id text not null, author_id text, kind text not null, message_type text not null, body text not null, seq int not null, request_id text not null, revision int not null default 1, reply_to_id text, forwarded_from_id text, skin_id text, mention_handles jsonb, mention_ids jsonb not null default '[]', ask_zyra bool not null default false, created_at timestamptz not null default now(), edited_at timestamptz, deleted_at timestamptz, deleted_by_id text);
 create table discussion_thread_participants (thread_id text not null, user_id text not null, channel_id text, first_seq int not null, first_created_at timestamptz not null, earliest_created_at timestamptz not null, earliest_created_seq int not null, primary key (thread_id, user_id));
 create table discussion_events (id text primary key, channel_id text not null, thread_id text not null, message_id text, actor_id text not null, kind text not null, status text not null default 'pending', created_at timestamptz not null default now(), processed_at timestamptz, attempts int not null default 0, error_code text, recipient_cursor text, retry_at timestamptz not null default now());
 create table discussion_notification_deliveries (event_id text not null, user_id text not null, staff_only bool not null default false, attempts int not null default 0, retry_at timestamptz not null default now(), primary key (event_id, user_id));
 create table activity_notification_preferences (user_id text primary key, discussions_enabled boolean not null default true, flashcards_enabled boolean not null default true, updated_at timestamptz not null default now());
 create table account_locale_preferences (user_id text primary key, locale text not null, updated_at timestamptz not null default now());
 create table discussion_ai_requests (id text primary key, message_id text not null, requested_by_id text not null, kind text not null, status text not null default 'pending', request_id text not null, result_text text, answer_message_id text, error_code text, attempts int not null default 0, created_at timestamptz not null default now(), started_at timestamptz, completed_at timestamptz, updated_at timestamptz not null default now());
 create table discussion_channel_preferences (user_id text not null, channel_id text not null, muted bool not null default false, read_revision bigint not null default 0 check (read_revision >= 0), updated_at timestamptz not null default now(), primary key (user_id, channel_id));
 create table discussion_thread_reads (user_id text not null, thread_id text not null, through_seq int not null default 0, observed_seq int not null default 0, updated_at timestamptz not null default now());
 create table notifications (id text primary key, user_id text not null, title text not null, body text not null, type text not null, read bool not null default false, metadata jsonb not null, attempted bigint not null default 0, succeeded bigint not null default 0, failed_count bigint not null default 0, sent_at timestamptz, created_at timestamptz not null default now());
 create index idx_notifications_user_type_read_thread on notifications (user_id, type, read, (metadata->>'threadId')) where metadata->>'threadId' is not null;
 alter table discussion_threads add column status_revision integer not null default 0;
 alter table discussion_messages add column submission_fingerprint text;
 alter table discussion_events add column message_revision integer, add column status_revision integer,
  add column participant_through_seq integer check (participant_through_seq is null or participant_through_seq >= 0);
 alter table discussion_thread_reads add column seen_status_revision integer;
 create table discussion_message_observations (message_id text not null, user_id text not null, revision integer not null check (revision > 0), primary key (message_id, user_id));
 create table discussion_attachments (id text primary key, message_id text);
`);
let queries = 0;
let participantQueries: Array<{ query: string; params: unknown[] }> = [];
const db = drizzle(client, { schema, logger: { logQuery: (query, params) => {
 queries++;
 if (query.includes('from "discussion_thread_participants"')) participantQueries.push({ query, params });
} } });
const originalFirebase = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db }));
mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => [] }));
mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
mock.module("@/lib/i18n/preferences", () => ({ getUserLocalePreference: async () => "en" }));
const { createThread, reply, edit, deleteMessage, setResolved, forward } = await import("@/lib/discussions/service");
const { dispatchDiscussionEvents } = await import("@/lib/discussions/notifications");
afterAll(async () => {
 if (originalFirebase === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
 else process.env.FIREBASE_SERVICE_ACCOUNT_JSON = originalFirebase;
 await client.close();
});

test("a queued mention does not notify a nonparticipant after an edit", async () => {
 await client.exec(`insert into "user" values ('alice'), ('bob'); insert into pengguna values ('alice', 'active'), ('bob', 'active'); insert into peran values ('student-role', 'murid'); insert into pengguna_peran values ('membership-alice', 'alice', 'student-role'), ('membership-bob', 'bob', 'student-role')`);
 await db.insert(schema.discussionChannels).values({ id: "global", kind: "global", title: "Global" });
 const question = await createThread("alice", { channelId: "global", title: "Question", body: "Hello", mentionIds: ["bob"], attachmentIds: [], askZyra: false, requestId: "create-question" });
 expect(await createThread("alice", { channelId: "global", title: "Question", body: "Hello", mentionIds: ["bob"], attachmentIds: [], askZyra: false, requestId: "create-question" })).toEqual(question);
 expect((await db.select().from(schema.discussionThreadParticipants)).map(row => [row.userId, row.firstSeq])).toEqual([["alice", 1]]);
 await edit("alice", question.messageId, "Updated", 1);
 expect((await db.select().from(schema.discussionMessages))[0].mentionIds).toEqual([]);
 for (let i = 0; i < 20; i++) {
  const result = await dispatchDiscussionEvents();
  if (!result.hasMore) break;
 }
 const events = await db.select().from(schema.discussionEvents);
 expect(events).toHaveLength(2);
 expect(events.every(event => event.status === "completed")).toBe(true);
 expect(events.map(event => [event.kind, event.participantThroughSeq])).toEqual([["question", 1], ["edit", 1]]);
 const inbox = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, "bob"));
 expect(inbox).toHaveLength(0);
}, 120_000);

test("writers persist the serialized participant cutoff independently of revisions and timestamps", async () => {
 await client.exec(`
  truncate notifications, discussion_notification_deliveries, account_locale_preferences, discussion_events, discussion_ai_requests,
   discussion_messages, discussion_thread_participants, discussion_threads, discussion_channels, discussion_channel_preferences,
   discussion_thread_reads, gamification_social_rate_limits, pengguna_peran, pengguna, peran, "user";
  insert into "user" values ('alice'), ('bob'), ('carol'), ('dave');
  insert into pengguna values ('alice', 'active'), ('bob', 'active'), ('carol', 'active'), ('dave', 'active');
  insert into peran values ('student-role', 'murid');
  insert into pengguna_peran values ('a', 'alice', 'student-role'), ('b', 'bob', 'student-role'), ('c', 'carol', 'student-role'), ('d', 'dave', 'student-role');
  insert into discussion_channels (id, kind, title) values ('global', 'global', 'Global');
 `);
 const question = await createThread("alice", { channelId: "global", title: "Question", body: "Hello", mentionIds: [], attachmentIds: [], askZyra: false, requestId: "create-question" });
 const submit = (requestId: string) => ({ threadId: question.threadId, body: "Answer", messageType: "answer" as const,
  mentionIds: [], attachmentIds: [], askZyra: false, requestId });
 const bob = await reply("bob", submit("bob-answer"));
 const carol = await reply("carol", submit("carol-answer"));
 await edit("alice", question.messageId, "Updated", 1);
 await deleteMessage("carol", carol.messageId);
 await setResolved("alice", question.threadId, true);
 await setResolved("alice", question.threadId, false);
 const forwarded = await forward("dave", question.messageId, question.threadId, "dave-forward");
 const later = await reply("dave", submit("dave-answer"));
 await db.update(schema.discussionEvents).set({ createdAt: new Date("2000-01-01T00:00:00Z") }).where(and(
  eq(schema.discussionEvents.messageId, carol.messageId), eq(schema.discussionEvents.kind, "message")));
 const rows = await db.select().from(schema.discussionEvents);
 const eventFor = (kind: string, messageId: string | null) => rows.find(row => row.kind === kind && row.messageId === messageId)!;
 expect(eventFor("question", question.messageId).participantThroughSeq).toBe(1);
 expect(eventFor("message", bob.messageId).participantThroughSeq).toBe(2);
 expect(eventFor("message", carol.messageId).participantThroughSeq).toBe(3);
 expect(eventFor("edit", question.messageId)).toMatchObject({ messageRevision: 2, participantThroughSeq: 3 });
 expect(eventFor("delete", carol.messageId)).toMatchObject({ messageRevision: 2, participantThroughSeq: 3 });
 expect(rows.filter(row => row.kind === "resolved").sort((a, b) => a.statusRevision! - b.statusRevision!)
  .map(row => [row.statusRevision, row.participantThroughSeq])).toEqual([[1, 3], [2, 3]]);
 expect(eventFor("message", forwarded.messageId).participantThroughSeq).toBe(4);
 expect(eventFor("message", later.messageId).participantThroughSeq).toBe(5);
 const bobParticipant = (await db.select().from(schema.discussionThreadParticipants)).find(row => row.userId === "bob")!;
 expect(bobParticipant.firstSeq).toBe(2);
 expect(bobParticipant.firstCreatedAt.getTime()).toBeGreaterThan(eventFor("message", carol.messageId).createdAt.getTime());
}, 120_000);

test("participant fanout avoids message history for 10,000 messages by two authors", async () => {
 await client.exec(`
  truncate notifications, discussion_notification_deliveries, account_locale_preferences, discussion_events,
   discussion_messages, discussion_thread_participants, discussion_threads, discussion_channels, discussion_channel_preferences,
   discussion_thread_reads, pengguna_peran, pengguna, peran, "user";
  insert into "user" values ('alice'), ('bob');
  insert into pengguna values ('alice', 'active'), ('bob', 'active');
  insert into peran values ('student-role', 'murid');
  insert into pengguna_peran values ('membership-alice', 'alice', 'student-role'), ('membership-bob', 'bob', 'student-role');
  insert into discussion_channels (id, kind, title) values ('global', 'global', 'Global');
  insert into discussion_threads (id, channel_id, author_id, title, next_seq) values ('thread', 'global', 'alice', 'Question', 10001);
  insert into discussion_messages (id, thread_id, author_id, kind, message_type, body, seq, request_id, created_at)
   select 'message-' || n, 'thread', case when n % 2 = 1 then 'alice' else 'bob' end, 'human', 'answer', 'Answer', n,
    'request-' || n, '2026-01-01T00:00:00Z'::timestamptz from generate_series(1, 10000) n;
  insert into discussion_thread_participants (thread_id, user_id, channel_id, first_seq, first_created_at, earliest_created_at, earliest_created_seq)
   select thread_id, author_id, 'global', min(seq), (array_agg(created_at order by seq))[1], min(created_at), (array_agg(seq order by created_at, seq))[1]
   from discussion_messages where author_id is not null group by thread_id, author_id;
  insert into discussion_events (id, channel_id, thread_id, message_id, actor_id, kind, created_at, recipient_cursor, participant_through_seq)
   values ('event', 'global', 'thread', 'message-10000', 'bob', 'message', '2026-01-02T00:00:00Z', '{"phase":"direct","after":null,"mentions":[]}', 10000);
 `);
 participantQueries = [];
 for (let i = 0; i < 20; i++) {
  const result = await dispatchDiscussionEvents();
  expect(result.failed).toBe(0);
  if (!result.hasMore) break;
 }
 expect(participantQueries.length).toBeGreaterThanOrEqual(1);
 const query = participantQueries.find(entry => /order by/i.test(entry.query))!;
 expect(query).toBeDefined();
 const explained = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.query}`, query.params);
 const root = (explained.rows[0] as any)["QUERY PLAN"][0].Plan;
 const nodes: any[] = [];
 const visit = (node: any) => { nodes.push(node); for (const child of node.Plans ?? []) visit(child); };
 visit(root);
 expect(nodes.filter(node => node["Relation Name"] === "discussion_messages").every(node => node["Actual Loops"] === 0)).toBe(true);
 expect((await db.select().from(schema.notifications)).map(row => row.userId)).toEqual(["alice"]);
}, 120_000);

test("real global authorization and inbox fanout keep SQL work bounded per 100 recipients", async () => {
 async function measure(count: number) {
  await client.exec(`
   truncate notifications, discussion_notification_deliveries, account_locale_preferences, discussion_events,
    discussion_messages, discussion_thread_participants, discussion_threads, discussion_channels, discussion_channel_preferences, discussion_thread_reads,
    pengguna_peran, pengguna, peran, "user";
   insert into "user" select 'member-' || lpad(n::text, 4, '0') from generate_series(1, ${count}) n;
   insert into "user" values ('owner'), ('actor');
   insert into pengguna select id, 'active' from "user";
   insert into peran values ('student-role', 'murid');
   insert into pengguna_peran select 'membership-' || id, id, 'student-role' from "user";
   insert into discussion_channels (id, kind, title) values ('global', 'global', 'Global');
   insert into discussion_threads (id, channel_id, author_id, title) values ('thread', 'global', 'owner', 'Question');
   insert into discussion_messages (id, thread_id, author_id, kind, message_type, body, seq, request_id, created_at)
    select 'message-' || n, 'thread', 'member-' || lpad(n::text, 4, '0'), 'human', 'answer', 'Answer', n, 'request-' || n, now() - interval '1 minute'
    from generate_series(1, ${count}) n;
   insert into discussion_messages (id, thread_id, author_id, kind, message_type, body, seq, request_id)
    values ('source', 'thread', 'actor', 'human', 'answer', 'Answer', ${count + 1}, 'source-request');
   insert into discussion_thread_participants (thread_id, user_id, channel_id, first_seq, first_created_at, earliest_created_at, earliest_created_seq)
    select thread_id, author_id, 'global', min(seq), (array_agg(created_at order by seq))[1], min(created_at), (array_agg(seq order by created_at, seq))[1]
    from discussion_messages where author_id is not null group by thread_id, author_id;
   update discussion_threads set answer_count = ${count + 1}, next_seq = ${count + 2} where id = 'thread';
   insert into discussion_events (id, channel_id, thread_id, message_id, actor_id, kind, recipient_cursor, participant_through_seq)
    values ('event', 'global', 'thread', 'source', 'actor', 'message', '{"phase":"direct","after":null,"mentions":[]}', ${count + 1});
  `);
  queries = 0;
  for (let i = 0; i < 30; i++) {
   const result = await dispatchDiscussionEvents();
   expect(result.failed).toBe(0);
   if (!result.hasMore) return queries;
  }
  throw new Error("unexpected notification continuation loop");
 }
 const hundred = await measure(100);
 const fiveHundred = await measure(500);
 expect(hundred).toBeLessThan(140);
 expect(fiveHundred).toBeLessThanOrEqual(hundred + 4 * 35);
}, 120_000);
