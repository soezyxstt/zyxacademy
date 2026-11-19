const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");
const { drizzle } = require("drizzle-orm/pglite");
const { eq } = require("drizzle-orm");

const isBun = typeof Bun !== "undefined";
const bunTest = isBun ? require("bun:test") : null;
const nodeTest = isBun ? null : require("node:test");
const test = (name, optsOrFn, maybeFn) => isBun
 ? (typeof optsOrFn === "function" ? bunTest.test(name, optsOrFn) : bunTest.test(name, maybeFn, optsOrFn?.timeout))
 : nodeTest.test(name, optsOrFn, maybeFn);
const before = (fn, optsOrTimeout = 300000) => isBun
 ? bunTest.beforeAll(fn, typeof optsOrTimeout === "number" ? optsOrTimeout : (optsOrTimeout?.timeout ?? 300000))
 : nodeTest.before(fn, typeof optsOrTimeout === "object" ? optsOrTimeout : { timeout: optsOrTimeout });
const after = fn => isBun ? bunTest.afterAll(fn) : nodeTest.after(fn);

const root = path.resolve(__dirname, "../..");
const load = Module._load;
let client, db, service;
const pushedTokens = [];
if (!isBun) {
 require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
 }).outputText, filename);
 Module._load = function (request, parent, isMain) {
  if (request === "@/db" || request === "@/lib/db") return { db };
  if (request === "server-only") return {};
  if (request === "@/lib/firebase/admin") return { adminMessaging: () => ({ sendEachForMulticast: async ({ tokens }) => { pushedTokens.push(...tokens); return { responses: tokens.map(() => ({ success: true })) }; } }) };
  if (request === "@/lib/auth-secret") return { resolveAuthSecret: () => "discussion-test-secret" };
  if (parent?.filename.endsWith(path.join("lib", "discussions", "service.ts"))) {
   if (request === "./images") return { attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() };
   if (request === "./rewards") return { enqueueDiscussionReward: async () => {} };
   if (request === "./notifications") return { clearDiscussionNotificationsThroughSeq: async () => {} };
  }
  return load.call(this, request.startsWith("@/") ? path.join(root, request.slice(2)) : request, parent, isMain);
 };
}
const schema = require("../../db/schema.ts");
const originalPka = process.env.FEATURE_PKA;
const nodes = plan => [plan, ...(plan.Plans ?? []).flatMap(nodes)];
const messageVisits = plan => nodes(plan).filter(node => node["Relation Name"] === "discussion_messages")
 .reduce((total, node) => total + (node["Actual Rows"] + (node["Rows Removed by Filter"] ?? 0)) * node["Actual Loops"], 0);
const participantVisits = plan => nodes(plan).filter(node => node["Relation Name"] === "discussion_thread_participants")
 .reduce((total, node) => total + (node["Actual Rows"] + (node["Rows Removed by Filter"] ?? 0)) * node["Actual Loops"], 0);

