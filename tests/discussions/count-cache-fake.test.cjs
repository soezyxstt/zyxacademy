const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const orm = require("drizzle-orm");
const { drizzle } = require("drizzle-orm/pg-proxy");

const isBun = typeof Bun !== "undefined";
const bunTest = isBun ? require("bun:test") : null;
const nodeTest = isBun ? null : require("node:test");
const test = (name, optsOrFn, maybeFn) => isBun
 ? (typeof optsOrFn === "function" ? bunTest.test(name, optsOrFn) : bunTest.test(name, maybeFn, optsOrFn?.timeout))
 : nodeTest.test(name, optsOrFn, maybeFn);

const root = path.resolve(__dirname, "../..");
if (!isBun) {
 require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
 }).outputText, filename);
}
const schema = require("../../db/schema.ts");
const channels = [
 { id: "global", kind: "global", courseId: null, legacyCourseId: null, countRevision: 1n },
 { id: "course", kind: "course", courseId: "course-id", legacyCourseId: "legacy-id", countRevision: 1n },
];
const threads = Array.from({ length: 10000 }, (_, id) => ({ id: `thread-${id}`, channelId: "global", status: "open", messages: [{ seq: 1, deleted: false }] }));
threads.push({ id: "course-thread", channelId: "course", status: "open", messages: [{ seq: 1, deleted: false }] });
const state = { allowed: new Set(channels.map(channel => channel.id)), role: "student", reads: new Map([["thread-0", 1]]),
 readVersions: new Map(), aggregates: 0, aggregateVisits: 0, statements: [], failAggregate: false, revokeDuringAggregate: false, addDuringAggregate: null, accessCalls: 0, revokeAtAccess: 0 };
const currentActor = id => {
 if (!state.role) throw new Error("DISCUSSION_UNAVAILABLE");
 return { id, role: state.role };
};
const db = drizzle(async (query, params) => {
 state.statements.push(query);
 if (/from "discussion_channel_preferences"/i.test(query)) {
  const selected = params.find(Array.isArray);
  return { rows: [...state.readVersions].filter(([id]) => selected.includes(id)).map(([id, revision]) => [id, String(revision)]) };
 }
 if (/from "discussion_channels"/i.test(query)) {
  const scoped = params.includes("course-id") || params.includes("legacy-id");
  return { rows: channels.filter(channel => (query.includes('"count_revision" > 0') ? channel.countRevision > 0n : true) && state.allowed.has(channel.id) && threads.some(thread => thread.channelId === channel.id) && (!scoped || channel.id === "course")).map(channel => [channel.id]) };
 }
 if (/filter \(where/i.test(query) && /from "discussion_threads"/i.test(query)) {
  state.aggregates++;
  if (state.failAggregate) { state.failAggregate = false; throw new Error("fixture aggregate failure"); }
  const selected = channels.filter(channel => params.some(value => Array.isArray(value) && value.includes(channel.id)));
  const rows = selected.map(channel => {
   const matching = threads.filter(thread => thread.channelId === channel.id);
   state.aggregateVisits += matching.length;
   return [channel.id, matching.filter(thread => thread.status === "open").length,
    matching.filter(thread => thread.messages.some(message => !message.deleted && message.seq > (state.reads.get(thread.id) ?? 0))).length];
  });
  if (state.revokeDuringAggregate) { state.revokeDuringAggregate = false; state.allowed.delete("course"); }
  if (state.addDuringAggregate) { threads.push(state.addDuringAggregate); channels.find(c => c.id === state.addDuringAggregate.channelId).countRevision++; state.addDuringAggregate = null; }
  return { rows };
 }
 throw new Error(`Unexpected query: ${query}`);
}, { schema });
const access = {
 getDiscussionActor: async id => currentActor(id),
 getDiscussionChannelVisibility: async (id, options) => ({ actor: currentActor(id),
  predicate: orm.and(orm.inArray(schema.discussionChannels.id, [...state.allowed]), options.scope) }),
 getAccessibleDiscussionChannels: async (id, options) => {
  currentActor(id);
  if (++state.accessCalls === state.revokeAtAccess) state.allowed.delete("course");
  return channels.filter(channel => state.allowed.has(channel.id) && options.channelIds.includes(channel.id));
 },
};
const load = Module._load;
if (isBun) {
 bunTest.mock.module("server-only", () => ({}));
 bunTest.mock.module("@/db", () => ({ db }));
 bunTest.mock.module("@/lib/db", () => ({ db }));
 bunTest.mock.module("@/lib/auth-secret", () => ({ resolveAuthSecret: () => "" }));
 bunTest.mock.module("@/lib/pka-config", () => ({ PKA_COURSE_ID: "tutorial-pka" }));
 bunTest.mock.module("@/lib/discussions/access", () => ({
  ...access, requireDiscussionChannelAccess: async () => ({}), requireDiscussionCourse: async () => ({}),
  requireDiscussionMessageAccess: async () => ({}), requireDiscussionThreadAccess: async () => ({}),
  resolveDiscussionCourses: async () => new Map(), discussionChannelsWithThreads: () => undefined,
  discussionChannelsWithPendingReports: () => undefined, discussionChannelCandidateScope: () => undefined,
 }));
 bunTest.mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() }));
 bunTest.mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
 bunTest.mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
 bunTest.mock.module("@/lib/discussions/participants", () => ({ recordDiscussionParticipant: async () => {} }));
 bunTest.mock.module("@/lib/discussions/read-receipt", () => ({ signDiscussionReadReceipt: () => "", verifyDiscussionReadReceipt: () => null }));
 bunTest.mock.module("@/lib/discussions/recipient-access", () => ({ getDiscussionRecipientAccess: async () => new Map() }));
} else {
 Module._load = function (request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/db") return { db };
  if (parent?.filename.endsWith(path.join("lib", "discussions", "service.ts"))) {
   if (request === "./access") return access;
   if (request.startsWith("./") && request !== "./count-cache" && request !== "./policy") return {};
   if (request === "@/lib/auth-secret" || request === "@/lib/pka-config") return {};
  }
  return load.call(this, request.startsWith("@/") ? path.join(root, request.slice(2)) : request, parent, isMain);
 };
}
const { getDiscussionCounts } = require("../../lib/discussions/service.ts");
const cache = require("../../lib/discussions/count-cache.ts");

