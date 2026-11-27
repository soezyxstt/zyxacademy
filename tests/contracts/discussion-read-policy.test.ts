import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { and, eq, sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import ts from "typescript";
import { discussionEvents, discussionMessageObservations, discussionThreadReads, discussionThreads, notifications } from "@/db/schema";

const source = readFileSync("lib/discussions/notifications.ts", "utf8");
const start = source.indexOf("function allowedByState(");
const end = source.indexOf("\nasync function failDelivery", start);
const code = ts.transpileModule(`${source.slice(start, end)}\nexport { allowedByState };`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exports: Record<string, any> = {};
runInNewContext(code, { exports });
const allowed: (event: any, userId: string, seq: number, state: any) => boolean = exports.allowedByState;
const state = (revision: number | undefined, statusRevision = 1) => ({ preferences: new Map(), activity: new Map(), participants: new Set(["alice", "bob"]),
 reads: new Map([["alice", { throughSeq: 40, seenStatusRevision: statusRevision, updatedAt: new Date("2030-01-01") }]]),
 observations: new Map(revision === undefined ? [] : [["alice", revision]]) });
const event = { kind: "edit", messageId: "m1", messageRevision: 2, statusRevision: null, createdAt: new Date("2020-01-01") };

test("an edit committed after the fetched revision survives an older transaction timestamp", () => {
 expect(allowed(event, "alice", 1, state(1))).toBe(true);
 expect(allowed(event, "alice", 1, state(2))).toBe(false);
 expect(allowed({ ...event, kind: "delete", messageRevision: 3 }, "alice", 1, state(2))).toBe(true);
});

test("later page observations and other users do not acknowledge an unseen earlier edit", () => {
 expect(allowed(event, "alice", 1, state(undefined))).toBe(true);
 expect(allowed(event, "bob", 1, state(2))).toBe(true);
 expect(allowed({ ...event, messageRevision: null }, "alice", 1, state(99))).toBe(true);
});

test("thread status has its own monotonic observation and old events fail closed", () => {
 const resolved = { ...event, kind: "resolved", messageId: null, messageRevision: null, statusRevision: 2 };
 expect(allowed(resolved, "alice", 1, state(5, 1))).toBe(true);
 expect(allowed(resolved, "alice", 1, state(5, 2))).toBe(false);
 expect(allowed({ ...resolved, statusRevision: null }, "alice", 1, state(5, 99))).toBe(true);
 expect(allowed({ ...event, kind: "message", messageRevision: 1 }, "alice", 41, state(5))).toBe(false);
 expect(allowed(resolved, "alice", 41, state(5, 2))).toBe(true);
 expect(allowed({ ...event, messageRevision: 6 }, "alice", 41, state(5))).toBe(true);
});

test("clearing uses accepted per-event revisions and scopes the user and thread", async () => {
 const begin = source.indexOf("export async function clearDiscussionNotificationsThroughSeq(");
 const finish = source.indexOf("\nfunction eligibleEvents", begin);
 const output = ts.transpileModule(source.slice(begin, finish), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
 const moduleExports: Record<string, any> = {};
 runInNewContext(output, { exports: moduleExports, and, eq, sql, discussionEvents, discussionMessageObservations, discussionThreadReads, discussionThreads, notifications });
 let condition: unknown;
 const tx = {
  select: () => ({ from: () => ({ where: () => ({ for: async () => [] }) }) }),
  update: () => ({ set: () => ({ where: async (value: unknown) => { condition = value; } }) }),
 };
 await moduleExports.clearDiscussionNotificationsThroughSeq(tx, { userId: "alice", threadId: "thread", throughSeq: 3 });
 const query = new PgDialect().sqlToQuery(condition as never);
 expect(query.sql).toContain("seen.revision >= event.message_revision");
 expect(query.sql).toContain("seen.seen_status_revision >= event.status_revision");
 expect(query.sql).toContain("event.message_revision is not null");
 expect(query.sql).not.toContain("eventAt");
 expect(query.params).toContain("alice");
 expect(query.params).toContain("thread");
 expect(query.params).toContain(3);
});

test("discussion delivery requires participation or thread authorship and honors opt-out", () => {
 const fresh = { ...state(1), participants: new Set<string>(), activity: new Map<string, { discussionsEnabled: boolean }>() };
 expect(allowed(event, "alice", 1, fresh)).toBe(false);
 expect(exports.allowedByState(event, "alice", 1, fresh, "alice")).toBe(true);
 fresh.participants.add("alice");
 expect(allowed(event, "alice", 1, fresh)).toBe(true);
 fresh.activity.set("alice", { discussionsEnabled: false });
 expect(allowed(event, "alice", 1, fresh)).toBe(false);
 expect(exports.allowedByState(event, "alice", 1, fresh, "alice")).toBe(false);
});
