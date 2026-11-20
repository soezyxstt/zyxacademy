import { expect, mock, test } from "bun:test";
import { drizzle } from "drizzle-orm/pg-proxy";
import * as schema from "@/db/schema";

const queries: Array<{ sql: string; params: unknown[] }> = [];
let denied = "";
const db = drizzle(async (sql, params) => {
 queries.push({ sql, params });
 if (/from "discussion_channels"/i.test(sql)) return { rows: [["global", "global", "Global", null, null, null, new Date(), "0"]] };
 if (/from "pengguna".*inner join/i.test(sql)) return { rows: params
  .filter((id): id is string => typeof id === "string" && id.startsWith("recipient-") && id !== denied)
  .map(id => [id, "murid"]) };
 return { rows: [] };
}, { schema });
mock.module("@/db", () => ({ db }));
const { requireDiscussionMentionAccess } = await import("@/lib/discussions/access");

test("mention authorization emits three ordered share locks and bounded batch queries", async () => {
 const ids = Array.from({ length: 10 }, (_, i) => `recipient-${i}`);
 await requireDiscussionMentionAccess(db as never, "global", ids.slice(0, 1));
 const one = [...queries];
 queries.length = 0;
 await requireDiscussionMentionAccess(db as never, "global", ids);
 expect(queries).toHaveLength(one.length);
 expect(queries).toHaveLength(5);
 const locks = queries.filter(query => /for share/i.test(query.sql));
 expect(locks).toHaveLength(3);
 for (const lock of locks) {
  expect(lock.sql).toMatch(/order by/i);
  expect(lock.params).toEqual(ids);
 }
 denied = ids[9];
 await expect(requireDiscussionMentionAccess(db as never, "global", ids)).rejects.toThrow("DISCUSSION_UNAVAILABLE");
});
