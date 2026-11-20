import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { validDiscussionId } from "@/lib/discussions/policy";
import { DEFAULT_LOCALE, normalizeLocale } from "@/lib/i18n/locale";

type Row = Record<string, any>;
type Predicate = (row: Row) => boolean;
const table = (name: string, keys: string[]) => ({ name, ...Object.fromEntries(keys.map(key => [key, key])) });
const schema = {
 discussionEvents: table("event", ["id", "status", "processedAt"]), discussionThreads: table("thread", ["id", "authorId", "channelId"]),
 discussionThreadParticipants: table("participant", ["threadId", "userId", "firstSeq"]),
 discussionNotificationDeliveries: table("work", ["eventId", "userId", "staffOnly", "attempts", "retryAt"]),
 discussionChannelPreferences: table("preference", ["userId", "channelId"]), discussionThreadReads: table("read", ["userId", "threadId"]),
 discussionMessageObservations: table("observation", ["messageId", "userId", "revision"]),
 accountLocalePreferences: table("locale", ["userId"]), notifications: table("notification", ["id", "userId"]),
 discussionChannels: table("channel", ["id"]), discussionMessages: table("message", ["id", "threadId", "seq"]),
 pengguna: table("pengguna", []), penggunaPeran: table("penggunaPeran", []), peran: table("peran", []),
};
const orm = {
 eq: (column: string, value: unknown): Predicate => row => row[column] === value,
 gt: (column: string, value: any): Predicate => row => row[column] > value,
 lte: (column: string, value: any): Predicate => row => row[column] <= value,
 asc: (column: string) => column,
 inArray: (column: string, values: unknown[]): Predicate => row => values.includes(row[column]),
 and: (...conditions: Predicate[]): Predicate => row => conditions.filter(Boolean).every(condition => condition(row)),
 sql: () => ({}),
};

function harness(failure: { access?: string; inbox?: string }, options: { participants?: Row[]; denied?: string[]; preferences?: Row[]; reads?: Row[]; observations?: Row[]; message?: Row } = {}) {
 const work = new Map<string, Row>(), inbox = new Map<string, Row>();
 let queries = 0;
 const key = (row: Row) => `${row.eventId}:${row.userId}`;
 const db: Row = {};
 db.transaction = async (callback: (tx: Row) => Promise<unknown>) => callback(db);
 db.select = () => ({
  from: (source: { name: string }) => {
   let condition: Predicate | undefined, joined = false, limit = Infinity;
   const query = {
    where: (value: Predicate) => { condition = value; return query; }, for: () => query,
    innerJoin: () => { joined = true; return query; }, orderBy: () => query, limit: (value: number) => { limit = value; return query; },
    then: (resolve: (rows: Row[]) => unknown) => {
     queries++;
     const rows = source.name === "thread" && joined ? [{ channel: { id: "channel", kind: "global" }, thread: { id: "thread", authorId: "owner" } }]
      : source.name === "event" || source.name === "thread" ? [{ id: source.name }]
      : source.name === "message" ? [options.message ?? { id: "message", threadId: "thread", seq: 6, kind: "human", authorId: "actor", mentionIds: [] }]
      : source.name === "participant" ? options.participants ?? [] : source.name === "preference" ? options.preferences ?? []
      : source.name === "read" ? options.reads ?? [] : source.name === "observation" ? options.observations ?? [] : [];
     return Promise.resolve(resolve((["participant", "preference", "read", "observation"].includes(source.name) ? rows.filter(row => !condition || condition(row)) : rows).slice(0, limit)));
    },
   };
   return query;
  },
 });
 db.insert = (source: { name: string }) => ({
  values: (values: Row[]) => {
   const run = () => {
    queries++;
    if (source.name === "notification" && values.some(row => row.userId === failure.inbox)) throw new Error("inbox failure");
    if (source.name === "notification") {
     for (const row of values) if (!inbox.has(row.id)) inbox.set(row.id, row);
     return [];
    }
    const inserted: Row[] = [];
    for (const value of values) if (!work.has(key(value))) {
     const row = { attempts: 0, retryAt: new Date(), ...value };
     work.set(key(row), row);
     inserted.push(row);
    }
    return inserted;
   };
   const query = {
    onConflictDoNothing: () => query,
    returning: async () => run(),
    then: (resolve: (rows: Row[]) => unknown, reject: (error: unknown) => unknown) => {
     try { return Promise.resolve(resolve(run())); } catch (error) { return Promise.resolve(reject(error)); }
    },
   };
   return query;
  },
 });
 db.delete = () => ({ where: async (condition: Predicate) => {
  queries++;
  for (const [id, row] of work) if (condition(row)) work.delete(id);
 } });
 db.update = (source: { name: string }) => ({ set: (values: Row) => ({ where: (condition: Predicate) => {
  const run = () => {
   queries++;
   if (source.name === "event") return [{ processedAt: new Date() }];
   for (const row of work.values()) if (condition(row)) Object.assign(row, values);
   return [];
  };
  return { returning: async () => run(), then: (resolve: (rows: Row[]) => unknown) => Promise.resolve(resolve(run())) };
 } }) });
 const dependencies: Record<string, unknown> = {
  "node:crypto": { createHash }, "drizzle-orm": orm, "@/db": { db }, "@/db/schema": schema,
  "@/lib/discussions/access": {}, "@/lib/discussions/policy": { validDiscussionId },
  "@/lib/discussions/recipient-access": { getDiscussionRecipientAccess: async (_channel: string, ids: string[]) => {
   queries += 2;
   if (ids.includes(failure.access ?? "")) throw new Error("access failure");
   return new Map(ids.filter(id => !options.denied?.includes(id)).map(id => [id, { id, role: "student" }]));
  } },
  "@/lib/i18n/locale": { DEFAULT_LOCALE, normalizeLocale },
  "@/lib/notifications/templates": { discussionPayload: (input: Row) => input,
   renderNotificationPayload: () => ({ title: "Activity", body: "Activity", metadata: {} }) },
 };
 const source = readFileSync("lib/discussions/notifications.ts", "utf8")
  + "\nexport { queueRecipients as testQueueRecipients, deliverBatch as testDeliverBatch, excludedSender as testExcludedSender, processEvent as testProcessEvent };";
 const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 const exports: Row = {};
 runInNewContext(output, { exports, process: { env: {} }, Date, require: (name: string) => {
  if (!(name in dependencies)) throw new Error(name);
  return dependencies[name];
 } });
 return { work, inbox, queries: () => queries, queue: exports.testQueueRecipients, deliver: exports.testDeliverBatch, exclude: exports.testExcludedSender, process: exports.testProcessEvent };
}

