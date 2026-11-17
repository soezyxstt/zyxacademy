import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import * as orm from "drizzle-orm";
import * as schema from "@/db/schema";
import ts from "typescript";

const source = readFileSync("lib/discussions/service.ts", "utf8");
const compile = (fragment: string) => ts.transpileModule(fragment, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

test("message events retain the exact revision written in their transaction", async () => {
 const start = source.indexOf("async function event(");
 const end = source.indexOf("\nasync function aiRequest", start);
 const exports: Record<string, any> = {};
 const records: any[] = [], bumps: unknown[] = [];
 let revision = 1;
 const tx = {
  select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ revision }] }) }) }),
  insert: () => ({ values: async (value: unknown) => { records.push(value); } }),
  update: () => ({ set: (value: unknown) => ({ where: async () => { bumps.push(value); } }) }),
 };
 runInNewContext(compile(`${source.slice(start, end)}\nexport { event };`), { exports,
  validDiscussionId: (value: unknown) => typeof value === "string", invalid: () => new Error("DISCUSSION_INVALID"),
  and: (...parts: unknown[]) => parts, eq: (...parts: unknown[]) => parts, id: () => "event",
  discussionMessages: { revision: "revision", id: "id", threadId: "threadId" }, discussionEvents: {},
  discussionChannels: { id: "id", countRevision: "countRevision" }, sql: () => ({}), JSON,
 });
 await exports.event(tx, "channel", "thread", "actor", "question", 1, "message", ["alice"]);
 revision = 4;
 await exports.event(tx, "channel", "thread", "actor", "edit", 8, "message", ["alice"]);
 revision = 5;
 await exports.event(tx, "channel", "thread", "actor", "delete", 9, "message");
 await exports.event(tx, "channel", "thread", "actor", "resolved", 10, null, [], 7);
 await exports.event(tx, "channel", "thread", "actor", "report", null);
 expect(records.map(row => [row.kind, row.messageRevision, row.statusRevision, row.participantThroughSeq])).toEqual([
  ["question", 1, null, 1], ["edit", 4, null, 8], ["delete", 5, null, 9], ["resolved", null, 7, 10], ["report", null, null, null],
 ]);
 expect(bumps).toHaveLength(3);
 expect(JSON.parse(records[1].recipientCursor).mentions).toEqual(["alice"]);
 await expect(exports.event(tx, "channel", "thread", "actor", "edit", null, "message")).rejects.toThrow("DISCUSSION_INVALID");
});

test("status transitions increment once and bind the event to the written revision", async () => {
 const start = source.indexOf("export async function setResolved(");
 const end = source.indexOf("\nexport async function searchChannelMentions", start);
 const exports: Record<string, any> = {}, calls: any[] = [];
 const thread = { id: "thread", authorId: "alice", status: "open", statusRevision: 3, nextSeq: 12 };
 const tx = {
  select: () => ({ from: () => ({ where: () => ({ limit: () => ({ for: async () => [thread] }) }) }) }),
  update: () => ({ set: (values: any) => ({ where: async () => { Object.assign(thread, values); } }) }),
 };
 runInNewContext(compile(source.slice(start, end)), { exports, db: { transaction: (work: (tx: unknown) => unknown) => work(tx) },
  getDiscussionActor: async () => ({ id: "alice", role: "student" }), requireDiscussionThreadAccess: async () => ({ channel: { id: "channel" } }),
  checkId: () => {}, admit: async () => {}, invalid: () => new Error("DISCUSSION_INVALID"), unavailable: () => new Error("DISCUSSION_UNAVAILABLE"),
  discussionThreads: { id: "id" }, eq: (...parts: unknown[]) => parts, event: async (...args: unknown[]) => { calls.push(args); }, Date,
 });
 expect(await exports.setResolved("alice", "thread", true)).toEqual({ status: "resolved" });
 expect(thread.statusRevision).toBe(4);
 expect(calls[0].slice(4)).toEqual(["resolved", 11, null, [], 4]);
 await exports.setResolved("alice", "thread", true);
 expect(calls).toHaveLength(1);
});