before(async () => {
 client = await PGlite.create();
 db = drizzle(client, { schema });
 if (isBun) {
  bunTest.mock.module("server-only", () => ({}));
  bunTest.mock.module("@/db", () => ({ db }));
  bunTest.mock.module("@/lib/db", () => ({ db }));
  bunTest.mock.module("@/lib/firebase/admin", () => ({ adminMessaging: () => ({ sendEachForMulticast: async ({ tokens }) => { pushedTokens.push(...tokens); return { responses: tokens.map(() => ({ success: true })) }; } }) }));
  bunTest.mock.module("@/lib/auth-secret", () => ({ resolveAuthSecret: () => "discussion-test-secret" }));
  bunTest.mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() }));
  bunTest.mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
  bunTest.mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
 }
 service = require("../../lib/discussions/service.ts");
 for (const file of fs.readdirSync(path.join(root, "drizzle-postgres")).filter(file => file.endsWith(".sql")).sort())
  await client.exec(fs.readFileSync(path.join(root, "drizzle-postgres", file), "utf8"));

 const people = [
  ...Array.from({ length: 9 }, (_, index) => ({ id: `echo-${index}`, name: `Echo 0${index}`, roles: ["student"] })),
  { id: "namesake-10", name: "Echo 09", roles: ["student"] },
  { id: "namesake-11", name: "Echo 09", roles: ["student"] },
  { id: "registered", name: "PKA Registered", roles: ["student"] },
  { id: "unregistered", name: "PKA Unregistered", roles: ["student"] },
  { id: "assigned", name: "PKA Assigned", roles: ["tutor"] },
  { id: "unassigned", name: "PKA Unassigned", roles: ["tutor"] },
  { id: "staff-admin", name: "PKA Admin", roles: ["admin"] },
  { id: "mixed-unassigned", name: "PKA Mixed unassigned", roles: ["tutor", "student"] },
  { id: "mixed-assigned", name: "PKA Mixed assigned", roles: ["tutor", "student"] },
  { id: "mixed-admin", name: "PKA Mixed admin", roles: ["admin", "tutor", "student"] },
  { id: "solo", name: "Solo Person", roles: ["student"] },
  ...Array.from({ length: 101 }, (_, index) => ({ id: `suspended-${index}`, name: "Solo Person", roles: ["student"] })),
  { id: "admin", name: "Admin", roles: ["admin"] },
  { id: "tutor", name: "Tutor", roles: ["tutor"] },
  { id: "nadia", name: "Nadia Putri", roles: ["student"] },
  { id: "other", name: "Nadia Dua", roles: ["student"] },
  { id: "outsider", name: "Secret Person", roles: ["student"] },
 ];
 await db.insert(schema.peran).values([{ id: "student-role", code: "murid" }, { id: "tutor-role", code: "tutor" }, { id: "admin-role", code: "admin" }]);
 await db.insert(schema.user).values(people.map(person => ({ id: person.id, name: person.name, email: `${person.id}@example.test` })));
 await db.insert(schema.pengguna).values(people.map(person => ({ id: person.id, status: person.id.startsWith("suspended-") ? "suspended" : "active" })));
 await db.insert(schema.penggunaPeran).values(people.flatMap(person => person.roles.map(role => ({
  id: `${person.id}-${role}`, penggunaId: person.id, peranId: `${role}-role`, source: "test",
 }))));
 await db.insert(schema.courses).values([
  { id: "tutorial-pka", title: "PKA", category: "TPB" },
  { id: "legacy-math", title: "Old math name", category: "Matematika" },
  { id: "legacy-only", title: "Legacy Label", category: "Matematika" },
 ]);
 await db.insert(schema.mataKuliah).values([
  { id: "canonical-pka", code: "PKA", title: "PKA", legacyCourseId: "tutorial-pka", pricingCategory: "free" },
  { id: "math", code: "MATH", title: "Matematika I", legacyCourseId: "legacy-math" },
  { id: "math-two", code: "MATH2", title: "Matematika Lanjut" },
 ]);
 await db.insert(schema.enrollments).values([
  { id: "registered-pka", userId: "registered", courseId: "tutorial-pka", expiresAt: new Date("2099-01-01") },
  { id: "mixed-unassigned-pka", userId: "mixed-unassigned", courseId: "tutorial-pka", expiresAt: new Date("2099-01-01") },
  { id: "legacy-nadia", userId: "nadia", courseId: "legacy-only", expiresAt: new Date("2099-01-01") },
 ]);
 await db.insert(schema.penugasanTutor).values([
  { id: "assigned-pka", penggunaId: "assigned", mataKuliahId: "canonical-pka", status: "active", assignmentScope: "course" },
  { id: "mixed-assigned-pka", penggunaId: "mixed-assigned", mataKuliahId: "canonical-pka", status: "active", assignmentScope: "course" },
  { id: "math-tutor", penggunaId: "tutor", mataKuliahId: "math", status: "active", assignmentScope: "course" },
 ]);
 await db.insert(schema.discussionChannels).values([
  { id: "global", kind: "global", title: "Global" },
  { id: "other-context", kind: "academic", title: "Other context", requesterId: "namesake-10" },
  { id: "pka", kind: "course", title: "PKA", courseId: "canonical-pka", legacyCourseId: "tutorial-pka" },
  { id: "course-math", kind: "course", title: "Kursus I", courseId: "math", legacyCourseId: "legacy-math" },
  { id: "course-math-two", kind: "course", title: "Kursus II", courseId: "math-two" },
  { id: "course-legacy", kind: "course", title: "Warisan", legacyCourseId: "legacy-only" },
  { id: "academic-nadia", kind: "academic", title: "Tim akademik", requesterId: "nadia", courseId: "math", legacyCourseId: "legacy-math" },
  { id: "technical-nadia", kind: "technical", title: "Tim teknis", requesterId: "nadia", courseId: "math", legacyCourseId: "legacy-math" },
  { id: "academic-other", kind: "academic", title: "Tim akademik", requesterId: "other", courseId: "math", legacyCourseId: "legacy-math" },
  { id: "technical-secret", kind: "technical", title: "Tim teknis", requesterId: "outsider", courseId: "math", legacyCourseId: "legacy-math" },
  { id: "technical-legacy", kind: "technical", title: "Tim teknis", requesterId: "nadia", legacyCourseId: "legacy-only" },
 ]);
 await db.insert(schema.discussionThreads).values([
  { id: "echo-thread", channelId: "global", authorId: "namesake-10", title: "Echo", nextSeq: 3 },
  { id: "aaa-other-thread", channelId: "other-context", authorId: "namesake-10", title: "Other", nextSeq: 3 },
 ]);
 await db.insert(schema.discussionMessages).values([
  { id: "echo-message-10", threadId: "echo-thread", authorId: "namesake-10", kind: "human", messageType: "question", body: "Same context", seq: 1, requestId: "echo-request-10" },
  { id: "echo-message-11", threadId: "echo-thread", authorId: "namesake-11", kind: "human", messageType: "answer", body: "  SAME   context ", seq: 2, requestId: "echo-request-11" },
  { id: "other-message-10", threadId: "aaa-other-thread", authorId: "namesake-10", kind: "human", messageType: "question", body: "Private context one", seq: 1, requestId: "other-request-10" },
  { id: "other-message-11", threadId: "aaa-other-thread", authorId: "namesake-11", kind: "human", messageType: "answer", body: "Private context two", seq: 2, requestId: "other-request-11" },
 ]);
 await client.exec(`INSERT INTO discussion_thread_participants
  (thread_id, user_id, channel_id, first_seq, first_created_at, earliest_created_at, earliest_created_seq)
  SELECT m.thread_id, m.author_id, t.channel_id, m.seq, m.created_at, m.created_at, m.seq FROM discussion_messages m
  JOIN discussion_threads t ON t.id = m.thread_id`);
});

