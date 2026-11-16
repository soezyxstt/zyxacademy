import { afterAll, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";

const client = await PGlite.create();
const db = drizzle(client, { schema });
await client.exec(`
 create table discussion_channels (id text primary key);
 create table discussion_threads (
   id text primary key, channel_id text not null, author_id text not null, title text not null,
   status text not null default 'open', status_revision integer not null default 0, labels jsonb not null default '[]'::jsonb, help_kind text,
   next_seq integer not null default 1, answer_count integer not null default 0,
   created_at timestamptz not null default now(), last_activity_at timestamptz not null default now()
 );
 create table discussion_thread_reads (user_id text, thread_id text, through_seq integer);
 create table discussion_messages (thread_id text, seq integer, deleted_at timestamptz, author_id text);
 insert into discussion_channels values ('channel');
 insert into discussion_threads (id, channel_id, author_id, title, status, last_activity_at)
 select 'closed-' || n, 'channel', 'author', 'Target closed', 'resolved', '2027-01-01'::timestamptz from generate_series(1, 35) n;
 insert into discussion_threads (id, channel_id, author_id, title, status, last_activity_at)
 select 'open-' || lpad(n::text, 2, '0'), 'channel', 'author', 'Target open', 'open', '2026-01-01'::timestamptz from generate_series(1, 31) n;
`);

mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db }));
mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() }));
mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
mock.module("@/lib/discussions/access", () => ({
  discussionChannelsWithThreads: () => undefined,
  getDiscussionActor: async (id: string) => ({ id, role: "student" }),
  getAccessibleDiscussionChannels: async (_id: string, input: { channelIds: string[] }) => input.channelIds.includes("channel") ? [{ id: "channel" }] : [],
  getDiscussionChannelVisibility: async () => ({ predicate: undefined }),
  requireDiscussionChannelAccess: async () => ({}), requireDiscussionCourse: async () => ({}),
  requireDiscussionMessageAccess: async () => ({}), requireDiscussionThreadAccess: async () => ({}), resolveDiscussionCourses: async () => new Map(),
}));
const { listThreadsAcrossChannels } = await import("@/lib/discussions/service");
afterAll(() => client.close());

test("open targets are filtered before cursor and limit while ordinary listing keeps both statuses", async () => {
  const ordinary = await listThreadsAcrossChannels("viewer", { channelId: "channel", search: "Target" });
  expect(ordinary.items).toHaveLength(30);
  expect(ordinary.items.every((thread) => thread.status === "resolved")).toBe(true);
  const first = await listThreadsAcrossChannels("viewer", { channelId: "channel", search: "Target", status: "open" });
  expect(first.items).toHaveLength(30);
  expect(first.items.every((thread) => thread.status === "open")).toBe(true);
  expect(first.nextCursor).toBeTruthy();
  const next = await listThreadsAcrossChannels("viewer", { channelId: "channel", search: "Target", status: "open", cursor: first.nextCursor! });
  expect(next.items).toHaveLength(1);
  expect(new Set([...first.items, ...next.items].map((thread) => thread.id)).size).toBe(31);
  expect(next.nextCursor).toBeNull();
  expect((await listThreadsAcrossChannels("viewer", { search: "Target", status: "resolved" })).items).toHaveLength(30);
  await expect(listThreadsAcrossChannels("viewer", { status: "anything" as never })).rejects.toThrow("DISCUSSION_INVALID");
});