test("edits and deletes lock the thread before the message and snapshot its current sequence", async () => {
 const start = source.indexOf("export async function edit(");
 const end = source.indexOf("\nexport async function forward(", start);
 const exports: Record<string, any> = {}, calls: any[] = [], locks: string[] = [];
 const threads = { id: "thread-id", answerCount: "answer-count" }, messages = { id: "message-id", revision: "revision", createdAt: "created-at", deletedAt: "deleted-at" };
 const thread = { id: "thread", nextSeq: 12 }, message = { id: "message", mentionIds: ["bob"], messageType: "answer" };
 const tx = {
  select: () => ({ from: (table: unknown) => ({ where: () => ({ limit: () => ({ for: async (mode: string) => {
   locks.push(`${table === threads ? "thread" : "message"}:${mode}`);
   return [table === threads ? thread : message];
  } }) }) }) }),
  update: () => ({ set: () => ({ where: () => ({ returning: async () => [{ revision: 4 }], then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve([])) }) }) }),
 };
 runInNewContext(compile(source.slice(start, end)), { exports, db: { transaction: (work: (tx: unknown) => unknown) => work(tx) },
  getDiscussionActor: async () => ({ id: "alice", role: "admin" }),
  requireDiscussionMessageAccess: async () => ({ channel: { id: "channel" }, thread }),
  checkId: () => {}, admit: async () => {}, invalid: () => new Error("DISCUSSION_INVALID"), unavailable: () => new Error("DISCUSSION_UNAVAILABLE"),
  canEditDiscussionMessage: () => true, canDeleteDiscussionMessage: () => true,
  discussionThreads: threads, discussionMessages: messages, and: (...parts: unknown[]) => parts, eq: (...parts: unknown[]) => parts,
  isNull: (value: unknown) => value, sql: () => ({}), event: async (...args: unknown[]) => { calls.push(args); }, Date,
 });
 await exports.edit("alice", "message", "edited", 3);
 expect(locks.splice(0)).toEqual(["thread:update", "message:update"]);
 expect(calls[0].slice(4)).toEqual(["edit", 11, "message", ["bob"]]);
 await exports.deleteMessage("alice", "message");
 expect(locks).toEqual(["thread:update", "message:no key update"]);
 expect(calls[1].slice(4)).toEqual(["delete", 11, "message"]);
});

test("Zyra publication locks the thread before messages and stores the new sequence", async () => {
 const source = readFileSync("lib/discussions/ai-publication.ts", "utf8");
 const trace: string[] = [], inserted: Record<string, any> = {}, updated: string[] = [];
 const thread = { id: "thread", status: "open", nextSeq: 3 };
 const request = { id: "request", kind: "zyra", status: "processing", requestedById: "author", messageId: "source" };
 const message = { id: "source", threadId: "thread", authorId: "author", askZyra: true, deletedAt: null, revision: 1, seq: 2, forwardedFromId: null, skinId: null };
 const previous = { ...message, id: "previous", authorId: "other", revision: 3, seq: 1, askZyra: false };
 const tx = {
  select: () => {
   let table = "";
   const query = {
    from: (value: never) => { table = orm.getTableName(value); return query; }, where: () => query,
    orderBy: () => query, limit: () => query,
    for: async (mode: string) => {
     trace.push(`${table}:${mode}`);
     if (table === "discussion_ai_requests") return [request];
     if (table === "discussion_threads") return [thread];
     if (table === "discussion_messages") return trace.filter(item => item === "discussion_messages:share").length === 1 ? [message, previous] : [previous];
     return [];
    },
    then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(resolve([])),
   };
   return query;
  },
  update: (value: never) => ({ set: () => ({ where: async () => { updated.push(orm.getTableName(value)); } }) }),
  insert: (value: never) => ({ values: async (row: unknown) => { inserted[orm.getTableName(value)] = row; } }),
 };
 const dependencies: Record<string, unknown> = {
  "drizzle-orm": orm, "@/db": { db: { transaction: (work: (tx: unknown) => unknown) => work(tx) } }, "@/db/schema": schema,
  "./access": { getDiscussionActor: async () => ({ id: "author", role: "student" }),
   requireDiscussionMessageAccess: async () => ({ channel: { id: "channel" }, thread, message }) },
  "./policy": { validDiscussionId: (value: unknown) => typeof value === "string", validDiscussionText: () => true, canForwardDiscussion: () => true },
 };
 const exports: Record<string, any> = {};
 runInNewContext(compile(source), { exports, crypto: webcrypto, Date, require: (name: string) => {
  if (!(name in dependencies)) throw new Error(name);
  return dependencies[name];
 } });
 await exports.publishDiscussionZyraAnswer("request", "Answer", [{ id: "source", revision: 1 }, { id: "previous", revision: 3 }],
  { contextIds: ["previous", "source"], attachmentSets: [{ messageId: "source", ids: [] }, { messageId: "previous", ids: [] }] });
 expect(trace.indexOf("discussion_threads:update")).toBeLessThan(trace.indexOf("discussion_messages:share"));
 expect(inserted.discussion_messages.seq).toBe(3);
 expect(inserted.discussion_events).toMatchObject({ messageRevision: 1, participantThroughSeq: 3 });
 expect(updated).toContain("discussion_channels");
});