test("authorized count cache avoids repeat aggregate and invalidates on writes, reads and revocation", async () => {
 const counts = () => getDiscussionCounts("viewer");
 assert.deepEqual((await counts()).total, { unreadThreads: 10000, activeThreads: 10001 });
 assert.equal(state.aggregates, 1);
 assert.equal(state.aggregateVisits, 10001);
 state.statements.length = 0;
 const now = Date.now;
 try {
  const firstPoll = now();
  Date.now = () => firstPoll + 2 * 60 * 1000;
  assert.deepEqual((await counts()).total, { unreadThreads: 10000, activeThreads: 10001 });
 } finally { Date.now = now; }
 assert.equal(state.aggregates, 1, "unchanged poll must not aggregate threads");
 const discoveries = state.statements.filter(statement => /from "discussion_channels"/i.test(statement) && /discussion_threads/i.test(statement));
 assert.equal(discoveries.length, 2, "discovery must run before and after the cached result");
 assert.ok(discoveries.every(statement => /\(select 1 from "discussion_threads"[^;]*order by[^;]*limit 1\) is not null/i.test(statement)));

 threads[0].messages.push({ seq: 2, deleted: false }); channels[0].countRevision++;
 assert.equal((await counts()).total.unreadThreads, 10001);
 state.reads.set("thread-0", 2);
 state.readVersions.set("global", 1n);
 assert.equal((await counts()).total.unreadThreads, 10000);
 threads[1].status = "resolved"; channels[0].countRevision++;
 assert.equal((await counts()).total.activeThreads, 10000);
 threads[2].messages[0].deleted = true; channels[0].countRevision++;
 assert.equal((await counts()).total.unreadThreads, 9999);
 assert.equal(state.aggregates, 5);

 state.allowed.delete("course");
 assert.deepEqual((await counts()).total, { unreadThreads: 9998, activeThreads: 9999 });
 state.role = null;
 await assert.rejects(counts(), /DISCUSSION_UNAVAILABLE/);
 state.role = "student"; state.allowed.add("course"); channels[0].countRevision++;
 state.failAggregate = true;
 await assert.rejects(counts(), error => error.cause?.message === "fixture aggregate failure");
 const failed = state.aggregates;
 await counts();
 assert.equal(state.aggregates, failed + 1, "failed aggregates must not be cached");

 channels[0].countRevision++;
 state.revokeDuringAggregate = true;
 assert.deepEqual((await counts()).total, { unreadThreads: 9998, activeThreads: 9999 });
 assert.equal(state.revokeDuringAggregate, false);
 assert.deepEqual((await getDiscussionCounts("viewer", { courseId: "course-id" })).course, { unreadThreads: 0, activeThreads: 0 });

 state.allowed.add("course");
 await counts();
 state.revokeAtAccess = state.accessCalls + 2;
 assert.deepEqual((await counts()).total, { unreadThreads: 9998, activeThreads: 9999 });
 assert.ok(!state.allowed.has("course"), "cache hit must recheck access before returning");
 state.allowed.add("course");
 const scoped = await getDiscussionCounts("viewer", { courseId: "course-id" });
 assert.deepEqual(scoped.course, { unreadThreads: 1, activeThreads: 1 });
 assert.deepEqual(scoped.scopes.global, { unreadThreads: 0, activeThreads: 0 });
 assert.deepEqual((await getDiscussionCounts("viewer", { courseId: "legacy-id" })).course, scoped.course);
 const beforeRoleChange = state.aggregates;
 state.role = "admin";
 await counts();
 assert.equal(state.aggregates, beforeRoleChange + 1, "a role change must use a new authorization fingerprint");

 const extra = { id: "extra", kind: "academic", courseId: null, legacyCourseId: null, countRevision: 0n };
 channels.push(extra); state.allowed.add(extra.id);
 const unchanged = state.aggregates;
 await counts();
 assert.equal(state.aggregates, unchanged, "empty channels must not change the cached fingerprint");
 extra.countRevision++;
 threads.push({ id: "extra-thread", channelId: extra.id, status: "open", messages: [{ seq: 1, deleted: false }] });
 assert.deepEqual((await counts()).scopes.academic, { unreadThreads: 1, activeThreads: 1 });
 assert.equal(state.aggregates, unchanged + 1, "a newly thread-bearing channel must invalidate the fingerprint");

 const racing = { id: "racing", kind: "academic", courseId: null, legacyCourseId: null, countRevision: 0n };
 channels.push(racing); state.allowed.add(racing.id); channels[0].countRevision++;
 state.addDuringAggregate = { id: "racing-thread", channelId: racing.id, status: "open", messages: [{ seq: 1, deleted: false }] };
 const beforeRace = state.aggregates;
 assert.deepEqual((await counts()).scopes.academic, { unreadThreads: 2, activeThreads: 2 });
 assert.equal(state.aggregates, beforeRace + 2, "a newly thread-bearing channel during aggregation must trigger a retry");
});

