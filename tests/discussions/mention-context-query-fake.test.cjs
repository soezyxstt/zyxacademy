const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { test } = require("node:test");
const ts = require("typescript");
const { PgDialect } = require("drizzle-orm/pg-core");

const root = path.resolve(__dirname, "../..");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
 compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const dialect = new PgDialect();
const channel = { id: "channel", kind: "global", requesterId: null, courseId: null, legacyCourseId: null };
let context = [{ id: "alice", body: "One" }, { id: "bob", body: "Two" }], statement, checks = 0, revoked = false;
const db = {
 select: () => {
  const query = { from: () => query, innerJoin: () => query, where: () => query, orderBy: () => query,
   limit: async () => [{ id: "alice", name: "Same Name" }, { id: "bob", name: "Same Name" }] };
  return query;
 },
 execute: async query => { statement = dialect.sqlToQuery(query); return { rows: context }; },
};
const access = {
 getDiscussionActor: async id => ({ id, role: "student" }),
 requireDiscussionChannelAccess: async () => {
  checks++;
  if (revoked && checks === 2) throw new Error("DISCUSSION_UNAVAILABLE");
  return channel;
 },
};
const load = Module._load;
Module._load = function (request, parent, isMain) {
 if (request === "server-only") return {};
 if (request === "@/db") return { db };
 if (parent?.filename.endsWith(path.join("lib", "discussions", "service.ts"))) {
  if (request === "./access") return access;
  if (request === "./recipient-access") return { getDiscussionRecipientAccess: async (_id, ids) => new Map(ids.map(id => [id, { role: "student" }])) };
  if (request === "./policy") return { validDiscussionId: id => typeof id === "string" && id.length > 0 };
  if (request.startsWith("./") && request !== "./count-cache") return {};
  if (request === "@/lib/auth-secret" || request === "@/lib/pka-config") return {};
 }
 return load.call(this, request.startsWith("@/") ? path.join(root, request.slice(2)) : request, parent, isMain);
};
const { searchChannelMentions } = require("../../lib/discussions/service.ts");

test("namesake context uses one same-channel participant pointer and rechecks access", async () => {
 const search = () => { checks = 0; return searchChannelMentions("viewer", "channel", "Same"); };
 const people = await search();
 assert.deepEqual(people.map(person => person.context), ["One", "Two"]);
 assert.match(statement.sql, /cross join lateral/i);
 assert.match(statement.sql, /p\.channel_id\s*=.*p\.user_id\s*=.*order by p\.thread_id limit 1/is);
 assert.match(statement.sql, /t\.channel_id\s*=/i);
 assert.match(statement.sql, /cross join lateral\s*\(\s*select left\(message\.body, 100\).*message\.thread_id\s*=\s*participant\.thread_id.*message\.seq\s*=\s*participant\.first_seq.*limit 1\s*\) m/is);
 assert.match(statement.sql, /\) m\s*where m\.author_id\s*=\s*candidate\.id/i);
 assert.match(statement.sql, /m\.deleted_at is null/i);
 assert.match(statement.sql, /m\.message_type\s*<>\s*'forward'/i);
 assert.deepEqual(JSON.parse(statement.params[0]), ["alice", "bob"]);
 context = [{ id: "alice", body: "One" }];
 const withoutContext = await search();
 assert.equal("context" in withoutContext[1], false);
 revoked = true;
 await assert.rejects(search(), /DISCUSSION_UNAVAILABLE/);
});
