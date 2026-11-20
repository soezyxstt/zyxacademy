const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");
const { drizzle } = require("drizzle-orm/pglite");
const { and, eq } = require("drizzle-orm");

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
 require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
 }).outputText, filename);
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
const nodes = plan => [plan, ...(plan.Plans ?? []).flatMap(nodes)];
const visits = (plan, relation) => nodes(plan).filter(node => node["Relation Name"] === relation)
 .reduce((total, node) => total + (node["Actual Rows"] + (node["Rows Removed by Filter"] ?? 0)) * node["Actual Loops"], 0);

test("bounded mention writes and visibility with 10,000 empty private channels", { timeout: 300000 }, async () => {
 const client = await PGlite.create();
 const executed = [];
 db = drizzle(client, { schema, logger: { logQuery: (sql, params) => executed.push({ sql, params }) } });
 if (isBun) {
  bunTest.mock.module("server-only", () => ({}));
  bunTest.mock.module("@/db", () => ({ db }));
  bunTest.mock.module("@/lib/db", () => ({ db }));
  bunTest.mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() }));
  bunTest.mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
  bunTest.mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
 }
 const service = require("../../lib/discussions/service.ts");
 const access = require("../../lib/discussions/access.ts");
 const { notificationVisibility } = require("../../lib/notifications/discussion-history.ts");
 try {
  for (const file of fs.readdirSync(path.join(root, "drizzle-postgres")).filter(file => file.endsWith(".sql")).sort())
   await client.exec(fs.readFileSync(path.join(root, "drizzle-postgres", file), "utf8"));
  await client.exec(`
   INSERT INTO "user" (id, name, email) VALUES
    ('core-owner', 'Owner', 'core-owner@example.test'), ('core-tutor', 'Tutor', 'core-tutor@example.test'),
    ('core-admin', 'Admin', 'core-admin@example.test');
   INSERT INTO pengguna (id) VALUES ('core-owner'), ('core-tutor'), ('core-admin');
   INSERT INTO peran (id, code) VALUES ('core-student-role', 'murid'), ('core-tutor-role', 'tutor'), ('core-admin-role', 'admin');
   INSERT INTO pengguna_peran (id, pengguna_id, peran_id, source) VALUES
    ('core-owner-role', 'core-owner', 'core-student-role', 'test'),
    ('core-tutor-link', 'core-tutor', 'core-tutor-role', 'test'),
    ('core-admin-link', 'core-admin', 'core-admin-role', 'test');
   INSERT INTO courses (id, title, category)
    VALUES ('core-legacy', 'Core legacy', 'Matematika'), ('core-other-legacy', 'Other legacy', 'Fisika');
   INSERT INTO mata_kuliah (id, code, title, legacy_course_id, pricing_category)
    VALUES ('core-course', 'CORE', 'Core course', 'core-legacy', 'free'), ('core-other-course', 'OTHER', 'Other course', 'core-other-legacy', 'free');
   INSERT INTO enrollments (id, user_id, course_id, expires_at)
    VALUES ('core-enroll', 'core-owner', 'core-legacy', '2099-01-01'), ('core-other-enroll', 'core-owner', 'core-other-legacy', '2099-01-01');
   INSERT INTO penugasan_tutor (id, pengguna_id, mata_kuliah_id, status, assignment_scope)
    VALUES ('core-tutor-assign', 'core-tutor', 'core-course', 'active', 'course');
   INSERT INTO discussion_channels (id, kind, title, course_id, legacy_course_id) VALUES
    ('core-private', 'course', 'Course', 'core-course', 'core-legacy'),
    ('core-empty', 'course', 'Empty', 'core-other-course', 'core-other-legacy');
   INSERT INTO discussion_threads (id, channel_id, author_id, title, next_seq, answer_count)
    VALUES ('core-thread', 'core-private', 'core-owner', 'Question', 3, 1);
   INSERT INTO discussion_messages (id, thread_id, author_id, kind, message_type, body, seq, request_id) VALUES
    ('core-question', 'core-thread', 'core-owner', 'human', 'question', 'Question', 1, 'core-question'),
    ('core-answer', 'core-thread', 'core-admin', 'human', 'answer', 'Answer', 2, 'core-answer');
   INSERT INTO discussion_reports (id, message_id, reporter_id, reason)
    VALUES ('core-report', 'core-answer', 'core-owner', 'Review');
   INSERT INTO notifications (id, user_id, type, title, body, metadata) VALUES
    ('core-history-thread', 'core-owner', 'discussion', 'Update', 'Update', '{"channelId":"core-private"}'),
    ('core-history-empty', 'core-owner', 'discussion', 'Update', 'Update', '{"channelId":"core-empty"}');
   UPDATE discussion_channels SET count_revision = 1 WHERE EXISTS (SELECT 1 FROM discussion_threads t WHERE t.channel_id = discussion_channels.id);
   ANALYZE discussion_channels; ANALYZE discussion_threads; ANALYZE discussion_reports; ANALYZE notifications;
  `);
  const original = client.query;
  let reads = [];
  client.query = function (...args) {
   return original.apply(this, args).then(result => {
    reads.push({ sql: String(args[0]), params: args[1], rows: result.rows.length });
    return result;
   });
  };
  async function measure(action) {
   reads = [];
   const result = await action();
   const captured = [...reads];
   const scope = captured.find(read => /select distinct/i.test(read.sql) && /from "discussion_channels"/i.test(read.sql));
   assert.ok(scope, "missing channel-scope query");
   const plan = (await original.call(client, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${scope.sql}`, scope.params)).rows[0]["QUERY PLAN"][0].Plan;
   const lookups = captured.filter(read => /^select\s+(?:"discussion_channels"\.)?"id"\s+from\s+(?:"discussion_channels"|\(with recursive channel_ids)/i.test(read.sql));
   const lookupVisits = [];
   for (const lookup of lookups) {
    const lookupPlan = (await original.call(client, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${lookup.sql}`, lookup.params)).rows[0]["QUERY PLAN"][0].Plan;
    lookupVisits.push(visits(lookupPlan, "discussion_channels"));
   }
   return { result, queries: captured.length, scopeRows: scope.rows, channelVisits: visits(plan, "discussion_channels"), lookupVisits, captured };
  }
  const history = async viewer => (await db.select({ id: schema.notifications.id }).from(schema.notifications)
   .where(and(eq(schema.notifications.userId, "core-owner"), await notificationVisibility("core-owner", viewer)))
   .orderBy(schema.notifications.id)).map(row => row.id);
  async function scenarios() {
   const counts = {};
   for (const actor of ["core-owner", "core-tutor", "core-admin"]) counts[actor] = await measure(() => service.getDiscussionCounts(actor));
   return { counts, history: await measure(() => history("core-admin")), reports: await measure(() => service.listReports("core-admin")) };
  }
  const before = await scenarios();
  await client.exec(`
   INSERT INTO "user" (id, name, email)
    SELECT 'core-empty-owner-' || n, 'Owner', 'core-empty-' || n || '@example.test' FROM generate_series(1, 10000) n;
   INSERT INTO discussion_channels (id, kind, title, requester_id)
    SELECT 'core-empty-academic-' || n, 'academic', 'Empty academic', 'core-empty-owner-' || n FROM generate_series(1, 10000) n;
   ANALYZE discussion_channels; ANALYZE discussion_threads; ANALYZE discussion_reports; ANALYZE notifications;
  `);
  const after = await scenarios();
  for (const actor of ["core-owner", "core-tutor", "core-admin"]) {
   const first = before.counts[actor], second = after.counts[actor];
   assert.deepEqual(second.result, first.result);
   assert.deepEqual(second.result.total, { unreadThreads: 1, activeThreads: 1 });
   assert.equal(second.queries, first.queries - 1);
   assert.equal(second.scopeRows, 1);
   assert.equal(first.captured.filter(read => /filter \(where/i.test(read.sql) && /discussion_threads/i.test(read.sql)).length, 1);
   assert.equal(second.captured.filter(read => /filter \(where/i.test(read.sql) && /discussion_threads/i.test(read.sql)).length, 0);
   assert.ok(second.channelVisits <= first.channelVisits + 20, `${actor} scope visited ${second.channelVisits} channels after ${first.channelVisits}`);
   assert.ok(first.lookupVisits.length > 0 && second.lookupVisits.length === first.lookupVisits.length, `${actor} missing candidate channel lookups`);
   for (let index = 0; index < second.lookupVisits.length; index++)
    assert.ok(second.lookupVisits[index] <= first.lookupVisits[index] + 20, `${actor} candidate lookup visited ${second.lookupVisits[index]} channels after ${first.lookupVisits[index]}`);
  }
  await client.exec(`
   INSERT INTO discussion_channels (id, kind, title, requester_id, count_revision)
    SELECT 'core-populated-tech-' || n, 'technical', 'Other technical', 'core-empty-owner-' || n, 1 FROM generate_series(1,10000) n;
   INSERT INTO discussion_threads (id, channel_id, author_id, title)
    SELECT 'core-populated-thread-' || n, 'core-populated-tech-' || n, 'core-owner', 'Other question' FROM generate_series(1,10000) n;
   ANALYZE discussion_channels; ANALYZE discussion_threads;
  `);
  const populatedTutor = await measure(() => service.getDiscussionCounts("core-tutor"));
  assert.deepEqual(populatedTutor.result, after.counts["core-tutor"].result);
  assert.ok(populatedTutor.channelVisits <= after.counts["core-tutor"].channelVisits + 20, "inaccessible populated technical channels must not expand tutor discovery");
  for (const visits of populatedTutor.lookupVisits) assert.ok(visits <= 20, `tutor candidate lookup visited ${visits} channels`);
  assert.deepEqual(after.history.result, ["core-history-empty", "core-history-thread"]);
  assert.deepEqual(await history("core-tutor"), ["core-history-thread"]);
  assert.equal(after.history.queries, before.history.queries);
  assert.ok(after.history.channelVisits <= before.history.channelVisits + 20);
  assert.equal(after.reports.result.items.length, 1);
  assert.equal(after.reports.queries, before.reports.queries);
  assert.ok(after.reports.channelVisits <= before.reports.channelVisits + 20);
  const picker = await access.getDiscussionChannelVisibility("core-admin", { scope: eq(schema.discussionChannels.id, "core-empty-academic-1"), includeRepairable: true });
  assert.deepEqual(await db.select({ id: schema.discussionChannels.id }).from(schema.discussionChannels).where(picker.predicate), []);
  const coursePicker = await access.getDiscussionChannelVisibility("core-admin", { scope: eq(schema.discussionChannels.id, "core-private"), includeRepairable: true });
  assert.deepEqual(await db.select({ id: schema.discussionChannels.id }).from(schema.discussionChannels).where(coursePicker.predicate), [{ id: "core-private" }]);

  await client.exec(`
   INSERT INTO mata_kuliah (id, code, title, pricing_category)
    SELECT 'read-course-' || n, 'READ-' || n, 'Read course ' || n, 'free' FROM generate_series(1,1000) n;
   INSERT INTO discussion_channels (id, kind, title, course_id)
    SELECT 'read-channel-' || n, 'course', 'Read channel ' || n, 'read-course-' || n FROM generate_series(1,1000) n;
   INSERT INTO notifications (id, user_id, type, title, body, read, metadata)
    SELECT 'read-history-' || n, 'core-owner', 'discussion', 'Read', 'Read', true,
     jsonb_build_object('channelId', 'read-channel-' || n) FROM generate_series(1,1000) n;
   ANALYZE discussion_channels; ANALYZE notifications;
  `);
  const notificationScopes = [];
  for (const options of [{ unreadOnly: true }, { ids: ['read-history-1000'] }]) {
   const scopedHistory = await measure(async () => db.select({ id: schema.notifications.id }).from(schema.notifications)
    .where(and(eq(schema.notifications.userId, "core-owner"), await notificationVisibility("core-owner", "core-owner", options))));
   notificationScopes.push({ options, queries: scopedHistory.queries, scopeRows: scopedHistory.scopeRows, channelVisits: scopedHistory.channelVisits });
   assert.equal(scopedHistory.scopeRows, "unreadOnly" in options ? 2 : 1);
   assert.ok(scopedHistory.channelVisits <= 10, `scoped history visited ${scopedHistory.channelVisits} channels`);
  }

  await client.exec(`
   INSERT INTO "user" (id, name, email) SELECT 'core-mention-' || n, 'Member', 'core-mention-' || n || '@example.test' FROM generate_series(1, 10) n;
   INSERT INTO pengguna (id) SELECT 'core-mention-' || n FROM generate_series(1, 10) n;
   INSERT INTO pengguna_peran (id, pengguna_id, peran_id, source)
    SELECT 'core-mention-link-' || n, 'core-mention-' || n, 'core-admin-role', 'test' FROM generate_series(1, 10) n;
  `);
  async function send(mentions, requestId) {
   executed.length = 0;
   const result = await service.reply("core-admin", { threadId: "core-thread", messageType: "answer", body: "Reply",
    requestId, mentionIds: mentions, attachmentIds: [], askZyra: false });
   return { result, queries: [...executed] };
  }
  const mentions = Array.from({ length: 10 }, (_, i) => `core-mention-${i + 1}`);
  const one = await send(mentions.slice(0, 1), "core-one"), ten = await send(mentions, "core-ten");
  assert.equal(ten.queries.length, one.queries.length);
  assert.equal(ten.queries.filter(query => /for share/i.test(query.sql) && / in \(/i.test(query.sql)).length, 3);
  const snapshots = await client.query("SELECT message_id, recipient_cursor FROM discussion_events WHERE message_id IN ($1, $2) ORDER BY message_id", [one.result.messageId, ten.result.messageId]);
  assert.deepEqual(JSON.parse(snapshots.rows.find(row => row.message_id === one.result.messageId).recipient_cursor).mentions, mentions.slice(0, 1));
  assert.deepEqual(JSON.parse(snapshots.rows.find(row => row.message_id === ten.result.messageId).recipient_cursor).mentions, mentions);
  await client.exec("UPDATE pengguna SET status = 'suspended' WHERE id = 'core-mention-10'");
  const previous = (await client.query("SELECT next_seq FROM discussion_threads WHERE id = 'core-thread'")).rows;
  await assert.rejects(send(mentions, "core-revoked"), /DISCUSSION_UNAVAILABLE/);
  assert.deepEqual((await client.query("SELECT next_seq FROM discussion_threads WHERE id = 'core-thread'")).rows, previous);
  await client.exec(`
   INSERT INTO courses (id,title,category) SELECT 'read-legacy-' || n, 'Legacy ' || n, 'TPB' FROM generate_series(1,1000) n;
   UPDATE mata_kuliah SET legacy_course_id = replace(id, 'read-course-', 'read-legacy-') WHERE id LIKE 'read-course-%';
   UPDATE discussion_channels SET legacy_course_id = replace(course_id, 'read-course-', 'read-legacy-'), count_revision = 1 WHERE id LIKE 'read-channel-%';
   INSERT INTO discussion_threads (id,channel_id,author_id,title) SELECT 'read-thread-' || n, 'read-channel-' || n, 'core-owner', 'Unassigned course' FROM generate_series(1,1000) n;
   ANALYZE courses; ANALYZE mata_kuliah; ANALYZE discussion_channels; ANALYZE discussion_threads;
  `);
  const courseCold = await measure(() => service.getDiscussionCounts('core-tutor'));
  const courseWarm = await measure(() => service.getDiscussionCounts('core-tutor'));
  assert.deepEqual(courseWarm.result, courseCold.result);
  assert.equal(courseWarm.scopeRows, 1);
  assert.ok(!courseWarm.captured.some(row => /count\(\*\) filter.*group by/is.test(row.sql)), 'warm count unexpectedly recomputed its aggregate');
  const maxBindings = Math.max(...courseWarm.captured.map(row => row.params?.length ?? 0));
  assert.ok(maxBindings <= 2000, `unbounded course bindings: ${maxBindings}`);
  console.log(JSON.stringify({ kind: 'warm-1000-inaccessible-course-pairs', queries: courseWarm.queries, maxBindings, scopeRows: courseWarm.scopeRows }));
  await client.exec("DELETE FROM pengguna_peran WHERE id = 'core-tutor-link'");
  await assert.rejects(service.getDiscussionCounts("core-tutor"), /DISCUSSION_UNAVAILABLE/);
  assert.deepEqual(await history("core-tutor"), []);
  console.log(JSON.stringify({ counts: Object.fromEntries(Object.entries(after.counts).map(([actor, entry]) => [actor,
   { queries: entry.queries, scopeRows: entry.scopeRows, channelVisits: entry.channelVisits, candidateVisits: entry.lookupVisits }])),
   populatedTutor: { queries: populatedTutor.queries, channelVisits: populatedTutor.channelVisits, candidateVisits: populatedTutor.lookupVisits }, notificationScopes,
   history: { queries: after.history.queries, channelVisits: after.history.channelVisits },
   reports: { queries: after.reports.queries, channelVisits: after.reports.channelVisits },
   mentions: { one: one.queries.length, ten: ten.queries.length } }));
 } finally { await client.close(); }
});
