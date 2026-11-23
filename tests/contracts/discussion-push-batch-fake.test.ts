import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import * as orm from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import ts from "typescript";
import * as schema from "@/db/schema";
import { validDiscussionId } from "@/lib/discussions/policy";
import { DEFAULT_LOCALE, normalizeLocale } from "@/lib/i18n/locale";
import { dispatchTokensByTransport } from "@/lib/notifications/dispatch";
import { discussionPayload, renderNotificationPayload } from "@/lib/notifications/templates";

type Row = Record<string, any>;
const dialect = new PgDialect();

function harness(count: number, tokenFor: (index: number) => boolean = () => true) {
 const ids = Array.from({ length: count }, (_, i) => `member-${String(i).padStart(3, "0")}`);
 const tokenRows = ids.flatMap((userId, i) => tokenFor(i) ? [{ userId, token: `token-${userId}` }] : []);
 const inbox = new Map<string, { id: string; userId: string; read: boolean; metadata: { pushState: string; pushContinue?: boolean; pushCursor?: string }; attempted?: number; succeeded?: number; failedCount?: number; sentAt?: Date | null }>(ids.map(userId => [userId, { id: `inbox-${userId}`, userId, read: false, metadata: { pushState: "pending" } }]));
 const denied = new Set<string>(), muted = new Set<string>();
 const providerCalls: string[] = [];
 const persisted: Row[] = [];
 let tokenQueries = 0, outcomeQueries = 0, pruneQueries = 0, queries = 0, active = 0, maxActive = 0;
 let providerFailure = "", invalidToken = "", writeFailure = "", insertFailure = "";
 let inboxId = 0;
 const accountPageSizes: number[] = [];
 const db: Row = {};
 db.select = () => ({ from: (table: never) => ({ where: (condition: never) => {
  queries++;
  const name = orm.getTableName(table);
  if (name === "user") return { orderBy: () => ({ limit: async (limit: number) => {
   const cursor = condition ? String(dialect.sqlToQuery(condition).params[0]) : "";
   const page = ids.filter(id => id > cursor).slice(0, limit).map(id => ({ id }));
   accountPageSizes.push(page.length);
   return page;
  } }) };
  if (name === "user_push_tokens") {
   tokenQueries++;
   const selected = new Set(dialect.sqlToQuery(condition).params);
   return tokenRows.filter(row => selected.has(row.userId));
  }
  if (name === "discussion_channel_preferences") return [...muted].map(userId => ({ userId, muted: true, updatedAt: new Date("2025-01-01") }));
  return [];
 } }) });
 db.update = (table: never) => ({ set: (values: Row) => ({ where: (condition: never) => {
  queries++;
  if (orm.getTableName(table) === "discussion_events") return { returning: async () => [{ processedAt: new Date() }] };
  const selected = new Set(dialect.sqlToQuery(condition).params);
  for (const row of inbox.values()) if (selected.has(row.id)) row.metadata.pushState = "done";
  for (const row of persisted) if (selected.has(row.id)) Object.assign(row, values);
  return Promise.resolve();
 } }) });
 db.execute = async (query: never) => {
  queries++;
  const compiled = dialect.sqlToQuery(query);
  const params = compiled.params;
  if (compiled.sql.includes('from "user_push_tokens"')) {
   tokenQueries++;
   const recipients = JSON.parse(params[0] as string) as Array<{ user_id: string; after_id: string | null }>;
   return { rows: recipients.flatMap(recipient => tokenRows.filter(row => row.userId === recipient.user_id)
    .map(row => ({ ...row, id: row.token })).filter(row => !recipient.after_id || row.id > recipient.after_id)
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0).slice(0, 101)) };
  }
  outcomeQueries++;
  if (writeFailure && params.includes(`inbox-${writeFailure}`)) throw new Error("one outcome failed");
  for (let i = 0; i < params.length; i += 7) {
   const row = [...inbox.values()].find(item => item.id === params[i]);
   if (!row) throw new Error("unknown inbox row");
   Object.assign(row, { attempted: (row.attempted ?? 0) + Number(params[i + 1]), succeeded: (row.succeeded ?? 0) + Number(params[i + 2]), failedCount: (row.failedCount ?? 0) + Number(params[i + 3]), sentAt: params[i + 4] ?? row.sentAt ?? null });
   row.metadata.pushContinue = params[i + 6] !== null;
   if (params[i + 6]) row.metadata.pushCursor = String(params[i + 6]);
   else if (params[i + 5]) row.metadata.pushState = "done";
  }
 };
 db.delete = () => ({ where: async (condition: never) => {
  queries++; pruneQueries++;
  const selected = new Set(dialect.sqlToQuery(condition).params);
  for (let i = tokenRows.length - 1; i >= 0; i--) if (selected.has(tokenRows[i].token)) tokenRows.splice(i, 1);
 } });
 db.insert = () => ({ values: async (row: Row) => {
  if (row.userId === insertFailure) throw new Error("inbox write failed");
  persisted.push(row);
 } });
 const dependencies: Row = {
  "node:crypto": { createHash }, crypto: { randomUUID: () => "inbox-fake-" + ++inboxId }, "drizzle-orm": orm, "@/db": { db }, "@/db/schema": schema,
  "@/lib/firebase/admin": { adminMessaging: () => ({ sendEachForMulticast: async ({ tokens }: { tokens: string[] }) => {
   active++; maxActive = Math.max(maxActive, active);
   await Promise.resolve();
   providerCalls.push(...tokens);
   active--;
   return { responses: tokens.map(token => token === `token-${providerFailure}` ? { success: false, error: { code: "messaging/unavailable" } }
    : token === `token-${invalidToken}` ? { success: false, error: { code: "messaging/registration-token-not-registered" } } : { success: true }) };
  } }) },
  "@/lib/i18n/preferences": { getUserLocalePreference: async () => "en" },
  "@/lib/i18n/locale": { DEFAULT_LOCALE, normalizeLocale },
  "@/lib/notifications/templates": { discussionPayload, renderNotificationPayload },
  "./apns": { sendApnsNotifications: async () => ({ succeeded: 0, failedTokens: [], errors: [] }) },
  "./dispatch": { dispatchTokensByTransport },
  "./templates": { renderNotificationPayload },
  "@/lib/discussions/access": {}, "@/lib/discussions/policy": { validDiscussionId },
  "@/lib/discussions/recipient-access": { getDiscussionRecipientAccess: async (_channel: string, recipients: string[]) => {
   queries += 2;
   return new Map(recipients.filter(id => !denied.has(id)).map(id => [id, { id, role: "student" }]));
  } },
 };
 function load(path: string, extra = "") {
  const output = ts.transpileModule(readFileSync(path, "utf8") + extra, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: Row = {};
  runInNewContext(output, { exports, process: { env: { FIREBASE_SERVICE_ACCOUNT_JSON: "fake" } }, Date, Error, console, require: (name: string) => {
   if (!(name in dependencies)) throw new Error(name);
   return dependencies[name];
  } });
  return exports;
 }
 dependencies["@/lib/notifications/send"] = load("lib/notifications/send.ts");
 const { testPushBatch } = load("lib/discussions/notifications.ts", "\nexport { pushBatch as testPushBatch }; ");
 const event = { id: "event", channelId: "channel", threadId: "thread", actorId: "actor", kind: "message",
  status: "processing", processedAt: new Date(), createdAt: new Date("2026-01-01") };
 return {
  ids, inbox, denied, muted, providerCalls, persisted, tokens: tokenRows, accountPageSizes,
  setInsertFailure: (id: string) => { insertFailure = id; },
  setProviderFailure: (id: string) => { providerFailure = id; }, setInvalidToken: (id: string) => { invalidToken = id; },
  setWriteFailure: (id: string) => { writeFailure = id; },
  counts: () => ({ queries, tokenQueries, outcomeQueries, pruneQueries, maxActive }),
  push: async (batch: string[]) => testPushBatch(event, batch.map(id => inbox.get(id)), 2, "actor"),
  broadcast: async () => dependencies["@/lib/notifications/send"].sendBroadcast({ title: "Notice", body: "Update", type: "admin_broadcast" }),
  ordinary: async (userId: string) => dependencies["@/lib/notifications/send"].sendToUser(userId,
   discussionPayload({ role: "student", channelId: "channel", threadId: "thread", seq: 2 })),
 };
}

