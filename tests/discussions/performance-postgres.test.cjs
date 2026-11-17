const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");
const { drizzle } = require("drizzle-orm/pglite");

const isBun = typeof Bun !== "undefined";
const bunTest = isBun ? require("bun:test") : null;
const nodeTest = isBun ? null : require("node:test");
const test = (name, optsOrFn, maybeFn) => isBun
 ? (typeof optsOrFn === "function" ? bunTest.test(name, optsOrFn) : bunTest.test(name, maybeFn, optsOrFn?.timeout))
 : nodeTest.test(name, optsOrFn, maybeFn);

const root = path.resolve(__dirname, "../..");
const load = Module._load;
let db;
if (!isBun) {
 require.extensions[".ts"] = (module, filename) => {
  const source = fs.readFileSync(filename, "utf8");
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
 };
 Module._load = function (request, parent, isMain) {
  if (request === "@/db" || request === "@/lib/db") return { db };
  if (request === "server-only") return {};
  if (parent?.filename.endsWith(path.join("lib", "discussions", "service.ts"))) {
   if (request === "./images") return { attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() };
   if (request === "./rewards") return { enqueueDiscussionReward: async () => {} };
   if (request === "./notifications") return { clearDiscussionNotificationsThroughSeq: async () => {} };
  }
  return load.call(this, request.startsWith("@/") ? path.join(root, request.slice(2)) : request, parent, isMain);
 };
}
const schema = require("../../db/schema.ts");

function nodes(plan) {
 return [plan, ...(plan.Plans ?? []).flatMap(nodes)];
}

