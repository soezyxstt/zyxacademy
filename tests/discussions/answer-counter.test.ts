import { beforeEach, expect, mock, test } from "bun:test";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();
type Message = { id: string; threadId: string; authorId: string; messageType: string; requestId: string; body: string;
 mentionIds: string[]; askZyra: boolean; skinId: string | null; replyToId: string | null; deletedAt: Date | null; forwardedFromId?: string | null };
let state: { thread: { id: string; authorId: string; status: string; nextSeq: number; answerCount: number }; messages: Message[]; events: string[]; participants: string[] };
let failReward = false, failEvent = false;
let locks: Array<{ table: string; mode: string }> = [];
const tx = {
 select: () => {
  let table = "", condition: unknown;
  const query = {
   from(value: never) { table = getTableName(value); return this; },
   where(value: unknown) { condition = value; return this; },
   limit() { return this; },
   for(mode: string) { locks.push({ table, mode }); return Promise.resolve(result()); },
   then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve(result()).then(resolve, reject); },
  };
  function result() {
   if (table === "discussion_threads") return [state.thread];
   if (table !== "discussion_messages") return [];
   const compiled = dialect.sqlToQuery(condition as never), params = compiled.params;
   return state.messages.filter(message => params.length === 1 ? params[0] === message.id
    : ((params.includes(message.id) && params.includes(message.threadId) && (!compiled.sql.includes('"deleted_at" is null') || !message.deletedAt))
      || (params.includes(message.authorId) && params.includes(message.requestId))));
  }
  return query;
 },
 execute: async (query: never) => {
  const compiled = dialect.sqlToQuery(query);
  if (compiled.sql.includes('insert into "discussion_thread_participants"')) {
   const message = state.messages.find(row => compiled.params.includes(row.id));
   if (message && !state.participants.includes(message.authorId)) state.participants.push(message.authorId);
  }
  return { rows: [{ attempts: 1 }] };
 },
 update: (table: never) => ({ set: (values: Record<string, unknown>) => ({ where: async (condition: never) => {
  if (getTableName(table) === "discussion_threads") {
   if (typeof values.nextSeq === "number") state.thread.nextSeq = values.nextSeq;
   if (values.answerCount) {
    const expression = dialect.sqlToQuery(values.answerCount as never).sql;
    state.thread.answerCount += expression.includes("+ 1") ? 1 : -1;
    if (state.thread.answerCount < 0) throw new Error("counter constraint");
   }
  } else if (getTableName(table) === "discussion_messages") {
   const id = dialect.sqlToQuery(condition).params[0];
   const message = state.messages.find(row => row.id === id);
   if (message) message.deletedAt = values.deletedAt as Date;
  }
 } }) }),
 insert: (table: never) => ({ values: async (values: Message) => {
  if (getTableName(table) === "discussion_messages") state.messages.push({ ...values, deletedAt: null });
  if (getTableName(table) === "discussion_events") {
   if (failEvent) throw new Error("event failed");
   state.events.push(values.id);
  }
 } }),
};
const db = { transaction: async (work: (connection: typeof tx) => Promise<unknown>) => {
 const previous = structuredClone(state);
 try { return await work(tx); } catch (error) { state = previous; throw error; }
} };
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: async () => ({}) }));
mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() }));
mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => { if (failReward) throw new Error("reward failed"); } }));
mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
mock.module("@/lib/discussions/access", () => ({
 discussionChannelCandidateScope: () => undefined, getDiscussionChannelVisibility: async () => ({}), getAccessibleDiscussionChannels: async () => [],
 resolveDiscussionCourses: async () => new Map(), getDiscussionActor: async (id: string) => ({ id, role: id === "admin" ? "admin" : "student" }),
 requireDiscussionCourse: async () => ({}), requireDiscussionChannelAccess: async () => ({}),
 requireDiscussionThreadAccess: async () => ({ channel: { id: "channel" }, thread: state.thread }),
 requireDiscussionMessageAccess: async (_actor: unknown, id: string) => {
  const message = state.messages.find(item => item.id === id);
  if (!message) throw new Error("DISCUSSION_UNAVAILABLE");
  return { channel: { id: "channel" }, thread: state.thread, message };
 },
}));
const { reply, deleteMessage, setReaction } = await import("@/lib/discussions/service");
const { DISCUSSION_REACTIONS } = await import("@/lib/discussions/policy");
const submit = (requestId: string) => ({ threadId: "thread", requestId, body: "Answer", attachmentIds: [], mentionIds: [], askZyra: false });

