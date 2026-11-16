import { beforeEach, describe, expect, mock, test } from "bun:test";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const request: { id: string; requestId: string; kind: string; status: string; requestedById: string; messageId: string; answerMessageId: string | null } =
 { id: "request", requestId: "provider-key", kind: "zyra", status: "processing", requestedById: "author", messageId: "source", answerMessageId: null };
const source = { id: "source", threadId: "thread", authorId: "author", askZyra: true, deletedAt: null, revision: 1, seq: 2, forwardedFromId: null, skinId: null };
const previous = { id: "previous", threadId: "thread", authorId: "other", askZyra: false, deletedAt: null, revision: 3, seq: 1, forwardedFromId: null, skinId: null };
const thread = { id: "thread", status: "open", nextSeq: 3 };
let rows = [source, previous], attempts: { id: string }[] = [], attachments: { id: string; messageId: string }[] = [], revoked = false;
let trace: string[] = [], writes: string[] = [];
let inserted: Record<string, Record<string, unknown>> = {};
let threadUpdate: Record<string, unknown> | undefined;
const selection = (table: string) => table === "discussion_ai_requests" ? [request]
 : table === "discussion_messages" ? rows : table === "discussion_attachments" ? attachments : table === "student_quiz_attempts" ? attempts : table === "discussion_threads" ? [thread] : [];
const tx = {
 select: () => {
  let table = "";
  const builder = {
   from(value: never) { table = getTableName(value); return this; },
   where() { return this; }, orderBy() { return this; }, limit() { return this; },
   for(mode: string) { trace.push(`${table}:${mode}`); return Promise.resolve(table === "discussion_messages" && trace.filter(item => item === "discussion_messages:share").length > 1 ? rows.filter(row => row.seq < source.seq && !row.deletedAt) : selection(table)); },
   then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) { return Promise.resolve(selection(table)).then(resolve, reject); },
  };
  return builder;
 },
 update: (table: never) => ({ set: (values: Record<string, unknown>) => ({ where: async () => {
  writes.push(`update:${getTableName(table)}`);
  if (getTableName(table) === "discussion_threads") threadUpdate = values;
 } }) }),
 insert: (table: never) => ({ values: async (value: Record<string, unknown>) => { const name = getTableName(table); writes.push(`insert:${name}`); inserted[name] = value; } }),
};
mock.module("@/db", () => ({ db: { transaction: async (work: (connection: typeof tx) => Promise<unknown>) => work(tx) } }));
mock.module("@/lib/discussions/access", () => ({
 getDiscussionActor: async () => ({ id: "author", role: "student" }),
 requireDiscussionMessageAccess: async (_actor: unknown, id: string) => {
  if (revoked || !rows.some(row => row.id === id)) throw new Error("DISCUSSION_UNAVAILABLE");
  return { channel: { id: "channel" }, thread, message: source };
 },
}));
const { publishDiscussionZyraAnswer } = await import("@/lib/discussions/ai-publication");

const snapshot = { contextIds: ["previous", "source"], attachmentSets: [{ messageId: "previous", ids: [] }, { messageId: "source", ids: [] }] };
beforeEach(() => { rows = [source, previous]; attempts = []; attachments = []; revoked = false; trace = []; writes = []; inserted = {}; threadUpdate = undefined; thread.status = "open"; request.status = "processing"; request.answerMessageId = null; });

describe("AI publication transaction", () => {
 test("locks and validates every source revision before allocating a sequence", async () => {
  await expect(publishDiscussionZyraAnswer("request", "Answer", [{ id: "source", revision: 1 }, { id: "previous", revision: 2 }], snapshot)).rejects.toThrow("DISCUSSION_AI_SOURCE_CHANGED");
  expect(writes).toEqual([]);
  trace = [];
  const result = await publishDiscussionZyraAnswer("request", "Answer", [{ id: "source", revision: 1 }, { id: "previous", revision: 3 }], snapshot);
  expect(result.threadId).toBe("thread");
  expect(trace.indexOf("discussion_threads:update")).toBeLessThan(trace.indexOf("discussion_messages:share"));
  expect(writes).toEqual(["update:discussion_threads", "insert:discussion_messages", "update:discussion_ai_requests", "insert:discussion_events"]);
  expect(inserted.discussion_messages.revision).toBe(1);
  expect(inserted.discussion_events.messageRevision).toBe(1);
  expect(inserted.discussion_events.participantThroughSeq).toBe(3);
  const count = new PgDialect().sqlToQuery(threadUpdate!.answerCount as never);
  expect(count.sql).toContain('"discussion_threads"."answer_count" + 1');
 });
 test("rejects missing snapshots, deleted context, revoked access, active attempts and resolved threads", async () => {
  await expect(publishDiscussionZyraAnswer("request", "Answer")).rejects.toThrow("DISCUSSION_AI_SOURCE_CHANGED");
  rows = [source, { ...previous, deletedAt: new Date() } as never];
  await expect(publishDiscussionZyraAnswer("request", "Answer", [{ id: "source", revision: 1 }, { id: "previous", revision: 3 }], snapshot)).rejects.toThrow("DISCUSSION_AI_SOURCE_CHANGED");
  rows = [source, previous]; revoked = true;
  await expect(publishDiscussionZyraAnswer("request", "Answer", [{ id: "source", revision: 1 }])).rejects.toThrow();
  revoked = false; attempts = [{ id: "quiz" }]; trace = [];
  await expect(publishDiscussionZyraAnswer("request", "Answer", [{ id: "source", revision: 1 }, { id: "previous", revision: 3 }], snapshot)).rejects.toThrow("DISCUSSION_AI_SOURCE_CHANGED");
  attempts = []; thread.status = "resolved";
  trace = [];
  await expect(publishDiscussionZyraAnswer("request", "Answer", [{ id: "source", revision: 1 }, { id: "previous", revision: 3 }], snapshot)).rejects.toThrow("DISCUSSION_AI_SOURCE_CHANGED");
  expect(writes).toEqual([]);
 });
 test("a forwarded context message must include its original in the snapshot", async () => {
  rows = [source, { ...previous, forwardedFromId: "original" }];
  await expect(publishDiscussionZyraAnswer("request", "Answer", [{ id: "source", revision: 1 }, { id: "previous", revision: 3 }], snapshot)).rejects.toThrow("DISCUSSION_AI_SOURCE_CHANGED");
  expect(writes).toEqual([]);
 });
 test("rejects an added attachment even when the captured set was empty", async () => {
  attachments = [{ id: "late", messageId: "source" }];
  await expect(publishDiscussionZyraAnswer("request", "Answer", [{ id: "source", revision: 1 }, { id: "previous", revision: 3 }], snapshot)).rejects.toThrow("DISCUSSION_AI_SOURCE_CHANGED");
  expect(writes).toEqual([]);
 });
 test("replaying a completed request never increments the answer count", async () => {
  request.status = "completed"; request.answerMessageId = "saved-answer";
  expect(await publishDiscussionZyraAnswer("request", "Answer")).toEqual({ messageId: "saved-answer", threadId: "thread" });
  expect(writes).toEqual([]);
  expect(threadUpdate).toBeUndefined();
 });
});