test("the ordinary sender still writes one localized inbox row", async () => {
 const fake = harness(1);
 expect(await fake.ordinary(fake.ids[0])).toMatchObject({ attempted: 1, succeeded: 1, errors: [] });
 expect(fake.persisted).toHaveLength(1);
 expect(fake.persisted[0]).toMatchObject({ userId: fake.ids[0], title: "Discussion update", attempted: 1, succeeded: 1 });
});

test("broadcast pages all accounts, bounds fanout, and reports missing inbox writes", async () => {
 const fake = harness(105, i => i % 2 === 0);
 fake.setInsertFailure(fake.ids[0]);
 expect(await fake.broadcast()).toMatchObject({ attempted: 52, succeeded: 52, errors: ["inbox write failed"] });
 expect(fake.accountPageSizes).toEqual([100, 5]);
 expect(fake.persisted).toHaveLength(104);
 expect(fake.persisted.some(row => row.userId === fake.ids[1] && row.attempted === 0)).toBe(true);
 expect(fake.counts().maxActive).toBeLessThanOrEqual(10);
 expect(fake.providerCalls).not.toContain("token-" + fake.ids[0]);
});

for (const mode of ["none", "all", "mixed"] as const) {
 test(`Firebase enabled batches 100 and 500 recipients with ${mode} tokens using bounded SQL`, async () => {
  for (const count of [100, 500]) {
   const fake = harness(count, i => mode === "all" || (mode === "mixed" && i % 2 === 0));
   for (let i = 0; i < count; i += 10) await fake.push(fake.ids.slice(i, i + 10));
   expect(fake.counts().tokenQueries).toBe(count / 10);
   expect(fake.counts().outcomeQueries).toBe(count / 10);
   expect(fake.counts().maxActive).toBeLessThanOrEqual(10);
   expect(fake.providerCalls).toHaveLength(mode === "all" ? count : mode === "mixed" ? count / 2 : 0);
   expect([...fake.inbox.values()].every(row => row.metadata.pushState === "done")).toBe(true);
  }
 });
}