const event = { id: "event", channelId: "channel", threadId: "thread", messageId: "message", messageRevision: 1, actorId: "actor", kind: "message",
 status: "processing", processedAt: new Date(), createdAt: new Date("2026-01-01T00:00:00Z") };

for (const failureType of ["access", "inbox"] as const) {
 test(`isolates a persistent ${failureType} failure while delivering later pages and recovers idempotently`, async () => {
  const failure = { [failureType]: "member-050" };
  const { work, inbox, queue, deliver } = harness(failure);
  const ids = Array.from({ length: 550 }, (_, i) => `member-${String(i).padStart(3, "0")}`);
  for (let i = 0; i < ids.length; i += 100) await queue(event, ids.slice(i, i + 100), false, 1000, "actor");
  expect([...inbox.values()].some(row => row.userId === "member-501")).toBe(true);
  expect([...inbox.values()].some(row => row.userId === "member-050")).toBe(false);
  expect([...work.values()].map(row => row.userId)).toEqual(["member-050"]);
  const pending = [...work.values()][0];
  expect(pending.attempts).toBe(1);
  await deliver(event, [pending], 1000, "actor");
  expect(pending.attempts).toBe(2);
  delete failure[failureType];
  await deliver(event, [pending], 1000, "actor");
  expect(work.size).toBe(0);
  expect(inbox.size).toBe(550);
  await queue(event, ["member-050"], false, 1000, "actor");
  expect(inbox.size).toBe(550);
 });
}

test("batch delivery uses a constant number of fake queries per 100 recipients", async () => {
 const { queue, queries } = harness({});
 const ids = Array.from({ length: 500 }, (_, i) => `member-${i}`);
 await queue(event, ids.slice(0, 100), false, 1000, "actor");
 const hundred = queries();
 expect(hundred).toBe(12);
 for (let i = 100; i < ids.length; i += 100) await queue(event, ids.slice(i, i + 100), false, 1000, "actor");
 expect(queries()).toBe(60);
});

