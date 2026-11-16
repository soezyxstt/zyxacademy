const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { before, after, test } = require("node:test");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");
const { drizzle } = require("drizzle-orm/pglite");
const { eq } = require("drizzle-orm");

const root = path.resolve(__dirname, "../..");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
 compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const load = Module._load;
let client, db, service;
const storage = new Proxy({}, { get() { throw new Error("Unexpected external storage access"); } });
Module._load = function (request, parent, isMain) {
 if (request === "@/db" || request === "@/lib/db") return { db };
 if (request === "server-only") return {};
 if (request === "@/lib/auth-secret") return { resolveAuthSecret: () => "discussion-test-secret" };
 if (request === "@/lib/auth-session") return { getAuthSession: async () => null };
 if (request === "@/lib/storage") return { storage, STORAGE_PROVIDER_MODE: "neon" };
 return load.call(this, request.startsWith("@/") ? path.join(root, request.slice(2)) : request, parent, isMain);
};
const schema = require("../../db/schema.ts");
const extras = require("../../db/schedule-extras.ts");
const { parsePostgresNumber } = require("../../lib/db/postgres-result.ts");

before(async () => {
 client = await PGlite.create({ parsers: { 20: parsePostgresNumber, 1700: parsePostgresNumber } });
 const directory = path.join(root, "drizzle-postgres");
 const migrations = fs.readdirSync(directory).filter(file => /^\d{4}_.*\.sql$/.test(file)).sort();
 assert.ok(migrations.length >= 31);
 for (const [index, file] of migrations.entries()) {
  assert.equal(file.slice(0, 4), String(index).padStart(4, "0"));
  await client.exec(fs.readFileSync(path.join(directory, file), "utf8"));
 }
 db = drizzle(client, { schema: { ...schema, ...extras } });
 service = require("../../lib/discussions/service.ts");
 await db.insert(schema.peran).values({ id: "role-student", code: "murid" });
 for (const id of ["owner", "participant"]) {
  await db.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role: "student" });
  await db.insert(schema.pengguna).values({ id, status: "active" });
  await db.insert(schema.penggunaPeran).values({ id: `membership-${id}`, penggunaId: id, peranId: "role-student", source: "test" });
 }
 await db.insert(schema.discussionChannels).values({ id: "global", kind: "global", title: "Umum" });
});

after(async () => {
 try { if (client) await client.close(); } finally { Module._load = load; }
});

const submit = (requestId, body) => ({ body, attachmentIds: [], mentionIds: [], askZyra: false, requestId });

test("resolved retries distinguish a committed replay from an uncommitted participant draft", async () => {
 const question = await service.createThread("owner", { ...submit("question", "Question"), channelId: "global", title: "Question" });
 const committed = { ...submit("committed", "Already committed"), threadId: question.threadId, messageType: "reply", replyTo: question.messageId };
 const first = await service.reply("participant", committed);
 const notCommitted = { ...submit("not-committed", "Preserve this draft"), threadId: question.threadId, messageType: "reply", replyTo: question.messageId };
 await service.setResolved("owner", question.threadId, true);
 const view = await service.getThread("participant", question.threadId);
 assert.equal(view.thread.canResolve, false);
 assert.deepEqual(await service.reply("participant", committed), first);
 const [before] = await db.select().from(schema.discussionThreads).where(eq(schema.discussionThreads.id, question.threadId));
 await assert.rejects(service.reply("participant", notCommitted), /DISCUSSION_RESOLVED/);
 await assert.rejects(service.setResolved("participant", question.threadId, false), /DISCUSSION_UNAVAILABLE/);
 const [after] = await db.select().from(schema.discussionThreads).where(eq(schema.discussionThreads.id, question.threadId));
 assert.equal(after.nextSeq, before.nextSeq);
 assert.equal(after.status, "resolved");
 assert.deepEqual(await db.select().from(schema.discussionMessages).where(eq(schema.discussionMessages.requestId, notCommitted.requestId)), []);
});

test("a deep report target supplies its bounded adjacent prior page", async () => {
 await db.insert(schema.discussionThreads).values({ id: "deep-thread", channelId: "global", authorId: "owner", title: "Deep target", nextSeq: 476 });
 await db.insert(schema.discussionMessages).values(Array.from({ length: 475 }, (_, index) => ({
  id: `deep-${index + 1}`, threadId: "deep-thread", authorId: "owner", kind: "human", messageType: index ? "answer" : "question",
  body: `Message ${index + 1}`, seq: index + 1, requestId: `deep-request-${index + 1}`,
 })));
 const target = await service.getThread("participant", "deep-thread", undefined, "deep-450");
 assert.equal(target.messages.items[0].id, "deep-450");
 assert.equal(typeof target.messages.startCursor, "string");
 assert.equal(typeof target.messages.previousCursor, "string");
 const previous = await service.getThread("participant", "deep-thread", target.messages.previousCursor);
 assert.equal(previous.messages.items.length, 30);
 assert.equal(previous.messages.items[0].id, "deep-420");
 assert.equal(previous.messages.items.at(-1).id, "deep-449");
 const returned = await service.getThread("participant", "deep-thread", target.messages.startCursor);
 assert.deepEqual(returned.messages.items.map(item => item.id), target.messages.items.map(item => item.id));
});