test("PostgreSQL channel pagination and scoped unread aggregates", { timeout: 300000 }, async () => {
 const client = await PGlite.create();
 db = drizzle(client, { schema });
 if (isBun) {
  bunTest.mock.module("server-only", () => ({}));
  bunTest.mock.module("@/db", () => ({ db }));
  bunTest.mock.module("@/lib/db", () => ({ db }));
  bunTest.mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() }));
  bunTest.mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
  bunTest.mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
 }
 const service = require("../../lib/discussions/service.ts");
 try {
  for (const file of fs.readdirSync(path.join(root, "drizzle-postgres")).filter(file => file.endsWith(".sql")).sort())
   await client.exec(fs.readFileSync(path.join(root, "drizzle-postgres", file), "utf8"));
  await client.exec(`
   INSERT INTO "user" (id, name, email, role) VALUES
    ('perf-viewer', 'Viewer', 'perf-viewer@example.test', 'student'),
    ('perf-other', 'Other', 'perf-other@example.test', 'student'),
    ('perf-tutor', 'Tutor', 'perf-tutor@example.test', 'teacher');
   INSERT INTO pengguna (id) VALUES ('perf-viewer'), ('perf-other'), ('perf-tutor');
   INSERT INTO peran (id, code) VALUES ('perf-student-role', 'murid'), ('perf-tutor-role', 'tutor');
   INSERT INTO pengguna_peran (id, pengguna_id, peran_id, source) VALUES
    ('perf-viewer-role', 'perf-viewer', 'perf-student-role', 'test'),
    ('perf-tutor-role-link', 'perf-tutor', 'perf-tutor-role', 'test');
   INSERT INTO courses (id, title, category)
    SELECT 'perf-old-' || n, 'Course ' || n, 'Matematika' FROM generate_series(0, 1020) n;
   INSERT INTO mata_kuliah (id, code, title, legacy_course_id, pricing_category)
    SELECT 'perf-course-' || n, 'PERF-' || n, 'Course ' || n, 'perf-old-' || n,
     CASE WHEN n < 20 OR n = 1020 THEN 'free' ELSE 'premium' END FROM generate_series(0, 1020) n;
   INSERT INTO discussion_channels (id, kind, title, course_id, legacy_course_id)
    SELECT 'perf-channel-' || n, 'course',
     CASE WHEN n < 20 THEN 'Perf A' || lpad(n::text, 2, '0') WHEN n = 1020 THEN 'Perf Z' ELSE 'Perf M' || lpad(n::text, 4, '0') END,
     'perf-course-' || n, CASE WHEN n = 1020 THEN NULL ELSE 'perf-old-' || n END FROM generate_series(0, 1020) n;
   INSERT INTO courses (id, title, category) VALUES ('perf-conflict-old', 'Conflict', 'Matematika'), ('perf-ambiguous-old', 'Ambiguous', 'Matematika');
   INSERT INTO mata_kuliah (id, code, title, legacy_course_id, pricing_category) VALUES
    ('perf-conflict', 'PERF-CONFLICT', 'Conflict', 'perf-conflict-old', 'free'),
    ('perf-ambiguous-a', 'PERF-AMB-A', 'Ambiguous', 'perf-ambiguous-old', 'free'),
    ('perf-ambiguous-b', 'PERF-AMB-B', 'Ambiguous', 'perf-ambiguous-old', 'free');
   INSERT INTO discussion_channels (id, kind, title, course_id, legacy_course_id) VALUES
    ('perf-conflict-a', 'course', 'Perf Y conflict A', 'perf-conflict', NULL),
    ('perf-conflict-b', 'course', 'Perf Y conflict B', NULL, 'perf-conflict-old'),
    ('perf-ambiguous-channel', 'course', 'Perf Y ambiguous', NULL, 'perf-ambiguous-old');
   INSERT INTO discussion_channels (id, kind, title) VALUES ('perf-global', 'global', 'Umum');
   ANALYZE discussion_channels;
  `);

  const original = client.query;
  const reads = [];
  client.query = function (...args) {
   return original.apply(this, args).then(result => {
    reads.push({ sql: String(args[0]), params: args[1], rows: result.rows.length });
    return result;
   });
  };
  const first = await service.listChannelsPage("perf-viewer", { search: "Perf", kind: "course", limit: 20 });
  assert.equal(first.items.length, 20);
  assert.ok(first.nextCursor);
  assert.deepEqual(first.items.map(row => row.id), Array.from({ length: 20 }, (_, n) => `perf-channel-${n}`));
  const candidateReads = reads.filter(read => /from "discussion_channels"/i.test(read.sql) && /order by/i.test(read.sql) && /limit \$\d+\s*$/i.test(read.sql));
  assert.equal(candidateReads.length, 1);
  assert.equal(candidateReads[0].rows, 21);
  assert.match(candidateReads[0].sql, /jsonb_to_recordset/i);
  assert.match(candidateReads[0].sql, /not exists/i);
  assert.ok(reads.length < 100, `pagination made ${reads.length} queries`);
  const scopeRead = reads.find(read => /select distinct/i.test(read.sql) && /discussion_channels/i.test(read.sql));
  assert.ok(scopeRead.rows >= 1021);
  const firstQueries = reads.length;
  const firstReturnedRows = reads.reduce((total, read) => total + read.rows, 0);
  const candidatePlan = (await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${candidateReads[0].sql}`, candidateReads[0].params)).rows[0]["QUERY PLAN"][0].Plan;
  const candidateWork = nodes(candidatePlan).filter(node => node["Relation Name"] === "discussion_channels")
   .reduce((total, node) => total + (node["Actual Rows"] + (node["Rows Removed by Filter"] ?? 0)) * node["Actual Loops"], 0);
  assert.ok(candidateWork < 5000, `candidate query visited ${candidateWork} channel rows`);
  await client.exec("UPDATE discussion_channels SET legacy_course_id = NULL WHERE id = 'perf-channel-1020'");
  reads.length = 0;
  const second = await service.listChannelsPage("perf-viewer", { search: "Perf", kind: "course", cursor: first.nextCursor, limit: 20 });
  assert.deepEqual(second.items.map(row => row.id), ["perf-channel-1020"]);
  assert.equal(second.nextCursor, null);
  const aliases = await client.query("SELECT id, course_id, legacy_course_id FROM discussion_channels WHERE id IN ('perf-channel-1020', 'perf-conflict-a', 'perf-conflict-b', 'perf-ambiguous-channel') ORDER BY id");
  assert.deepEqual(aliases.rows.find(row => row.id === "perf-channel-1020"), { id: "perf-channel-1020", course_id: "perf-course-1020", legacy_course_id: "perf-old-1020" });
  assert.equal(aliases.rows.find(row => row.id === "perf-conflict-a").legacy_course_id, null);
  assert.equal(aliases.rows.find(row => row.id === "perf-conflict-b").course_id, null);
  assert.equal(aliases.rows.find(row => row.id === "perf-ambiguous-channel").course_id, null);

  await client.exec(`
   INSERT INTO discussion_threads (id, channel_id, author_id, title, status, next_seq, answer_count)
    SELECT 'perf-thread-' || lpad(n::text, 5, '0'),
     CASE WHEN n <= 20 THEN 'perf-channel-0' ELSE 'perf-global' END, 'perf-other', 'Question ' || n,
     CASE WHEN n % 4 = 0 THEN 'resolved' ELSE 'open' END, 11, 9 FROM generate_series(1, 10000) n;
   INSERT INTO discussion_messages (id, thread_id, seq, author_id, kind, message_type, body, request_id)
    SELECT 'perf-message-' || n || '-' || s, 'perf-thread-' || lpad(n::text, 5, '0'), s, 'perf-other', 'human',
     CASE WHEN s = 1 THEN 'question' ELSE 'answer' END, 'Fictional content', 'perf-request-' || n || '-' || s
    FROM generate_series(1, 10000) n CROSS JOIN generate_series(1, 10) s;
   INSERT INTO discussion_thread_reads (user_id, thread_id, through_seq, observed_seq) VALUES ('perf-viewer', 'perf-thread-00001', 10, 10);
   UPDATE discussion_messages SET deleted_at = now(), deleted_by_id = 'perf-other' WHERE thread_id = 'perf-thread-00002';
   UPDATE discussion_messages SET author_id = 'perf-viewer' WHERE thread_id = 'perf-thread-00003';
   ANALYZE discussion_channels;
   ANALYZE discussion_threads;
   ANALYZE discussion_messages;
   ANALYZE discussion_thread_reads;
   ANALYZE mata_kuliah;
   ANALYZE courses;
  `);

  reads.length = 0;
  const scoped = await service.getDiscussionCounts("perf-viewer", { courseId: "perf-old-0" });
  assert.deepEqual(scoped.course, { unreadThreads: 17, activeThreads: 15 });
  assert.deepEqual(scoped.total, scoped.course);
  assert.deepEqual(scoped.scopes.course, scoped.course);
  assert.deepEqual(scoped.scopes.global, { unreadThreads: 0, activeThreads: 0 });
  const scopedReads = [...reads];
  const scopedScopes = scopedReads.find(read => /select distinct/i.test(read.sql) && /discussion_channels/i.test(read.sql));
  assert.equal(scopedScopes.rows, 1);
  assert.ok(scopedScopes.params.includes("perf-old-0"));
  assert.match(scopedScopes.sql, /"kind".*"course_id".*"legacy_course_id"/i);
  for (const read of scopedReads.filter(read => /from "(mata_kuliah|courses|pendaftaran_murid|enrollments)"/i.test(read.sql)))
   assert.ok(read.rows <= 1, `unrelated authorization rows read: ${read.sql}`);
  assert.ok(!scopedReads.some(read => /from "(bab|chapters)"/i.test(read.sql)));
  const scopedQuery = scopedReads.find(read => /filter \(where/i.test(read.sql) && /discussion_threads/i.test(read.sql));
  assert.ok(scopedQuery.params.some(value => Array.isArray(value) && value.includes("perf-channel-0")));
  reads.length = 0;
  const global = await service.getDiscussionCounts("perf-viewer");
  assert.deepEqual(global.scopes.global, { unreadThreads: 9980, activeThreads: 7485 });
  assert.deepEqual(global.total, { unreadThreads: 9997, activeThreads: 7500 });
  const globalQuery = reads.find(read => /filter \(where/i.test(read.sql) && /discussion_threads/i.test(read.sql));
  const metadata = await service.listChannels("perf-viewer", ["perf-global"]);
  assert.equal(metadata[0].activeThreads, global.scopes.global.activeThreads);
  reads.length = 0;
  assert.deepEqual(await service.listChannels("perf-viewer", ["perf-global"]), metadata);
  assert.ok(!reads.some(read => /filter \(where/i.test(read.sql) && /discussion_threads/i.test(read.sql)), "unchanged metadata refresh must reuse count results");
  await client.exec("UPDATE discussion_channels SET count_revision = count_revision + 1 WHERE id = 'perf-global'");
  reads.length = 0;
  assert.deepEqual(await service.listChannels("perf-viewer", ["perf-global"]), metadata);
  assert.ok(reads.some(read => /filter \(where/i.test(read.sql) && /discussion_threads/i.test(read.sql)), "a channel mutation must invalidate metadata counts");
  await service.getDiscussionCounts("perf-viewer");
  const scopedPlan = (await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${scopedQuery.sql}`, scopedQuery.params)).rows[0]["QUERY PLAN"][0].Plan;
  const globalPlan = (await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${globalQuery.sql}`, globalQuery.params)).rows[0]["QUERY PLAN"][0].Plan;
  const threadWork = plan => nodes(plan).filter(node => node["Relation Name"] === "discussion_threads")
   .reduce((total, node) => total + (node["Actual Rows"] + (node["Rows Removed by Filter"] ?? 0)) * node["Actual Loops"], 0);
  const scopedThreadWork = threadWork(scopedPlan), globalThreadWork = threadWork(globalPlan);
  assert.ok(scopedThreadWork <= 20, `scoped aggregate inspected ${scopedThreadWork} thread rows`);
  assert.ok(globalThreadWork >= 10000);
  assert.ok(nodes(scopedPlan).some(node => node["Relation Name"] === "discussion_messages" && /seq >/.test(node["Index Cond"] ?? "")));
  assert.ok(nodes(globalPlan).some(node => node["Relation Name"] === "discussion_messages" && /seq >/.test(node["Index Cond"] ?? "")));

  reads.length = 0;
  assert.deepEqual(await service.getDiscussionCounts("perf-viewer"), global);
  assert.ok(!reads.some(read => /filter \(where/i.test(read.sql) && /discussion_threads/i.test(read.sql)), "unchanged poll reaggregated threads");
  const discoveryReads = reads.filter(read => /^select (?:"discussion_channels"\.)?"id" from "discussion_channels"/i.test(read.sql) && /discussion_threads/i.test(read.sql));
  assert.ok(discoveryReads.length >= 2, "missing authorized thread-bearing channel probes");
  for (const read of discoveryReads) {
   assert.equal(read.rows, 2, "discovery must return distinct channel IDs rather than thread rows");
   const plan = (await original.call(client, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${read.sql}`, read.params)).rows[0]["QUERY PLAN"][0].Plan;
   assert.ok(threadWork(plan) < 100, `unchanged discovery inspected ${threadWork(plan)} thread rows`);
  }

  await client.exec(`INSERT INTO discussion_messages (id, thread_id, seq, author_id, kind, message_type, body, request_id)
   VALUES ('perf-zyra-unread', 'perf-thread-00001', 11, NULL, 'zyra', 'answer', 'Fictional answer', 'perf-zyra-unread');
   UPDATE discussion_channels SET count_revision = count_revision + 1 WHERE id = 'perf-channel-0'`);
  assert.equal((await service.getDiscussionCounts("perf-viewer", { courseId: "perf-old-0" })).course.unreadThreads, 18);
  await client.exec("UPDATE discussion_messages SET deleted_at = now(), deleted_by_id = 'perf-viewer' WHERE id = 'perf-zyra-unread'; UPDATE discussion_channels SET count_revision = count_revision + 1 WHERE id = 'perf-channel-0'");
  assert.equal((await service.getDiscussionCounts("perf-viewer", { courseId: "perf-old-0" })).course.unreadThreads, 17);
  await client.exec("UPDATE mata_kuliah SET pricing_category = 'premium' WHERE id = 'perf-course-0'");
  assert.deepEqual((await service.getDiscussionCounts("perf-viewer", { courseId: "perf-old-0" })).course, { unreadThreads: 0, activeThreads: 0 });
  await client.exec("UPDATE mata_kuliah SET pricing_category = 'free' WHERE id = 'perf-course-0'");
  assert.deepEqual((await service.getDiscussionCounts("perf-viewer", { courseId: "perf-course-0" })).course, scoped.course);
  await client.exec("UPDATE discussion_channels SET count_revision = count_revision + 1 WHERE id = 'perf-channel-0'");
  let revokedDuringAggregate = false;
  client.query = function (...args) {
   return original.apply(this, args).then(async result => {
    if (!revokedDuringAggregate && /filter \(where/i.test(String(args[0])) && /discussion_threads/i.test(String(args[0]))) {
     revokedDuringAggregate = true;
     await client.exec("UPDATE mata_kuliah SET pricing_category = 'premium' WHERE id = 'perf-course-0'");
    }
    return result;
   });
  };
  assert.deepEqual((await service.getDiscussionCounts("perf-viewer", { courseId: "perf-old-0" })).course, { unreadThreads: 0, activeThreads: 0 });
  assert.equal(revokedDuringAggregate, true);
  client.query = original;

  await client.exec(`
   INSERT INTO courses (id, title, category) VALUES ('tutorial-pka', 'PKA', 'PKA');
   INSERT INTO mata_kuliah (id, code, title, legacy_course_id, pricing_category) VALUES ('perf-pka', 'PERF-PKA', 'PKA', 'tutorial-pka', 'free');
   INSERT INTO discussion_channels (id, kind, title, course_id, legacy_course_id) VALUES ('perf-pka-channel', 'course', 'PKA', 'perf-pka', 'tutorial-pka');
   INSERT INTO discussion_threads (id, channel_id, author_id, title) VALUES ('perf-pka-thread', 'perf-pka-channel', 'perf-other', 'PKA question');
   INSERT INTO discussion_messages (id, thread_id, author_id, kind, message_type, body, seq, request_id)
    VALUES ('perf-pka-message', 'perf-pka-thread', 'perf-other', 'human', 'question', 'PKA question', 1, 'perf-pka-message');
   INSERT INTO penugasan_tutor (id, pengguna_id, mata_kuliah_id, status, assignment_scope)
    VALUES ('perf-pka-assignment', 'perf-tutor', 'perf-pka', 'active', 'course');
  `);
  const previousPka = process.env.FEATURE_PKA;
  try {
   process.env.FEATURE_PKA = "1";
   assert.deepEqual((await service.getDiscussionCounts("perf-viewer", { courseId: "tutorial-pka" })).course, { unreadThreads: 0, activeThreads: 0 });
   assert.deepEqual((await service.getDiscussionCounts("perf-tutor", { courseId: "tutorial-pka" })).course, { unreadThreads: 1, activeThreads: 1 });
   await client.exec("INSERT INTO enrollments (id, user_id, course_id, expires_at) VALUES ('perf-pka-enrollment', 'perf-viewer', 'tutorial-pka', '2099-01-01')");
   assert.deepEqual((await service.getDiscussionCounts("perf-viewer", { courseId: "tutorial-pka" })).course, { unreadThreads: 1, activeThreads: 1 });
   await client.exec("UPDATE penugasan_tutor SET status = 'revoked' WHERE id = 'perf-pka-assignment'");
   assert.deepEqual((await service.getDiscussionCounts("perf-tutor", { courseId: "tutorial-pka" })).course, { unreadThreads: 0, activeThreads: 0 });
   process.env.FEATURE_PKA = "0";
   assert.deepEqual((await service.getDiscussionCounts("perf-viewer", { courseId: "tutorial-pka" })).course, { unreadThreads: 0, activeThreads: 0 });
  } finally {
   if (previousPka === undefined) delete process.env.FEATURE_PKA; else process.env.FEATURE_PKA = previousPka;
  }
  await client.exec(`
   UPDATE mata_kuliah SET pricing_category = 'free' WHERE id = 'perf-course-0';
   INSERT INTO mata_kuliah (id, code, title, pricing_category)
    SELECT 'perf-batch-' || n, 'PERF-BATCH-' || n, 'Batch ' || n, 'free' FROM generate_series(1, 501) n;
   INSERT INTO discussion_channels (id, kind, title, course_id)
    SELECT 'perf-batch-channel-' || n, 'course', 'Batch ' || n, 'perf-batch-' || n FROM generate_series(1, 501) n;
   INSERT INTO discussion_threads (id, channel_id, author_id, title)
    SELECT 'perf-batch-thread-' || n, 'perf-batch-channel-' || n, 'perf-other', 'Batch question' FROM generate_series(1, 501) n;
   INSERT INTO discussion_messages (id, thread_id, seq, author_id, kind, message_type, body, request_id)
    SELECT 'perf-batch-message-' || n, 'perf-batch-thread-' || n, 1, 'perf-other', 'human', 'question', 'Batch question', 'perf-batch-message-' || n
    FROM generate_series(1, 501) n;
  `);
  const batchQueries = [];
  client.query = function (...args) {
   return original.apply(this, args).then(result => {
    if (/filter \(where/i.test(String(args[0])) && /discussion_threads/i.test(String(args[0]))) batchQueries.push(String(args[0]));
    return result;
   });
  };
  try {
   process.env.FEATURE_PKA = "0";
   assert.deepEqual((await service.getDiscussionCounts("perf-viewer")).total, { unreadThreads: 10498, activeThreads: 8001 });
   assert.equal(batchQueries.length, 1);
  } finally {
   if (previousPka === undefined) delete process.env.FEATURE_PKA; else process.env.FEATURE_PKA = previousPka;
   client.query = original;
  }
  const beforePrivate = await service.getDiscussionCounts("perf-viewer");
  const beforePrivateCourse = await service.getDiscussionCounts("perf-viewer", { courseId: "perf-old-0" });
  await client.exec(`
   INSERT INTO "user" (id, name, email)
    SELECT 'perf-private-owner-' || n, 'Fictional member', 'perf-private-' || n || '@example.test' FROM generate_series(1, 10000) n;
   INSERT INTO discussion_channels (id, kind, title, requester_id)
    SELECT 'perf-private-' || n || '-' || kind, kind, 'Private help', 'perf-private-owner-' || n
     FROM generate_series(1, 10000) n CROSS JOIN (VALUES ('academic'), ('technical')) kinds(kind);
   INSERT INTO discussion_threads (id, channel_id, author_id, title, next_seq)
    SELECT 'perf-private-thread-' || n, 'perf-private-' || n || '-technical', 'perf-private-owner-' || n, 'Private question', 2
     FROM generate_series(1, 10000) n;
   INSERT INTO discussion_messages (id, thread_id, author_id, kind, message_type, body, seq, request_id)
    SELECT 'perf-private-message-' || n, 'perf-private-thread-' || n, 'perf-private-owner-' || n, 'human', 'question', 'Private', 1, 'perf-private-request-' || n
     FROM generate_series(1, 10000) n;
   INSERT INTO discussion_thread_reads (user_id, thread_id, through_seq, observed_seq)
    SELECT 'perf-viewer', 'perf-private-thread-' || n, 1, 1 FROM generate_series(1, 10000) n;
   INSERT INTO discussion_channel_preferences (user_id, channel_id, read_revision)
    SELECT 'perf-viewer', 'perf-private-' || n || '-technical', 1 FROM generate_series(1, 10000) n;
   ANALYZE discussion_channels; ANALYZE discussion_threads; ANALYZE discussion_thread_reads; ANALYZE discussion_channel_preferences;
  `);
  const privateReads = [];
  client.query = function (...args) {
   return original.apply(this, args).then(result => {
    privateReads.push({ sql: String(args[0]), params: args[1], rows: result.rows });
    return result;
   });
  };
  try {
   assert.deepEqual(await service.getDiscussionCounts("perf-viewer"), beforePrivate);
   assert.deepEqual(await service.getDiscussionCounts("perf-viewer", { courseId: "perf-old-0" }), beforePrivateCourse);
  } finally { client.query = original; }
  assert.ok(!privateReads.some(read => /filter \(where/i.test(read.sql) && /discussion_threads/i.test(read.sql)), "unrelated channels or reads invalidated the cache");
  assert.ok(!privateReads.some(read => /from "discussion_thread_reads"/i.test(read.sql)), "version lookup scanned thread reads");
  const privateDiscovery = privateReads.filter(read => /^select (?:"discussion_channels"\.)?"id" from "discussion_channels"/i.test(read.sql) && /discussion_threads/i.test(read.sql));
  assert.equal(privateDiscovery.length, 4);
  assert.ok(privateDiscovery.every(read => read.rows.every(row => !String(Array.isArray(row) ? row[0] : row.id).startsWith("perf-private-"))), "discovery returned unrelated private IDs");
  assert.ok(privateDiscovery.some(read => read.params.includes("perf-old-0") && read.rows.length === 1));
  const scopedDiscovery = privateReads.filter(read => /from "discussion_channels"/i.test(read.sql) && /discussion_threads/i.test(read.sql)
   && read.params.includes("perf-old-0"));
  assert.equal(scopedDiscovery.length, 4);
  for (const read of scopedDiscovery) {
   const plan = (await original.call(client, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${read.sql}`, read.params)).rows[0]["QUERY PLAN"][0].Plan;
   assert.ok(threadWork(plan) < 100, `scoped discovery inspected ${threadWork(plan)} thread rows with unrelated private threads`);
  }
  const versionReads = privateReads.filter(read => /from "discussion_channel_preferences"/i.test(read.sql));
  assert.equal(versionReads.length, 4);
  const courseVersionReads = versionReads.filter(read => read.params.some(value => Array.isArray(value) && value.length === 1 && value[0] === "perf-channel-0"));
  assert.equal(courseVersionReads.length, 2);
  for (const read of courseVersionReads) {
   assert.ok(read.rows.length <= 1);
   const plan = (await original.call(client, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${read.sql}`, read.params)).rows[0]["QUERY PLAN"][0].Plan;
   const visits = nodes(plan).filter(node => node["Relation Name"] === "discussion_channel_preferences")
    .reduce((total, node) => total + (node["Actual Rows"] + (node["Rows Removed by Filter"] ?? 0)) * node["Actual Loops"], 0);
   assert.ok(visits <= 2, `scoped read version inspected ${visits} preference rows`);
  }
  await client.exec("UPDATE discussion_channels SET count_revision = count_revision + 1 WHERE id = 'perf-channel-0'");
  privateReads.length = 0;
  client.query = function (...args) {
   return original.apply(this, args).then(result => {
    privateReads.push({ sql: String(args[0]), params: args[1], rows: result.rows });
    return result;
   });
  };
  try {
   assert.deepEqual(await service.getDiscussionCounts("perf-viewer"), beforePrivate);
   assert.deepEqual(await service.getDiscussionCounts("perf-viewer", { courseId: "perf-old-0" }), beforePrivateCourse);
  } finally { client.query = original; }
  assert.equal(privateReads.filter(read => /filter \(where/i.test(read.sql) && /discussion_threads/i.test(read.sql)).length, 2);
  const coldDiscovery = privateReads.filter(read => /^select (?:"discussion_channels"\.)?"id" from "discussion_channels"/i.test(read.sql) && /discussion_threads/i.test(read.sql));
  assert.equal(coldDiscovery.length, 4);
  assert.ok(coldDiscovery.every(read => read.rows.every(row => !String(Array.isArray(row) ? row[0] : row.id).startsWith("perf-private-"))));
  const defaultReads = [];
  client.query = function (...args) {
   return original.apply(this, args).then(result => {
    defaultReads.push({ sql: String(args[0]), rows: result.rows.length });
    return result;
   });
  };
  const ordinary = await service.listChannelsPage("perf-viewer", { limit: 20 });
  client.query = original;
  assert.ok(ordinary.items.length > 0 && ordinary.items.length <= 20);
  assert.ok(!ordinary.items.some(channel => channel.id.startsWith("perf-private-")));
  const channelReads = defaultReads.filter(read => /from "discussion_channels"/i.test(read.sql));
  const largestChannelRead = Math.max(...channelReads.map(read => read.rows));
  assert.ok(largestChannelRead < 2000, `ordinary load returned ${largestChannelRead} channel rows in one query`);
  assert.ok(channelReads.some(read => /where/i.test(read.sql) && /requester_id/i.test(read.sql) && /kind/i.test(read.sql)));

  await client.exec(`
   INSERT INTO "user" (id, name, email) VALUES ('perf-admin', 'Fictional admin', 'perf-admin@example.test');
   INSERT INTO pengguna (id) VALUES ('perf-admin');
   INSERT INTO peran (id, code) VALUES ('perf-admin-role', 'admin');
   INSERT INTO pengguna_peran (id, pengguna_id, peran_id, source) VALUES ('perf-admin-membership', 'perf-admin', 'perf-admin-role', 'test');
   INSERT INTO discussion_threads (id, channel_id, author_id, title, next_seq)
    VALUES ('perf-report-thread', 'perf-global', 'perf-other', 'Reported discussion', 34);
   INSERT INTO discussion_messages (id, thread_id, seq, author_id, kind, message_type, body, request_id)
    SELECT 'perf-report-message-' || n, 'perf-report-thread', n, 'perf-other', 'human',
     CASE WHEN n = 1 THEN 'question' ELSE 'answer' END, 'Fictional reported content', 'perf-report-message-' || n
     FROM generate_series(1, 33) n;
   INSERT INTO discussion_reports (id, message_id, reporter_id, reason, created_at)
    SELECT 'perf-report-' || n, 'perf-report-message-' || n, 'perf-viewer', 'Review',
     CASE WHEN n < 30 THEN '2026-01-01T00:00:00.124000Z'::timestamptz
      WHEN n = 30 THEN '2026-01-01T00:00:00.123456Z'::timestamptz
      WHEN n < 33 THEN '2026-01-01T00:00:00.123200Z'::timestamptz
      ELSE '2026-01-01T00:00:00.123000Z'::timestamptz END FROM generate_series(1, 33) n;
  `);
  let reportQueries = 0;
  client.query = function (...args) { reportQueries++; return original.apply(this, args); };
  const reports = await service.listReports("perf-admin");
  client.query = original;
  assert.equal(reports.items.length, 30);
  assert.ok(reportQueries < 50, `moderation page made ${reportQueries} queries for 30 reports`);
  assert.equal(JSON.parse(Buffer.from(reports.nextCursor, 'base64url').toString()).at, '2026-01-01T00:00:00.123456Z');
  const reportNextPage = await service.listReports('perf-admin', reports.nextCursor);
  assert.deepEqual(reportNextPage.items.map(item => item.id), ['perf-report-32', 'perf-report-31', 'perf-report-33']);
  assert.equal(new Set([...reports.items, ...reportNextPage.items].map(item => item.id)).size, 33);
  assert.equal(reportNextPage.nextCursor, null);
  for (const revocation of ["role", "course"]) {
   if (revocation === "course") await client.exec("UPDATE discussion_threads SET channel_id = 'perf-channel-0' WHERE id = 'perf-report-thread'");
   let revoked = false;
   client.query = function (...args) {
    return original.apply(this, args).then(async result => {
     if (!revoked && /from "discussion_reports"/i.test(String(args[0])) && /order by/i.test(String(args[0]))) {
      revoked = true;
      await client.exec(revocation === "role"
       ? "DELETE FROM pengguna_peran WHERE id = 'perf-admin-membership'"
       : "UPDATE mata_kuliah SET status = 'archived' WHERE id = 'perf-course-0'");
     }
     return result;
    });
   };
   if (revocation === "role") await assert.rejects(service.listReports("perf-admin"), /DISCUSSION_UNAVAILABLE/);
   else assert.deepEqual((await service.listReports("perf-admin")).items, []);
   assert.ok(revoked);
   client.query = original;
   if (revocation === "role") await client.exec("INSERT INTO pengguna_peran (id, pengguna_id, peran_id, source) VALUES ('perf-admin-membership', 'perf-admin', 'perf-admin-role', 'test')");
   else await client.exec("UPDATE mata_kuliah SET status = 'active' WHERE id = 'perf-course-0'");
  }
  console.log(JSON.stringify({
   ordinary: { unrelatedPrivateChannels: 20000, largestChannelRead, totalQueries: defaultReads.length },
   moderation: { reportCount: reports.items.length, queries: reportQueries, roleAndCourseRevocation: true },
   pagination: { firstQueries, firstReturnedRows, distinctScopeRows: scopeRead.rows, candidateRows: candidateReads[0].rows, candidateWork },
   fixture: { channels: 1025, inaccessibleCourses: 1000, threads: 10000, messages: 100000 },
   scoped: { result: scoped.course, authorizationScopeRows: scopedScopes.rows, threadWork: scopedThreadWork, plan: scopedPlan },
   global: { result: global.total, threadWork: globalThreadWork, plan: globalPlan },
  }));
 } finally { await client.close(); }
});
