import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { signDiscussionReadReceipt, verifyDiscussionReadReceipt } from "@/lib/discussions/read-receipt";

const secret = "fixture secret";
const source = readFileSync("lib/discussions/service.ts", "utf8");
const start = source.indexOf("export async function markRead(");
const end = source.indexOf("\nexport async function setMute", start);
const code = ts.transpileModule(source.slice(start, end), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const notificationSource = readFileSync("lib/discussions/notifications.ts", "utf8");
const policyStart = notificationSource.indexOf("function allowedByState(");
const policyEnd = notificationSource.indexOf("\nasync function failDelivery", policyStart);
const policyCode = ts.transpileModule(`${notificationSource.slice(policyStart, policyEnd)}\nexport { allowedByState };`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const policyExports: Record<string, any> = {};
runInNewContext(policyCode, { exports: policyExports });

function setup() {
 const reads = { userId: "reads.user", threadId: "reads.thread", observedSeq: "reads.observed", throughSeq: "reads.through", seenStatusRevision: "reads.status" };
 const messages = { id: "message.id", threadId: "message.thread", seq: "message.seq" };
 const observations = { messageId: "observation.message", userId: "observation.user", revision: "observation.revision" };
 const threads = { id: "thread.id" };
 const preferences = { userId: "preference.user", channelId: "preference.channel", readRevision: "preference.revision" };
 const rows = [{ id: "m1", seq: 1, authorId: "other", deleted: false }, { id: "m2", seq: 2, authorId: "other", deleted: false }];
 let read = { observedSeq: 2, throughSeq: 0, seenStatusRevision: null as number | null };
 let seen = new Map<string, number>();
 let readRevision = 0;
 const cleared: number[] = [];
 const inbox: Array<{ event: any; userId: string; threadId: string; seq: number; read: boolean }> = [];
 const allowed = (event: any, userId: string, seq: number, currentRead: typeof read, currentSeen: Map<string, number>) => policyExports.allowedByState(event, userId, seq, {
  preferences: new Map(), reads: new Map([["alice", currentRead]]), observations: new Map(currentSeen.has(event.messageId) ? [["alice", currentSeen.get(event.messageId)]] : []),
 });
 const op = (name: string) => (field: string, value: unknown) => ({ name, field, value });
 const and = (...parts: unknown[]) => parts;
 const db = { transaction: async (work: (tx: any) => Promise<unknown>) => {
  const nextRead = { ...read }, nextSeen = new Map(seen);
  let nextRevision = readRevision;
  const tx = {
   snapshot: () => ({ read: nextRead, seen: nextSeen }),
   select: () => {
    let table: unknown, conditions: any[] = [];
    const query = {
     from(value: unknown) { table = value; return this; },
     leftJoin() { return this; },
     where(value: unknown) { conditions = [value].flat(Infinity).filter(Boolean); return this; },
     for: async () => [{ id: "thread" }],
     limit: async () => {
      if (table === reads) return [{ seq: nextRead.observedSeq, throughSeq: nextRead.throughSeq }];
      if (table === threads) return [{ unread: rows.some(row => !row.deleted && row.authorId !== "alice" && row.seq > read.throughSeq && row.seq <= nextRead.throughSeq)
       && !rows.some(row => !row.deleted && row.authorId !== "alice" && row.seq > nextRead.throughSeq) }];
      if (table === messages) {
       const lower = conditions.find(item => item.name === "gt" && item.field === messages.seq)?.value ?? 0;
       const upper = conditions.find(item => item.name === "lte" && item.field === messages.seq)?.value ?? 0;
       const missing = rows.find(row => row.seq > lower && row.seq <= upper && !nextSeen.has(row.id));
       return missing ? [missing] : [];
      }
      throw new Error("unexpected select");
     },
    };
    return query;
   },
   insert: (table: unknown) => ({ values: (values: any) => {
    if (table === observations) return { onConflictDoUpdate: async () => {
     for (const value of values) nextSeen.set(value.messageId, Math.max(nextSeen.get(value.messageId) ?? 0, value.revision));
    } };
    if (table === reads) return { onConflictDoUpdate: () => ({ returning: async () => {
     nextRead.throughSeq = Math.max(nextRead.throughSeq, values.throughSeq);
     nextRead.seenStatusRevision = Math.max(nextRead.seenStatusRevision ?? -1, values.seenStatusRevision);
     return [{ throughSeq: nextRead.throughSeq }];
    } }) };
    if (table === preferences) return { onConflictDoUpdate: async () => { nextRevision++; } };
    throw new Error("unexpected insert");
   } }),
  };
  const result = await work(tx);
  read = nextRead; seen = nextSeen; readRevision = nextRevision;
  return result;
 } };
 const exports: Record<string, any> = {};
 const sql = () => ({});
 runInNewContext(code, { exports, db, discussionThreadReads: reads, discussionMessages: messages,
  discussionMessageObservations: observations, discussionThreads: threads, discussionChannelPreferences: preferences, PAGE_SIZE: 30,
  getDiscussionActor: async (id: string) => ({ id, role: "student" }), requireDiscussionThreadAccess: async () => ({ channel: { id: "channel" } }),
  checkId: () => {}, invalid: () => new Error("DISCUSSION_INVALID"), unavailable: () => new Error("DISCUSSION_UNAVAILABLE"), admit: async () => {},
  verifyDiscussionReadReceipt, resolveAuthSecret: () => secret,
  and, eq: op("eq"), gt: op("gt"), lte: op("lte"), isNull: (field: string) => ({ name: "null", field }), sql,
  clearDiscussionNotificationsThroughSeq: async (tx: { snapshot: () => { read: typeof read; seen: Map<string, number> } }, input: { userId: string; threadId: string; throughSeq: number }) => {
   cleared.push(input.throughSeq);
   const current = tx.snapshot();
   inbox.filter(row => row.userId === input.userId && row.threadId === input.threadId)
    .forEach(row => { if (!allowed(row.event, row.userId, row.seq, current.read, current.seen)) row.read = true; });
  },
 });
 return { markRead: exports.markRead as (userId: string, threadId: string, through: number, receipt: string, ids: string[]) => Promise<{ throughSeq: number }>,
  read: () => read, seen: () => seen, revision: () => readRevision, rows, cleared, inbox,
  mayDeliver: (event: any, userId = "alice", seq = 1) => allowed(event, userId, seq, read, seen) };
}

function receipt(userId: string, threadId: string, messages: Array<{ id: string; seq: number; revision: number }>, statusRevision = 0) {
 return signDiscussionReadReceipt({ userId, threadId, status: "open", statusRevision, messages }, secret);
}

test("acknowledges only signed visible revisions and replay cannot move them backward", async () => {
 const h = setup();
 const old = receipt("alice", "thread", [{ id: "m1", seq: 1, revision: 1 }]);
 expect(await h.markRead("alice", "thread", 1, old, ["m1"])).toEqual({ throughSeq: 1 });
 expect(h.seen().get("m1")).toBe(1);
 const newer = receipt("alice", "thread", [{ id: "m1", seq: 1, revision: 2 }], 2);
 await h.markRead("alice", "thread", 1, newer, ["m1"]);
 await h.markRead("alice", "thread", 1, old, ["m1"]);
 expect(h.seen().get("m1")).toBe(2);
 expect(h.read().seenStatusRevision).toBe(2);
 expect(h.revision()).toBe(0);
 expect(h.cleared).toEqual([1, 1, 1]);
});

test("later pages cannot skip unseen sequences or acknowledge another message's edit", async () => {
 const h = setup();
 const first = receipt("alice", "thread", [{ id: "m1", seq: 1, revision: 1 }]);
 const later = receipt("alice", "thread", [{ id: "m2", seq: 2, revision: 1 }]);
 await expect(h.markRead("alice", "thread", 2, later, ["m2"])).rejects.toThrow("DISCUSSION_INVALID");
 expect(h.revision()).toBe(0);
 expect(h.seen().size).toBe(0);
 await h.markRead("alice", "thread", 1, first, ["m1"]);
 expect(h.revision()).toBe(0);
 await h.markRead("alice", "thread", 2, later, ["m2"]);
 expect(h.revision()).toBe(1);
 expect(h.read().throughSeq).toBe(2);
 expect(h.seen().get("m1")).toBe(1);
 expect(h.seen().get("m2")).toBe(1);
});

test("a signed noncontiguous message clears only its observed revision without advancing the watermark", async () => {
 const h = setup();
 const first = { kind: "edit", messageId: "m1", messageRevision: 2, statusRevision: null };
 const later = { kind: "edit", messageId: "m2", messageRevision: 2, statusRevision: null };
 const newer = { ...later, messageRevision: 3 };
 const status = { kind: "resolved", messageId: null, messageRevision: null, statusRevision: 1 };
 for (const [event, seq] of [[first, 1], [later, 2], [newer, 2], [status, 2]] as const)
  h.inbox.push({ event, userId: "alice", threadId: "thread", seq, read: false });
 const token = receipt("alice", "thread", [{ id: "m2", seq: 2, revision: 2 }], 1);
 expect(await h.markRead("alice", "thread", 0, token, ["m2"])).toEqual({ throughSeq: 0 });
 expect(h.seen().get("m2")).toBe(2);
 expect(h.inbox.map(row => row.read)).toEqual([false, true, false, false]);
 expect(h.mayDeliver(later, "alice", 2)).toBe(false);
 expect(h.mayDeliver(first)).toBe(true);
 expect(h.mayDeliver(newer, "alice", 2)).toBe(true);
 expect(h.mayDeliver(status, "alice", 2)).toBe(true);
 expect(h.revision()).toBe(0);
 await expect(h.markRead("alice", "thread", 2, token, ["m2"])).rejects.toThrow("DISCUSSION_INVALID");
 expect(h.read().throughSeq).toBe(0);
 const firstToken = receipt("alice", "thread", [{ id: "m1", seq: 1, revision: 1 }]);
 await h.markRead("alice", "thread", 2, firstToken, ["m1"]);
 expect(h.read().throughSeq).toBe(2);
 expect(h.seen().get("m2")).toBe(2);
 expect(h.inbox[0].read).toBe(false);
});

test("reading only own or deleted messages leaves count revisions unchanged", async () => {
 const h = setup();
 h.rows[0].authorId = "alice";
 h.rows[1].deleted = true;
 const token = receipt("alice", "thread", [{ id: "m1", seq: 1, revision: 1 }, { id: "m2", seq: 2, revision: 1 }]);
 await h.markRead("alice", "thread", 2, token, ["m1", "m2"]);
 expect(h.read().throughSeq).toBe(2);
 expect(h.revision()).toBe(0);
});

test("an edit between response and acknowledgment stays unread in inbox and outbox until its revision is seen", async () => {
 const h = setup();
 const first = receipt("alice", "thread", [{ id: "m1", seq: 1, revision: 1 }]);
 const lateEdit = { kind: "edit", messageId: "m1", messageRevision: 2, statusRevision: null, createdAt: new Date("2020-01-01") };
 h.inbox.push({ event: lateEdit, userId: "alice", threadId: "thread", seq: 1, read: false });
 await h.markRead("alice", "thread", 1, first, ["m1"]);
 expect(h.inbox[0].read).toBe(false);
 expect(h.mayDeliver(lateEdit)).toBe(true);
 const updated = receipt("alice", "thread", [{ id: "m1", seq: 1, revision: 2 }]);
 await h.markRead("alice", "thread", 1, updated, ["m1"]);
 expect(h.inbox[0].read).toBe(true);
 expect(h.mayDeliver(lateEdit)).toBe(false);
});

test("rejects cross-user, cross-thread, uncovered and forged observations", async () => {
 const h = setup();
 const token = receipt("alice", "thread", [{ id: "m1", seq: 1, revision: 1 }]);
 await expect(h.markRead("bob", "thread", 1, token, ["m1"])).rejects.toThrow("DISCUSSION_INVALID");
 await expect(h.markRead("alice", "other", 1, token, ["m1"])).rejects.toThrow("DISCUSSION_INVALID");
 await expect(h.markRead("alice", "thread", 1, token, ["m2"])).rejects.toThrow("DISCUSSION_INVALID");
 const [, sig] = token.split(".");
 const forged = Buffer.from(JSON.stringify({ userId: "alice", threadId: "thread", status: "open", statusRevision: 999,
  messages: [{ id: "m1", seq: 1, revision: 999 }] })).toString("base64url");
 await expect(h.markRead("alice", "thread", 1, `${forged}.${sig}`, ["m1"])).rejects.toThrow("DISCUSSION_INVALID");
 expect(h.seen().size).toBe(0);
});

test("an empty thread can acknowledge its observed status without inventing message reads", async () => {
 const h = setup();
 const token = receipt("alice", "thread", [], 3);
 expect(await h.markRead("alice", "thread", 0, token, [])).toEqual({ throughSeq: 0 });
 expect(h.read().seenStatusRevision).toBe(3);
 expect(h.seen().size).toBe(0);
});
