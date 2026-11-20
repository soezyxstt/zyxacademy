import { expect, mock, test } from "bun:test";
import { drizzle } from "drizzle-orm/pg-proxy";
import * as schema from "@/db/schema";

const queries: Array<{ sql: string; params: unknown[] }> = [];
let role = "murid", revoked = false;
const db = drizzle(async (sql, params) => {
 queries.push({ sql, params });
 if (/from "user"/i.test(sql)) return { rows: [["owner"]] };
 if (/from "pengguna"/i.test(sql)) return { rows: [["active"]] };
 if (/from "pengguna_peran"/i.test(sql)) return { rows: [[role]] };
 if (/select distinct/i.test(sql) && /from "discussion_channels"/i.test(sql)) return { rows: [[null, null]] };
 if (/from "discussion_channel_preferences"/i.test(sql)) return { rows: [] };
 if (/filter \(where/i.test(sql) && /from "discussion_threads"/i.test(sql)) {
  return { rows: [["global", 1, 1], ...params.some(value => Array.isArray(value) && value.includes("private")) ? [["private", 1, 1]] : []] };
 }
 if (/select "id" from "discussion_channels"/i.test(sql)) return { rows: [["global"], ...revoked ? [] : [["private"]]] };
 if (/from "discussion_channels"/i.test(sql)) return { rows: [
  ["global", "global", "Global", null, null, null, new Date(), "0"],
  ...revoked ? [] : [["private", "academic", "Private", null, null, "owner", new Date(), "0"]],
 ] };
 throw new Error(`Unexpected query: ${sql}`);
}, { schema });
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db }));
mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() }));
mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
const { getDiscussionCounts } = await import("@/lib/discussions/service");
const { notificationVisibility } = await import("@/lib/notifications/discussion-history");

test("counts query thread channels directly and rechecks current access for each role", async () => {
 for (role of ["murid", "tutor", "admin"]) {
  queries.length = 0;
  revoked = false;
  const result = await getDiscussionCounts("owner");
  expect(result.total).toEqual({ unreadThreads: 2, activeThreads: 2 });
  expect(result.scopes.academic).toEqual({ unreadThreads: 1, activeThreads: 1 });
  const scope = queries.find(query => /select distinct/i.test(query.sql) && /discussion_channels/i.test(query.sql));
  expect(scope?.sql).toMatch(/\(select 1 from "discussion_threads"[^;]*limit 1\) is not null/i);
  if (role !== "murid") expect(scope?.sql).toContain('"count_revision" > 0');
  expect(queries.filter(query => /^select (?:"discussion_channels"\.)?"id" from /i.test(query.sql) && /discussion_threads/i.test(query.sql))).toHaveLength(2);
  const aggregates = queries.filter(query => /filter \(where/i.test(query.sql) && /discussion_threads/i.test(query.sql));
  expect(aggregates).toHaveLength(1);
  expect(aggregates[0].params.some(value => Array.isArray(value) && value.includes("private"))).toBe(true);
  const channelReads = queries.filter(query => /^select/i.test(query.sql) && /from "discussion_channels"/i.test(query.sql));
  expect(channelReads.some(query => query.params.includes("private"))).toBe(true);
  await getDiscussionCounts("owner");
  expect(queries.filter(query => /filter \(where/i.test(query.sql) && /discussion_threads/i.test(query.sql))).toHaveLength(1);
  revoked = true;
  expect((await getDiscussionCounts("owner")).total).toEqual({ unreadThreads: 1, activeThreads: 1 });
 }
});

test("history discovers only the owner's referenced channels without requiring a thread", async () => {
 queries.length = 0;
 await notificationVisibility("owner", "viewer");
 const scopes = queries.filter(query => /select distinct/i.test(query.sql) && /discussion_channels/i.test(query.sql));
 expect(scopes).toHaveLength(2);
 for (const scope of scopes) {
  expect(scope.sql).toMatch(/from "notifications"/i);
  expect(scope.sql).not.toMatch(/discussion_threads/i);
  expect(scope.params).toContain("owner");
  expect(scope.params).toContain("discussion");
 }
});

test("unread and selected notification operations scope entitlement discovery", async () => {
 for (const options of [{ unreadOnly: true }, { ids: ["one-notification"] }]) {
  queries.length = 0;
  await notificationVisibility("owner", "owner", options);
  const scopes = queries.filter(query => /select distinct/i.test(query.sql) && /discussion_channels/i.test(query.sql));
  expect(scopes).toHaveLength(1);
  if ("unreadOnly" in options) expect(scopes[0].sql).toContain('"notifications"."read"');
  else expect(scopes[0].params).toContain("one-notification");
 }
});