test("two-minute polls do not extend the five-minute aggregate lifetime", async () => {
 const now = Date.now;
 const before = state.aggregates;
 try {
  Date.now = () => 10000000;
  await getDiscussionCounts("ttl-viewer");
  Date.now = () => 10000000 + 2 * 60 * 1000;
  await getDiscussionCounts("ttl-viewer");
  Date.now = () => 10000000 + 4 * 60 * 1000;
  await getDiscussionCounts("ttl-viewer");
  assert.equal(state.aggregates, before + 1);
  Date.now = () => 10000000 + 6 * 60 * 1000;
  await getDiscussionCounts("ttl-viewer");
  assert.equal(state.aggregates, before + 2);
 } finally { Date.now = now; }
});

test("cache is bounded, expires and returns independent DTOs", () => {
 const value = { total: { unreadThreads: 1, activeThreads: 1 }, scopes: Object.fromEntries(
  ["global", "course", "technical", "academic"].map(kind => [kind, { unreadThreads: 0, activeThreads: 0 }])), course: null };
 const now = Date.now;
 try {
  Date.now = () => now() + 10 * 60 * 1000;
  const insertedAt = Date.now();
  cache.cacheDiscussionCounts("first", value);
  const first = cache.getCachedDiscussionCounts("first");
  first.total.unreadThreads = 999;
  assert.equal(cache.getCachedDiscussionCounts("first").total.unreadThreads, 1);
  for (let index = 0; index < 256; index++) cache.cacheDiscussionCounts(`entry-${index}`, value);
  assert.equal(cache.getCachedDiscussionCounts("first").total.unreadThreads, 1);
  assert.equal(cache.getCachedDiscussionCounts("entry-255"), undefined);
  let hits = 0;
  for (let index = 0; index < 256; index++) {
   const key = `entry-${index}`;
   if (cache.getCachedDiscussionCounts(key)) hits++;
   else cache.cacheDiscussionCounts(key, value);
  }
  assert.equal(hits, 255, "overflow must not evict all admitted keys during a cyclic poll");
  Date.now = () => insertedAt + 5 * 60 * 1000;
  assert.equal(cache.getCachedDiscussionCounts("entry-255"), undefined);
 } finally { Date.now = now; }
});

test("each admitted scope replaces its obsolete revision without blocking current reuse", async () => {
 const now = Date.now;
 try {
  Date.now = () => now() + 60 * 60 * 1000;
  state.role = "student"; state.allowed.add("global"); state.allowed.add("course");
  for (let i = 0; i < 128; i++) {
   await getDiscussionCounts(`busy-${i}`);
   await getDiscussionCounts(`busy-${i}`, { courseId: "course-id" });
  }
  channels.find(c => c.id === "global").countRevision++;
  for (let i = 0; i < 128; i++) {
   const before = state.aggregates;
   await getDiscussionCounts(`busy-${i}`);
   assert.equal(state.aggregates, before + 1);
   await getDiscussionCounts(`busy-${i}`);
   assert.equal(state.aggregates, before + 1, "new version must replace this scope's stale admission");
  }
 } finally { Date.now = now; }
});
