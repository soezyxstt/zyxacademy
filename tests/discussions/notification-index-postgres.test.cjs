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
 require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
 }).outputText, filename);
 Module._load = function (request, parent, isMain) {
  if (request === "@/db" || request === "@/lib/db") return { db };
  if (request === "server-only") return {};
  return load.call(this, request.startsWith("@/") ? path.join(root, request.slice(2)) : request, parent, isMain);
 };
}
const schema = require("../../db/schema.ts");
const nodes = plan => [plan, ...(plan.Plans ?? []).flatMap(nodes)];

test("thread notification clearing uses the partial expression index with a skewed unread backlog", { timeout: 300000 }, async () => {
 const client = await PGlite.create();
 const queries = [];
 db = drizzle(client, { schema, logger: { logQuery: (sql, params) => queries.push({ sql, params }) } });
 if (isBun) {
  bunTest.mock.module("server-only", () => ({}));
  bunTest.mock.module("@/db", () => ({ db }));
  bunTest.mock.module("@/lib/db", () => ({ db }));
 }
 try {
  for (const file of fs.readdirSync(path.join(root, "drizzle-postgres")).filter(file => file.endsWith(".sql")).sort())
   await client.exec(fs.readFileSync(path.join(root, "drizzle-postgres", file), "utf8"));
  await client.exec(`
   INSERT INTO "user" (id, name, email) VALUES ('index-viewer', 'Viewer', 'index-viewer@example.test'), ('index-author', 'Author', 'index-author@example.test');
   INSERT INTO discussion_channels (id, kind, title) VALUES ('index-global', 'global', 'Global');
   INSERT INTO discussion_threads (id, channel_id, author_id, title, next_seq, status_revision) VALUES ('index-thread', 'index-global', 'index-author', 'Question', 2, 1);
   INSERT INTO discussion_messages (id, thread_id, author_id, kind, message_type, body, seq, request_id)
    VALUES ('index-message', 'index-thread', 'index-author', 'human', 'question', 'Question', 1, 'index-message');
   INSERT INTO discussion_events (id, channel_id, thread_id, message_id, actor_id, kind, message_revision, participant_through_seq)
    VALUES ('index-event', 'index-global', 'index-thread', 'index-message', 'index-author', 'question', 1, 1);
   INSERT INTO discussion_events (id, channel_id, thread_id, message_id, actor_id, kind, status_revision, participant_through_seq)
    VALUES ('index-resolved', 'index-global', 'index-thread', NULL, 'index-author', 'resolved', 1, 1);
   INSERT INTO discussion_message_observations (message_id, user_id, revision) VALUES ('index-message', 'index-viewer', 1);
   INSERT INTO discussion_thread_reads (user_id, thread_id, through_seq, observed_seq, seen_status_revision)
    VALUES ('index-viewer', 'index-thread', 1, 1, 1);
   INSERT INTO notifications (id, user_id, title, body, type, metadata)
    SELECT 'index-backlog-' || n, 'index-viewer', 'Update', 'Update', 'discussion',
     jsonb_build_object('threadId', 'other-thread-' || n, 'eventId', 'other-event-' || n, 'eventKind', 'message', 'seq', '1')
    FROM generate_series(1, 20000) n;
   INSERT INTO notifications (id, user_id, title, body, type, metadata) VALUES
    ('index-target', 'index-viewer', 'Update', 'Update', 'discussion', '{"threadId":"index-thread","eventId":"index-resolved","eventKind":"resolved","seq":"1"}'),
    ('index-report', 'index-viewer', 'Report', 'Report', 'discussion', '{"threadId":"index-thread","eventId":"index-event","eventKind":"report","seq":"1"}'),
    ('index-malformed', 'index-viewer', 'Update', 'Update', 'discussion', '{"threadId":"index-thread","eventId":"index-resolved","eventKind":"resolved","seq":"invalid"}'),
    ('index-future', 'index-viewer', 'Update', 'Update', 'discussion', '{"threadId":"index-thread","eventId":"index-resolved","eventKind":"resolved","seq":"2"}');
   ANALYZE notifications;
  `);
  const { clearDiscussionNotificationsThroughSeq } = require("../../lib/discussions/notifications.ts");
  await db.transaction(tx => clearDiscussionNotificationsThroughSeq(tx, { userId: "index-viewer", threadId: "index-thread", throughSeq: 1 }));
  const changed = await client.query("SELECT id FROM notifications WHERE read ORDER BY id");
  assert.deepEqual(changed.rows.map(row => row.id), ["index-target"]);
  const update = queries.find(query => /^update "notifications"/i.test(query.sql));
  assert.ok(update, "missing notification update");
  await client.exec("UPDATE notifications SET read = false WHERE id = 'index-target'; SET plan_cache_mode = force_generic_plan");
  await client.exec(`PREPARE discussion_clear_plan AS ${update.sql}`);
  const literal = value => value === null ? "NULL" : typeof value === "boolean" || typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`;
  const plan = (await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) EXECUTE discussion_clear_plan(${update.params.map(literal).join(", ")})`)).rows[0]["QUERY PLAN"][0].Plan;
  const notificationNodes = nodes(plan).filter(node => node["Relation Name"] === "notifications");
  assert.ok(nodes(plan).some(node => node["Index Name"] === "idx_notifications_user_type_read_thread"), "thread index not used for generic parameters");
  const visits = notificationNodes.reduce((sum, node) => sum + (node["Actual Rows"] + (node["Rows Removed by Filter"] ?? 0)) * node["Actual Loops"], 0);
  assert.ok(visits <= 10, `clear inspected ${visits} notification rows`);
 } finally { await client.close(); if (!isBun) Module._load = load; }
});