test("a non-owner Zyra invoker remains eligible while a human sender is excluded", async () => {
 const human = harness({});
 const humanExcluded = human.exclude(event, { kind: "human", authorId: "actor" });
 await human.queue(event, ["owner", "actor"], false, 3, humanExcluded);
 expect([...human.inbox.values()].map(row => row.userId)).toEqual(["owner"]);
 const zyra = harness({});
 const zyraExcluded = zyra.exclude(event, { kind: "zyra", authorId: null });
 await zyra.queue(event, ["owner", "actor"], false, 3, zyraExcluded);
 expect([...zyra.inbox.values()].map(row => row.userId)).toEqual(["owner", "actor"]);
 expect(zyra.exclude({ ...event, kind: "report" }, { kind: "human", authorId: "other" })).toBe("actor");
});

test("participant fanout uses sequence instead of transaction timestamps and rechecks mute and access", async () => {
 const participants = [
  { threadId: "thread", userId: "eligible", firstSeq: 5, earliestCreatedAt: new Date("2026-01-02T00:00:00Z") },
  { threadId: "thread", userId: "late", firstSeq: 7, earliestCreatedAt: new Date("2025-12-31T00:00:00Z") },
  { threadId: "thread", userId: "muted", firstSeq: 3 },
  { threadId: "thread", userId: "revoked", firstSeq: 4 },
 ];
 const { process, inbox } = harness({}, { participants, denied: ["revoked"], preferences: [
  { userId: "eligible", channelId: "channel", muted: false, updatedAt: new Date("2026-01-02T00:00:00Z") },
  { userId: "muted", channelId: "channel", muted: true, updatedAt: new Date("2025-12-31T00:00:00Z") },
 ] });
 const result = await process({ ...event, participantThroughSeq: 6, recipientCursor: JSON.stringify({ phase: "participants", after: null }) });
 expect([...inbox.values()].map(row => row.userId)).toEqual(["eligible"]);
 expect(result.cursor.phase).toBe("push");
});

test("legacy partial progress restarts once and preserves the restart marker across pages", async () => {
 const participants = Array.from({ length: 105 }, (_, i) => ({ threadId: "thread", userId: `member-${String(i).padStart(3, "0")}`, firstSeq: i + 1 }));
 const { process, inbox } = harness({}, { participants });
 const legacy = { ...event, participantThroughSeq: null, recipientCursor: JSON.stringify({ phase: "push", after: "member-099" }) };
 const first = await process(legacy);
 expect(first.cursor).toMatchObject({ phase: "participants", after: "member-099", legacyParticipantsRestarted: true });
 expect(inbox.size).toBe(100);
 const second = await process({ ...legacy, recipientCursor: JSON.stringify(first.cursor) });
 expect(second.cursor).toMatchObject({ phase: "push", after: null, legacyParticipantsRestarted: true });
 expect(inbox.size).toBe(105);
 const third = await process({ ...legacy, recipientCursor: JSON.stringify(second.cursor) });
 expect(third.cursor).toMatchObject({ phase: "work", after: null, legacyParticipantsRestarted: true });
 expect(await process({ ...legacy, recipientCursor: JSON.stringify(third.cursor) })).toEqual({});
});

test("fanout suppresses only the observed edit revision beyond the unread watermark", async () => {
 const participants = ["seen", "unseen"].map(userId => ({ threadId: "thread", userId, firstSeq: 2 }));
 const reads = ["seen", "unseen"].map(userId => ({ userId, threadId: "thread", throughSeq: 0 }));
 const observations = [{ userId: "seen", messageId: "message", revision: 2 }, { userId: "unseen", messageId: "message", revision: 1 }];
 const message = { id: "message", threadId: "thread", seq: 2, kind: "human", authorId: "other", mentionIds: [] };
 const { process, inbox } = harness({}, { participants, reads, observations, message });
 await process({ ...event, kind: "edit", messageRevision: 2, participantThroughSeq: 6,
  recipientCursor: JSON.stringify({ phase: "participants", after: null }) });
 expect([...inbox.values()].map(row => row.userId)).toEqual(["unseen"]);
});

test("status notifications respect the observed status revision at the serialized cutoff", async () => {
 const participants = ["seen", "unseen"].map(userId => ({ threadId: "thread", userId, firstSeq: 2 }));
 const reads = [{ userId: "seen", threadId: "thread", throughSeq: 6, seenStatusRevision: 2 },
  { userId: "unseen", threadId: "thread", throughSeq: 6, seenStatusRevision: 1 }];
 const { process, inbox } = harness({}, { participants, reads });
 await process({ ...event, kind: "resolved", messageId: null, statusRevision: 2, participantThroughSeq: 6,
  recipientCursor: JSON.stringify({ phase: "participants", after: null }) });
 expect([...inbox.values()].map(row => row.userId)).toEqual(["unseen"]);
});