beforeEach(() => {
 failReward = false; failEvent = false; locks = [];
 state = { thread: { id: "thread", authorId: "alice", status: "open", nextSeq: 2, answerCount: 0 },
  messages: [{ id: "question", threadId: "thread", authorId: "alice", messageType: "question", requestId: "question-request", body: "Question",
   mentionIds: [], askZyra: false, skinId: null, replyToId: null, deletedAt: null }], events: [], participants: ["alice"] };
});

test("answer inserts, replays, and deletes change the counter exactly once", async () => {
 const input = { ...submit("answer"), messageType: "answer" as const };
 const answer = await reply("bob", input);
 expect(state.thread.answerCount).toBe(1);
 expect(await reply("bob", input)).toEqual(answer);
 expect(state.participants).toEqual(["alice", "bob"]);
 const contextual = await reply("bob", { ...submit("reply"), messageType: "reply", replyTo: "question" });
 expect(state.thread.answerCount).toBe(1);
 await expect(deleteMessage("alice", answer.messageId)).rejects.toThrow("DISCUSSION_UNAVAILABLE");
 locks = [];
 await deleteMessage("bob", answer.messageId);
 expect(locks).toContainEqual({ table: "discussion_messages", mode: "no key update" });
 expect(state.thread.answerCount).toBe(0);
 await expect(deleteMessage("bob", answer.messageId)).rejects.toThrow("DISCUSSION_UNAVAILABLE");
 expect(await reply("bob", input)).toEqual(answer);
 await deleteMessage("bob", contextual.messageId);
 expect(state.thread.answerCount).toBe(0);
});

test("a failed reward transaction rolls back the answer, sequence, and counter", async () => {
 failReward = true;
 await expect(reply("bob", { ...submit("failed"), messageType: "answer" })).rejects.toThrow("reward failed");
 expect(state.thread).toMatchObject({ nextSeq: 2, answerCount: 0 });
 expect(state.messages).toHaveLength(1);
 expect(state.events).toEqual([]);
});

test("participant writes roll back with a failed event and replay only once", async () => {
 const input = { ...submit("event-failure"), messageType: "answer" as const };
 failEvent = true;
 await expect(reply("bob", input)).rejects.toThrow("event failed");
 expect(state.participants).toEqual(["alice"]);
 expect(state.messages).toHaveLength(1);
 failEvent = false;
 const answer = await reply("bob", input);
 expect(await reply("bob", input)).toEqual(answer);
 expect(state.participants).toEqual(["alice", "bob"]);
});

test("a failed delete event rolls back the tombstone and answer counter", async () => {
 const answer = await reply("bob", { ...submit("delete-failure"), messageType: "answer" });
 failEvent = true;
 await expect(deleteMessage("bob", answer.messageId)).rejects.toThrow("event failed");
 expect(state.thread.answerCount).toBe(1);
 expect(state.messages.find(message => message.id === answer.messageId)?.deletedAt).toBeNull();
 failEvent = false;
 await deleteMessage("bob", answer.messageId);
 expect(state.thread.answerCount).toBe(0);
});

test("an unavailable forward cannot receive replies or reactions", async () => {
 state.messages.push({ id: "forward", threadId: "thread", authorId: "alice", messageType: "forward", requestId: "forward-request", body: "",
  mentionIds: [], askZyra: false, skinId: null, replyToId: null, deletedAt: null, forwardedFromId: "missing" });
 await expect(reply("bob", { ...submit("forward-reply"), messageType: "reply", replyTo: "forward" })).rejects.toThrow("DISCUSSION_UNAVAILABLE");
 expect(state.thread).toMatchObject({ nextSeq: 2, answerCount: 0 });
 expect(state.messages).toHaveLength(2);
 await expect(setReaction("bob", "forward", DISCUSSION_REACTIONS[0], true)).rejects.toThrow("DISCUSSION_UNAVAILABLE");
});