after(async () => {
 if (originalPka === undefined) delete process.env.FEATURE_PKA; else process.env.FEATURE_PKA = originalPka;
 if (client) await client.close();
});

test("mention search uses eligible roles and bounded same-channel participant context", { timeout: 300000 }, async () => {
 const search = () => service.searchChannelMentions("namesake-10", "global", "Echo");
 const people = await search();
 assert.equal(people.length, 11);
 assert.deepEqual(people[9], { id: "namesake-10", name: "Echo 09", role: "student", hasNamesake: true, context: "Same context", ambiguous: true });
 assert.ok(people.some(person => person.id === "namesake-11"));

 await db.update(schema.discussionMessages).set({ body: "Different context" }).where(eq(schema.discussionMessages.id, "echo-message-11"));
 try {
  assert.deepEqual((await search())[9], { id: "namesake-10", name: "Echo 09", role: "student", hasNamesake: true, context: "Same context" });
 } finally {
  await db.update(schema.discussionMessages).set({ body: "  SAME   context " }).where(eq(schema.discussionMessages.id, "echo-message-11"));
 }
 await db.update(schema.penggunaPeran).set({ peranId: "tutor-role" }).where(eq(schema.penggunaPeran.id, "namesake-11-student"));
 try {
  assert.deepEqual(await service.searchChannelMentions("namesake-10", "global", "Echo 09"), [
   { id: "namesake-10", name: "Echo 09", role: "student" }, { id: "namesake-11", name: "Echo 09", role: "tutor" },
  ]);
 } finally {
  await db.update(schema.penggunaPeran).set({ peranId: "student-role" }).where(eq(schema.penggunaPeran.id, "namesake-11-student"));
 }
 for (const revokedId of ["namesake-11", "namesake-10"]) {
  const original = client.query;
  let revoked = false;
  client.query = function (...args) {
   return original.apply(this, args).then(async result => {
    if (!revoked && /from "user"/i.test(String(args[0])) && /join "pengguna"/i.test(String(args[0])) && /ilike/i.test(String(args[0]))) {
     assert.ok(result.rows.some(row => row[0] === revokedId));
     revoked = true;
     await original.call(client, "UPDATE pengguna SET status = 'suspended' WHERE id = $1", [revokedId]);
    }
    return result;
   });
  };
  try {
   if (revokedId === "namesake-11") assert.deepEqual((await search())[9], { id: "namesake-10", name: "Echo 09", role: "student" });
   else await assert.rejects(search(), /DISCUSSION_UNAVAILABLE/);
   assert.ok(revoked, `${revokedId} was not suspended after candidate selection`);
  } finally {
   client.query = original;
   await db.update(schema.pengguna).set({ status: "active" }).where(eq(schema.pengguna.id, revokedId));
  }
 }
 assert.deepEqual(await service.searchChannelMentions("solo", "global", "Solo"), [{ id: "solo", name: "Solo Person", role: "student" }]);

 const overflow = Array.from({ length: 101 }, (_, index) => ({ id: `overflow-${String(index).padStart(3, "0")}`, name: `Overflow ${String(index).padStart(3, "0")}` }));
 await db.insert(schema.user).values(overflow.map(person => ({ ...person, email: `${person.id}@example.test` })));
 await db.insert(schema.pengguna).values(overflow.map(person => ({ id: person.id })));
 await db.insert(schema.penggunaPeran).values(overflow.map(person => ({ id: `${person.id}-student`, penggunaId: person.id, peranId: "student-role", source: "test" })));
 const limited = await service.searchChannelMentions("namesake-10", "global", "Overflow");
 assert.equal(limited.length, 100);
 assert.ok(limited.every(person => person.ambiguous === true && !("hasNamesake" in person)));

 process.env.FEATURE_PKA = "1";
 const pka = await service.searchChannelMentions("staff-admin", "pka", "PKA");
 assert.deepEqual(Object.fromEntries(pka.map(person => [person.id, person.role])), {
  assigned: "tutor", "staff-admin": "admin", "mixed-admin": "admin", "mixed-assigned": "tutor", registered: "student",
 });
 assert.ok(!JSON.stringify(pka).includes("@example.test"));
 await db.update(schema.penugasanTutor).set({ status: "revoked" }).where(eq(schema.penugasanTutor.id, "assigned-pka"));
 try {
  assert.ok(!(await service.searchChannelMentions("staff-admin", "pka", "PKA")).some(person => person.id === "assigned"));
 } finally {
  await db.update(schema.penugasanTutor).set({ status: "active" }).where(eq(schema.penugasanTutor.id, "assigned-pka"));
 }
 process.env.FEATURE_PKA = "0";
 await assert.rejects(service.searchChannelMentions("staff-admin", "pka", "PKA"), /DISCUSSION_UNAVAILABLE/);

 const original = client.query;
 const capturePlan = async () => {
  let statement;
  client.query = function (...args) {
   if (/join lateral/i.test(String(args[0])) && /discussion_thread_participants/i.test(String(args[0])))
    statement = { text: String(args[0]), params: args[1] };
   return original.apply(this, args);
  };
  try { await search(); } finally { client.query = original; }
  assert.ok(statement, "missing namesake context query");
  assert.match(statement.text, /p\.first_seq/i);
  assert.match(statement.text, /p\.channel_id\s*=.*p\.user_id\s*=.*order by p\.thread_id limit 1/is);
  assert.match(statement.text, /cross join lateral\s*\(\s*select left\(message\.body, 100\).*message\.thread_id\s*=\s*participant\.thread_id.*message\.seq\s*=\s*participant\.first_seq.*limit 1\s*\) m/is);
  const plan = (await original.call(client, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement.text}`, statement.params)).rows[0]["QUERY PLAN"][0].Plan;
  return { visits: messageVisits(plan), participantVisits: participantVisits(plan), plan };
 };
 await client.exec("ANALYZE discussion_messages; ANALYZE discussion_thread_participants; ANALYZE discussion_threads");
 const short = await capturePlan();
 await client.exec(`INSERT INTO discussion_messages (id, thread_id, author_id, kind, message_type, body, seq, request_id)
  SELECT 'echo-history-' || n, 'echo-thread', 'namesake-10', 'human', 'answer', 'Long unrelated answer', n, 'echo-history-' || n
  FROM generate_series(3, 10002) n; ANALYZE discussion_messages`);
 const long = await capturePlan();
 assert.ok(long.visits <= short.visits + 4, `message visits grew from ${short.visits} to ${long.visits}`);
 assert.ok(long.visits < 20, `long history visited ${long.visits} messages`);

 await client.exec(`
  INSERT INTO discussion_threads (id, channel_id, author_id, title, next_seq)
   SELECT 'zz-same-' || lpad(n::text, 5, '0'), 'global', 'namesake-10', 'Same channel', 2 FROM generate_series(1, 10000) n
   UNION ALL SELECT 'zz-other-' || lpad(n::text, 5, '0'), 'other-context', 'namesake-11', 'Other channel', 2 FROM generate_series(1, 10000) n;
  INSERT INTO discussion_messages (id, thread_id, author_id, kind, message_type, body, seq, request_id)
   SELECT 'context-message-' || t.id, t.id, t.author_id, 'human', 'question', 'Historical context', 1, 'context-request-' || t.id
   FROM discussion_threads t WHERE t.id LIKE 'zz-same-%' OR t.id LIKE 'zz-other-%';
  INSERT INTO discussion_thread_participants (thread_id, user_id, channel_id, first_seq, first_created_at, earliest_created_at, earliest_created_seq)
   SELECT m.thread_id, m.author_id, t.channel_id, m.seq, m.created_at, m.created_at, m.seq FROM discussion_messages m
   JOIN discussion_threads t ON t.id = m.thread_id WHERE t.id LIKE 'zz-same-%' OR t.id LIKE 'zz-other-%';
  ANALYZE discussion_messages; ANALYZE discussion_thread_participants; ANALYZE discussion_threads;
 `);
 const many = await capturePlan();
 assert.ok(nodes(many.plan).some(node => node["Index Name"] === "discussion_thread_participants_channel_user_thread_idx"));
 assert.ok(many.participantVisits < 20, `same-channel history visited ${many.participantVisits} participant rows`);
 assert.ok(many.visits < 20, `same-channel history visited ${many.visits} message rows`);
 let deletedVisits, forwardVisits, missingVisits;
 await client.exec("UPDATE discussion_messages SET deleted_at = now(), deleted_by_id = 'namesake-10' WHERE id = 'echo-message-10'");
 try {
  const deleted = (await service.searchChannelMentions("namesake-10", "global", "Echo 09")).find(person => person.id === "namesake-10");
  assert.ok(deleted && !("context" in deleted));
  const deletedPlan = await capturePlan();
  assert.ok(deletedPlan.participantVisits < 20 && deletedPlan.visits < 20,
   `deleted context visited ${deletedPlan.participantVisits} participants and ${deletedPlan.visits} messages: ${JSON.stringify(nodes(deletedPlan.plan)
    .filter(node => ["discussion_messages", "discussion_thread_participants"].includes(node["Relation Name"]))
    .map(node => ({ relation: node["Relation Name"], type: node["Node Type"], index: node["Index Name"], rows: node["Actual Rows"], removed: node["Rows Removed by Filter"], loops: node["Actual Loops"] })))}`);
  deletedVisits = { messages: deletedPlan.visits, participants: deletedPlan.participantVisits };
 } finally {
  await client.exec("UPDATE discussion_messages SET deleted_at = NULL, deleted_by_id = NULL WHERE id = 'echo-message-10'");
 }
 await client.exec("UPDATE discussion_messages SET message_type = 'forward', forwarded_from_id = 'echo-message-10' WHERE id = 'echo-message-11'");
 try {
  const forward = (await service.searchChannelMentions("namesake-10", "global", "Echo 09")).find(person => person.id === "namesake-11");
  assert.ok(forward && !("context" in forward));
  const forwardPlan = await capturePlan();
  assert.ok(forwardPlan.participantVisits < 20 && forwardPlan.visits < 20,
   `forward context visited ${forwardPlan.participantVisits} participants and ${forwardPlan.visits} messages`);
  forwardVisits = { messages: forwardPlan.visits, participants: forwardPlan.participantVisits };
 } finally {
  await client.exec("UPDATE discussion_messages SET message_type = 'answer', forwarded_from_id = NULL WHERE id = 'echo-message-11'");
 }
 await client.exec("DELETE FROM discussion_thread_participants WHERE thread_id = 'echo-thread' AND user_id = 'namesake-11'");
 try {
  const noContext = await capturePlan();
  assert.ok(noContext.participantVisits < 20, `missing context visited ${noContext.participantVisits} participant rows`);
  assert.ok(noContext.visits < 20, `missing context visited ${noContext.visits} message rows`);
  missingVisits = { messages: noContext.visits, participants: noContext.participantVisits };
  const other = (await service.searchChannelMentions("namesake-10", "global", "Echo 09")).find(person => person.id === "namesake-11");
  assert.ok(other && !("context" in other));
 } finally {
  await client.exec(`INSERT INTO discussion_thread_participants (thread_id, user_id, channel_id, first_seq, first_created_at, earliest_created_at, earliest_created_seq)
   SELECT m.thread_id, m.author_id, t.channel_id, m.seq, m.created_at, m.created_at, m.seq FROM discussion_messages m
   JOIN discussion_threads t ON t.id = m.thread_id WHERE m.id = 'echo-message-11'`);
 }
 console.log(JSON.stringify({ namesakeContextVisits: { short: { messages: short.visits, participants: short.participantVisits },
  long: { messages: long.visits, participants: long.participantVisits }, many: { messages: many.visits, participants: many.participantVisits },
  deleted: deletedVisits, forward: forwardVisits, missing: missingVisits } }));
});

test("channel search paginates authorized course labels and rechecks current access", { timeout: 300000 }, async () => {
 const pages = async (actor, search) => {
  const items = [];
  let cursor;
  for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
   const page = await service.listChannelsPage(actor, { search, limit: 1, cursor });
   assert.ok(page.items.length <= 1);
   assert.ok(!JSON.stringify(page).includes("@example.test"));
   assert.ok(!JSON.stringify(page).includes("requesterId"));
   items.push(...page.items);
   cursor = page.nextCursor ?? undefined;
   if (!cursor) break;
  }
  assert.equal(cursor, undefined);
  assert.equal(new Set(items.map(item => item.id)).size, items.length);
  return items;
 };
 assert.deepEqual(await pages("admin", "Nadia"), []);
 assert.deepEqual((await service.listChannelsPage("nadia", { search: "Nadia" })).items, []);
 assert.deepEqual((await service.listChannelsPage("tutor", { search: "Nadia" })).items, []);
 const adminMath = await pages("admin", "Matematika");
 assert.deepEqual(adminMath.map(item => item.id).sort(), ["course-math", "course-math-two"]);
 assert.deepEqual((await service.listChannelsPage("admin", { search: "Matematika%" })).items, []);
 assert.deepEqual((await service.listChannelsPage("nadia", { search: "Matematika" })).items, []);
 const tutor = await pages("tutor", "Matematika");
 assert.deepEqual(tutor.map(item => item.id), ["course-math"]);

 assert.deepEqual((await service.listChannelsPage("admin", { search: "Old math name" })).items, []);
 const legacy = await pages("nadia", "Legacy Label");
 assert.deepEqual(legacy.map(item => item.id), ["course-legacy"]);

 await db.update(schema.penugasanTutor).set({ status: "revoked" }).where(eq(schema.penugasanTutor.id, "math-tutor"));
 try {
  assert.deepEqual((await service.listChannelsPage("tutor", { search: "Matematika I" })).items, []);
 } finally {
  await db.update(schema.penugasanTutor).set({ status: "active" }).where(eq(schema.penugasanTutor.id, "math-tutor"));
 }
 await db.insert(schema.mataKuliah).values({ id: "conflict", code: "CONFLICT", title: "Other", legacyCourseId: "legacy-math", pricingCategory: "free" });
 try {
  assert.deepEqual((await service.listChannelsPage("admin", { search: "Matematika I" })).items, []);
 } finally {
  await db.delete(schema.mataKuliah).where(eq(schema.mataKuliah.id, "conflict"));
 }

 const original = client.query;
 for (const revocation of ["role", "downgrade", "course"]) {
  let revoked = false;
  client.query = function (...args) {
   return original.apply(this, args).then(async result => {
    if (!revoked && /from "discussion_channels"/i.test(String(args[0])) && /order by/i.test(String(args[0])) && /limit/i.test(String(args[0]))) {
     revoked = true;
     await client.exec(revocation === "course" ? "UPDATE mata_kuliah SET status = 'archived' WHERE id = 'math'"
      : revocation === "role" ? "DELETE FROM pengguna_peran WHERE id = 'admin-admin'"
      : "DELETE FROM pengguna_peran WHERE id = 'admin-admin'; INSERT INTO pengguna_peran (id, pengguna_id, peran_id, source) VALUES ('admin-student', 'admin', 'student-role', 'test')");
    }
    return result;
   });
  };
  try {
   if (revocation === "role" || revocation === "downgrade") await assert.rejects(service.listChannelsPage("admin", { search: "Matematika I", limit: 1 }), /DISCUSSION_UNAVAILABLE/);
   else assert.deepEqual((await service.listChannelsPage("admin", { search: "Matematika I", limit: 1 })).items, []);
   assert.ok(revoked, `${revocation} was not revoked after candidate selection`);
  } finally {
   client.query = original;
   if (revoked && revocation === "course") await client.exec("UPDATE mata_kuliah SET status = 'active' WHERE id = 'math'");
   else if (revoked) {
    if (revocation === "downgrade") await client.exec("DELETE FROM pengguna_peran WHERE id = 'admin-student'");
    await db.insert(schema.penggunaPeran).values({ id: "admin-admin", penggunaId: "admin", peranId: "admin-role", source: "test" });
   }
  }
 }
});


test("rare and absent two-character names use the substring index across 10000 eligible accounts", { timeout: 300000 }, async () => {
 await client.exec(`
  INSERT INTO "user" (id,name,email) SELECT 'candidate-' || n, 'Candidate ' || n, 'candidate-' || n || '@example.test' FROM generate_series(1,10000) n;
  INSERT INTO pengguna (id,status) SELECT id, 'active' FROM "user" WHERE id LIKE 'candidate-%';
  INSERT INTO pengguna_peran (id,pengguna_id,peran_id,source) SELECT id || '-role', id, 'student-role', 'test' FROM "user" WHERE id LIKE 'candidate-%';
  INSERT INTO "user" (id,name,email) VALUES ('candidate-rare','Candidate Zq Reader','candidate-rare@example.test');
  INSERT INTO pengguna (id,status) VALUES ('candidate-rare','active');
  INSERT INTO pengguna_peran (id,pengguna_id,peran_id,source) VALUES ('candidate-rare-role','candidate-rare','student-role','test');
  ANALYZE "user"; ANALYZE pengguna; ANALYZE pengguna_peran;
 `);
 const original = client.query;
 for (const [term, expected] of [['zq', ['candidate-rare']], ['qz', []], ['candidate zq', ['candidate-rare']], ['candidate qz', []]]) {
  let statement;
  client.query = function (...args) {
   if (/from "user" inner join "pengguna"/i.test(String(args[0])) && /regexp_replace/i.test(String(args[0]))) statement = { text: String(args[0]), params: args[1] };
   return original.apply(this, args);
  };
  let result;
  try { result = await service.searchChannelMentions('admin', 'global', term); } finally { client.query = original; }
  assert.deepEqual(result.map(person => person.id), expected);
  assert.ok(statement);
  const plan = (await original.call(client, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement.text}`, statement.params)).rows[0]['QUERY PLAN'][0].Plan;
  assert.ok(nodes(plan).some(node => node['Index Name'] === 'user_name_bigrams_idx'), JSON.stringify(plan));
  const visits = nodes(plan).filter(node => node['Relation Name'] === 'user').reduce((sum,node) => sum + ((node['Actual Rows'] ?? 0) + (node['Rows Removed by Filter'] ?? 0)) * (node['Actual Loops'] ?? 1),0);
  assert.ok(visits < 30, `${term}: ${visits} user visits`);
  console.log(JSON.stringify({ kind: 'mention-candidate-index', term, visits }));
 }
});


