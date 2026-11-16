import { expect, mock, test } from "bun:test";
import { drizzle } from "drizzle-orm/pg-proxy";

const queries: Array<{ sql: string; params: unknown[] }> = [];
const db = drizzle(async (sql, params) => { queries.push({ sql, params }); return { rows: [] }; });
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db }));
mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() }));
mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
mock.module("@/lib/discussions/access", () => ({
  getDiscussionActor: async (id: string) => ({ id, role: "student" }),
  getAccessibleDiscussionChannels: async () => [{ id: "channel" }],
  getDiscussionChannelVisibility: async () => ({ predicate: undefined }),
  requireDiscussionChannelAccess: async () => ({}), requireDiscussionCourse: async () => ({}),
  requireDiscussionMessageAccess: async () => ({}), requireDiscussionThreadAccess: async () => ({}), resolveDiscussionCourses: async () => new Map(),
}));
const { listThreadsAcrossChannels } = await import("@/lib/discussions/service");

test("the open predicate is part of the paginated SQL and ordinary listing remains unfiltered", async () => {
  const cursor = Buffer.from(JSON.stringify({ at: "2026-01-01T00:00:00.000000Z", id: "last" })).toString("base64url");
  await listThreadsAcrossChannels("viewer", { channelId: "channel", status: "open", cursor });
  const filtered = queries.at(-1)!;
  const where = filtered.sql.slice(filtered.sql.indexOf(" where "), filtered.sql.indexOf(" order by "));
  expect(where).toContain('"discussion_threads"."status" =');
  expect(where).toContain('"discussion_threads"."last_activity_at" <');
  expect(filtered.params).toContain("open");
  expect(filtered.params.at(-1)).toBe(31);
  expect(filtered.sql).toContain(" limit ");
  await listThreadsAcrossChannels("viewer", { channelId: "channel" });
  const ordinary = queries.at(-1)!;
  const ordinaryWhere = ordinary.sql.slice(ordinary.sql.indexOf(" where "), ordinary.sql.indexOf(" order by "));
  expect(ordinaryWhere).not.toContain('"discussion_threads"."status" =');
  await expect(listThreadsAcrossChannels("viewer", { status: "anything" as never })).rejects.toThrow("DISCUSSION_INVALID");
});