test("per-recipient provider failures, invalid tokens, no tokens, revoked access and mute remain isolated", async () => {
 const fake = harness(10, i => i !== 3);
 const [failed, dead, muted, , revoked] = fake.ids;
 fake.tokens.push({ userId: failed, token: `second-${failed}` });
 fake.setProviderFailure(failed); fake.setInvalidToken(dead); fake.muted.add(muted); fake.denied.add(revoked);
 await fake.push(fake.ids);
 expect(fake.inbox.get(failed)).toMatchObject({ attempted: 2, succeeded: 1, failedCount: 1, metadata: { pushState: "pending" } });
 expect(fake.inbox.get(dead)).toMatchObject({ attempted: 1, succeeded: 0, failedCount: 1, metadata: { pushState: "done" } });
 expect(fake.inbox.get(fake.ids[3])).toMatchObject({ attempted: 0, sentAt: null, metadata: { pushState: "done" } });
 expect(fake.providerCalls).not.toContain(`token-${muted}`);
 expect(fake.providerCalls).not.toContain(`token-${revoked}`);
 expect(fake.tokens.some(row => row.userId === dead)).toBe(false);
 expect(fake.counts().pruneQueries).toBe(1);
 fake.setProviderFailure("");
 await fake.push([failed]);
 expect(fake.inbox.get(failed)?.metadata.pushState).toBe("done");
 expect(fake.providerCalls.filter(token => token === `token-${fake.ids[5]}`)).toHaveLength(1);
});

test("an outcome write failure isolates the recipient without immediately resending successful pushes", async () => {
 const fake = harness(10);
 const failed = fake.ids[4];
 fake.setWriteFailure(failed);
 await fake.push(fake.ids);
 expect(fake.inbox.get(failed)?.metadata.pushState).toBe("pending");
 expect(fake.ids.filter(id => fake.inbox.get(id)?.metadata.pushState === "done")).toHaveLength(9);
 expect(fake.providerCalls).toHaveLength(10);
 fake.setWriteFailure("");
 await fake.push([failed]);
 expect(fake.providerCalls).toHaveLength(11);
 expect(fake.inbox.get(failed)?.metadata.pushState).toBe("done");
});

test("a 1201-token recipient resumes bounded pages without omitting devices and rechecks revocation", async () => {
 const fake = harness(1, () => false);
 const userId = fake.ids[0];
 for (let i = 0; i < 1201; i++) fake.tokens.push({ userId, token: `device-${String(i).padStart(4, "0")}` });
 await fake.push([userId]);
 expect(fake.providerCalls).toHaveLength(100);
 expect(fake.inbox.get(userId)?.metadata.pushState).toBe("pending");
 expect(fake.inbox.get(userId)?.metadata.pushCursor).toBe("device-0099");
 for (let page = 1; page < 13; page++) await fake.push([userId]);
 expect(fake.providerCalls).toHaveLength(1201);
 expect(new Set(fake.providerCalls).size).toBe(1201);
 expect(fake.inbox.get(userId)?.metadata.pushState).toBe("done");
 expect(fake.counts().tokenQueries).toBe(13);

 const revoked = harness(1, () => false);
 for (let i = 0; i < 201; i++) revoked.tokens.push({ userId, token: `device-${String(i).padStart(4, "0")}` });
 await revoked.push([userId]);
 revoked.denied.add(userId);
 await revoked.push([userId]);
 expect(revoked.providerCalls).toHaveLength(100);
 expect(revoked.inbox.get(userId)?.metadata.pushState).toBe("done");
});