test("token pages use indexed resumable ranges across a 1201-device recipient", { timeout: 300000 }, async () => {
 const { sendPushToUsers } = require('../../lib/notifications/send.ts');
 await client.exec(`
  INSERT INTO user_push_tokens (id,user_id,token) SELECT 'device-' || lpad(n::text,5,'0'), 'admin', 'token-' || n FROM generate_series(1,1201) n;
  INSERT INTO user_push_tokens (id,user_id,token) SELECT 'unrelated-device-' || n, 'tutor', 'unrelated-token-' || n FROM generate_series(1,10000) n;
  ANALYZE user_push_tokens;
 `);
 const payload = { title: 'Update', body: 'Update', type: 'discussion', link: '/discussions?thread=thread' };
 const original = client.query;
 let cursor, pages = 0;
 do {
  let statement;
  client.query = function (...args) {
   if (/cross join lateral/i.test(String(args[0])) && /user_push_tokens/i.test(String(args[0]))) statement = { text: String(args[0]), params: args[1] };
   return original.apply(this,args);
  };
  let result;
  try { result = (await sendPushToUsers([{ userId: 'admin', payload, after: cursor }])).get('admin'); } finally { client.query = original; }
  assert.ok(result.attempted <= 100);
  assert.ok(statement);
  const plan = (await original.call(client, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${statement.text}`,statement.params)).rows[0]['QUERY PLAN'][0].Plan;
  const scans = nodes(plan).filter(node => node['Relation Name'] === 'user_push_tokens');
  const visits = scans.reduce((sum,node) => sum + ((node['Actual Rows'] ?? 0) + (node['Rows Removed by Filter'] ?? 0)) * (node['Actual Loops'] ?? 1),0);
  assert.ok(visits <= 102, `${pages}: ${visits} token visits: ${JSON.stringify(plan)}`);
  cursor = result.nextCursor;
  pages++;
 } while (cursor && pages < 20);
 assert.equal(pages,13);
 assert.equal(pushedTokens.length,1201);
 assert.equal(new Set(pushedTokens).size,1201);
 console.log(JSON.stringify({ kind: 'push-token-page-index', pages, devices: pushedTokens.length, maxVisits: 102 }));
});
