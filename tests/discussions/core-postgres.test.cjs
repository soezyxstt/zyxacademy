const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { before, after, describe, test } = require("node:test");
const { expect } = require("@playwright/test");
const ts = require("typescript");
const { PGlite } = require("@electric-sql/pglite");
const { drizzle } = require("drizzle-orm/pglite");
const { and, eq, inArray } = require("drizzle-orm");

const root = path.resolve(__dirname, "../..");
require.extensions[".ts"] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
 compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, filename);
const load = Module._load;
let client, db, access, service, policy, session;
let sessionUserId = null;
const storage = new Proxy({}, { get() { throw new Error("Unexpected external storage access"); } });
Module._load = function (request, parent, isMain) {
 if (request === "@/db" || request === "@/lib/db") return { db };
 if (request === "server-only") return {};
 if (request === "@/lib/auth-secret") return { resolveAuthSecret: () => "discussion-test-secret" };
 if (request === "@/lib/auth-session") return { getAuthSession: async () => sessionUserId ? { user: { id: sessionUserId } } : null };
 if (request === "@/lib/storage") return { storage, STORAGE_PROVIDER_MODE: "neon" };
 return load.call(this, request.startsWith("@/") ? path.join(root, request.slice(2)) : request, parent, isMain);
};
const schema = require("../../db/schema.ts");
const extras = require("../../db/schedule-extras.ts");
const { parsePostgresNumber } = require("../../lib/db/postgres-result.ts");
const { recordDiscussionParticipant } = require("../../lib/discussions/participants.ts");
after(async () => {
 try { if (client) await client.close(); } finally { Module._load = load; }
});

before(async () => {
 client = await PGlite.create({ parsers: { 20: parsePostgresNumber, 1700: parsePostgresNumber } });
 const migrationDirectory = path.join(root, "drizzle-postgres");
 const migrations = fs.readdirSync(migrationDirectory).filter(file => /^\d{4}_.*\.sql$/.test(file)).sort();
 assert.ok(migrations.length >= 31);
 for (const [index, file] of migrations.entries()) {
  assert.equal(file.slice(0, 4), String(index).padStart(4, "0"));
  await client.exec(fs.readFileSync(path.join(migrationDirectory, file), "utf8"));
 }
 db = drizzle(client, { schema: { ...schema, ...extras } });
 access = require("../../lib/discussions/access.ts");
 service = require("../../lib/discussions/service.ts");
 policy = require("../../lib/discussions/policy.ts");
 session = require("../../lib/discussions/session.ts");
 await db.insert(schema.peran).values([{ id: "r-student", code: "murid" }, { id: "r-tutor", code: "tutor" }, { id: "r-admin", code: "admin" }]);
 for (const [id, role] of [["alice", "student"], ["bob", "student"], ["carol", "student"], ["tutor", "tutor"], ["admin", "admin"], ["suspended", "student"]]) {
  await db.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role: role === "tutor" ? "teacher" : role });
  await db.insert(schema.pengguna).values({ id, status: id === "suspended" ? "suspended" : "active" });
  await db.insert(schema.penggunaPeran).values({ id: `membership-${id}`, penggunaId: id, peranId: `r-${role}`, source: "test" });
 }
 await db.insert(schema.courses).values([{ id: "legacy-a", title: "A", category: "Matematika" }, { id: "legacy-b", title: "B", category: "Fisika" }]);
 await db.insert(schema.mataKuliah).values([{ id: "course-a", code: "A", title: "A", legacyCourseId: "legacy-a" }, { id: "course-b", code: "B", title: "B", legacyCourseId: "legacy-b" }]);
 for (const [userId, courseId] of [["alice", "legacy-a"], ["bob", "legacy-a"], ["carol", "legacy-b"]]) {
  await db.insert(schema.enrollments).values({ id: `enrollment-${userId}`, userId, courseId, expiresAt: new Date("2099-01-01") });
 }
 await db.insert(schema.penugasanTutor).values({ id: "assignment", penggunaId: "tutor", mataKuliahId: "course-a", status: "active", assignmentScope: "course" });
 await db.insert(schema.discussionChannels).values([
  { id: "global", kind: "global", title: "Umum" },
  { id: "channel-a", kind: "course", title: "A", courseId: "course-a", legacyCourseId: "legacy-a" },
  { id: "channel-b", kind: "course", title: "B", courseId: "course-b", legacyCourseId: "legacy-b" },
  { id: "private-tech", kind: "technical", title: "Teknis", requesterId: "alice", courseId: "course-a", legacyCourseId: "legacy-a" },
  { id: "private-academic", kind: "academic", title: "Akademik", requesterId: "alice", courseId: "course-a", legacyCourseId: "legacy-a" },
 ]);
});

const submit = (requestId, body = "Pertanyaan") => ({ body, attachmentIds: [], mentionIds: [], askZyra: false, requestId });
async function recordSeedParticipants(threadIds) {
 const messages = await db.select({ id: schema.discussionMessages.id }).from(schema.discussionMessages)
  .where(inArray(schema.discussionMessages.threadId, threadIds));
 await db.transaction(async tx => {
  for (const message of messages) await recordDiscussionParticipant(tx, message.id);
 });
}

describe("discussion authorization and transactions", { concurrency: false }, () => {
 test("bounded channel metadata omits revoked scopes and exact course pages exclude team channels", async () => {
  const channels = await service.listChannels("bob", ["channel-a", "channel-b", "private-academic", "missing", "global"]);
  expect(channels.map(row => row.id).sort()).toEqual(["channel-a", "global"]);
  expect(channels.find(row => row.id === "channel-a")?.courseId).toBe("course-a");
  await expect(service.listChannels("bob", Array.from({ length: 32 }, () => "global"))).rejects.toThrow("DISCUSSION_INVALID");
  expect(await service.listChannels("bob", [])).toEqual([]);
  const course = await service.listChannelsPage("alice", { courseId: "legacy-a", kind: "course" });
  expect(course.items.map(row => row.id)).toEqual(["channel-a"]);
  await expect(service.listChannelsPage("alice", { kind: "unknown" })).rejects.toThrow("DISCUSSION_INVALID");
 });
 test("active roles, full entitlement, assignment, privacy, and alias ambiguity are enforced", async () => {
  const alice = await access.getDiscussionActor("alice"), bob = await access.getDiscussionActor("bob"), tutor = await access.getDiscussionActor("tutor");
  await expect(access.getDiscussionActor("suspended")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(access.requireDiscussionChannelAccess(alice, "channel-a")).resolves.toBeDefined();
  await expect(access.requireDiscussionChannelAccess(bob, "channel-b")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(access.requireDiscussionChannelAccess(bob, "private-academic")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(access.requireDiscussionChannelAccess({ id: "bob", role: "admin" }, "private-tech")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(access.requireDiscussionChannelAccess(tutor, "private-tech")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(access.requireDiscussionChannelAccess(tutor, "private-academic")).resolves.toBeDefined();
  await db.update(schema.penugasanTutor).set({ status: "revoked" }).where(eq(schema.penugasanTutor.id, "assignment"));
  await expect(access.requireDiscussionChannelAccess(tutor, "private-academic")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await db.update(schema.penugasanTutor).set({ status: "active" }).where(eq(schema.penugasanTutor.id, "assignment"));
  await db.insert(schema.mataKuliah).values({ id: "ambiguous", code: "AMB", title: "Ambiguous", legacyCourseId: "legacy-a" });
  await expect(access.requireDiscussionChannelAccess(alice, "channel-a")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await db.delete(schema.mataKuliah).where(eq(schema.mataKuliah.id, "ambiguous"));
 });

 test("channel mention search returns only currently authorized people without email addresses", async () => {
  expect(await service.searchChannelMentions("alice", "channel-a", "bo")).toEqual([{ id: "bob", name: "bob", role: "student" }]);
  expect(await service.searchChannelMentions("alice", "channel-a", "car")).toEqual([]);
  await expect(service.searchChannelMentions("bob", "private-tech", "ali")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  expect(await service.searchChannelMentions("alice", "channel-a", "%_")).toEqual([]);
 });

 test("channel listing and team preparation create only the requester's authorized upload scopes", async () => {
  const channels = await service.listChannels("alice");
  expect(channels.some(channel => channel.id === "channel-a")).toBe(true);
  expect(channels.some(channel => channel.id === "channel-b")).toBe(false);
  expect(channels.filter(channel => channel.kind === "technical").length).toBeGreaterThan(0);
  const team = await service.ensureDiscussionTeamChannel("alice", "technical", "legacy-a");
  expect(team.id).toBe("private-tech");
  expect(await service.ensureDiscussionTeamChannel("alice", "technical", "course-a")).toEqual(team);
  await expect(service.ensureDiscussionTeamChannel("bob", "academic", "course-b")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
 });

 test("question and answer retries are idempotent, rewards and durable work commit once", async () => {
  const input = { ...submit("create-1"), channelId: "channel-a", title: "Topik", askZyra: true };
  const first = await service.createThread("alice", input);
  expect(await service.createThread("alice", input)).toEqual(first);
  await expect(service.createThread("alice", { ...input, body: "Berbeda" })).rejects.toThrow("DISCUSSION_CONFLICT");
  expect(await db.select().from(schema.discussionEvents).where(eq(schema.discussionEvents.threadId, first.threadId))).toHaveLength(1);
  const requests = await db.select().from(schema.discussionAiRequests).where(eq(schema.discussionAiRequests.messageId, first.messageId));
  expect(requests.map(row => row.kind).sort()).toEqual(["label", "zyra"]);
  const answerInput = { ...submit("answer-1", "Jawaban"), threadId: first.threadId, messageType: "answer" };
  const answer = await service.reply("bob", answerInput);
  expect(await service.reply("bob", answerInput)).toEqual(answer);
  await service.reply("alice", { ...submit("self-answer"), threadId: first.threadId, messageType: "answer" });
  const reply = await service.reply("bob", { ...submit("context-reply"), threadId: first.threadId, messageType: "reply", replyTo: first.messageId });
  await expect(service.reply("bob", { ...submit("invalid-type"), threadId: first.threadId, messageType: "answer", replyTo: first.messageId })).rejects.toThrow("DISCUSSION_INVALID");
  const messages = await db.select().from(schema.discussionMessages).where(eq(schema.discussionMessages.threadId, first.threadId)).orderBy(schema.discussionMessages.seq);
  expect(messages.map(row => [row.seq, row.messageType])).toEqual([[1, "question"], [2, "answer"], [3, "answer"], [4, "reply"]]);
  const page = await service.listThreads("bob", "channel-a");
  expect(page.items.find(item => item.id === first.threadId)?.answerCount).toBe(2);
  const [beforeFailure] = await db.select().from(schema.discussionThreads).where(eq(schema.discussionThreads.id, first.threadId));
  await expect(service.reply("bob", { ...submit("answer-attachment-failure"), threadId: first.threadId, messageType: "answer", attachmentIds: ["missing"] }))
   .rejects.toThrow("DISCUSSION_IMAGE_SCOPE");
  const [afterFailure] = await db.select().from(schema.discussionThreads).where(eq(schema.discussionThreads.id, first.threadId));
  expect([afterFailure.nextSeq, afterFailure.answerCount]).toEqual([beforeFailure.nextSeq, beforeFailure.answerCount]);
  await expect(db.update(schema.discussionThreads).set({ answerCount: -1 }).where(eq(schema.discussionThreads.id, first.threadId)).execute()).rejects.toThrow();
  const rewards = await db.select().from(schema.gamificationEventOutbox).where(eq(schema.gamificationEventOutbox.evidenceId, first.threadId));
  expect(rewards.map(row => row.source).sort()).toEqual(["discussion_answer", "discussion_question"]);
  const request = requests.find(row => row.kind === "zyra");
  await db.update(schema.discussionAiRequests).set({ status: "processing" }).where(eq(schema.discussionAiRequests.id, request.id));
  await expect(service.publishDiscussionZyraAnswer(request.id, "Jawaban Zyra", [{ id: first.messageId, revision: 2 }])).rejects.toThrow("DISCUSSION_AI_SOURCE_CHANGED");
  await expect(service.publishDiscussionZyraAnswer(request.id, "Jawaban Zyra")).rejects.toThrow("DISCUSSION_AI_SOURCE_CHANGED");
  const ai = await service.publishDiscussionZyraAnswer(request.id, "Jawaban Zyra", [{ id: first.messageId, revision: 1 }],
   { contextIds: [first.messageId], attachmentSets: [{ messageId: first.messageId, ids: [] }] });
  expect(await service.publishDiscussionZyraAnswer(request.id, "Jawaban Zyra")).toEqual(ai);
  expect((await service.listThreads("bob", "channel-a")).items.find(item => item.id === first.threadId)?.answerCount).toBe(3);
  await service.deleteMessage("bob", answer.messageId);
  await expect(service.deleteMessage("bob", answer.messageId)).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  expect((await service.listThreads("bob", "channel-a")).items.find(item => item.id === first.threadId)?.answerCount).toBe(2);
  await service.deleteMessage("admin", ai.messageId);
  await service.deleteMessage("bob", reply.messageId);
  expect((await service.listThreads("bob", "channel-a")).items.find(item => item.id === first.threadId)?.answerCount).toBe(1);
  expect(await db.select().from(schema.gamificationEventOutbox).where(eq(schema.gamificationEventOutbox.evidenceId, first.threadId))).toHaveLength(2);
 });

 test("immutable submissions replay after author and admin edits and soft deletion", async () => {
  for (const id of ["replay-author", "replay-responder"]) {
   await db.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role: "student" });
   await db.insert(schema.pengguna).values({ id, status: "active" });
   await db.insert(schema.penggunaPeran).values({ id: `membership-${id}`, penggunaId: id, peranId: "r-student", source: "test" });
  }
  const input = { ...submit("replay-question", "Original question"), channelId: "global", title: "Original title",
   mentionIds: ["replay-responder"], askZyra: true };
  const question = await service.createThread("replay-author", input);
  const [stored] = await db.select().from(schema.discussionMessages).where(eq(schema.discussionMessages.id, question.messageId));
  expect(stored.submissionFingerprint).toMatch(/^[0-9a-f]{64}$/);
  expect(stored.submissionFingerprint).not.toContain(input.body);
  await service.edit("replay-author", question.messageId, "Author edit", 1);
  await service.edit("admin", question.messageId, "Admin edit", 2);
  const answerInput = { ...submit("replay-answer", "Original answer"), threadId: question.threadId, messageType: "answer",
   mentionIds: ["replay-author"], askZyra: true };
  const answer = await service.reply("replay-responder", answerInput);
  const replyInput = { ...submit("replay-reply", "Original reply"), threadId: question.threadId, messageType: "reply", replyTo: answer.messageId };
  const reply = await service.reply("replay-responder", replyInput);
  await service.edit("admin", answer.messageId, "Admin answer edit", 1);
  await service.deleteMessage("replay-responder", answer.messageId);
  await service.deleteMessage("replay-responder", reply.messageId);
  await service.deleteMessage("replay-author", question.messageId);
  const eventsBefore = await db.select().from(schema.discussionEvents).where(eq(schema.discussionEvents.threadId, question.threadId));
  expect(await service.createThread("replay-author", input)).toEqual(question);
  expect(await service.reply("replay-responder", answerInput)).toEqual(answer);
  expect(await service.reply("replay-responder", replyInput)).toEqual(reply);
  for (const change of [{ title: "Changed" }, { body: "Changed" }, { mentionIds: [] }, { askZyra: false },
   { attachmentIds: ["other-image"] }, { skinId: "other-skin" }]) {
   await expect(service.createThread("replay-author", { ...input, ...change })).rejects.toThrow("DISCUSSION_CONFLICT");
  }
  await expect(service.reply("replay-responder", { ...answerInput, body: "Changed" })).rejects.toThrow("DISCUSSION_CONFLICT");
  await expect(service.reply("replay-responder", { ...replyInput, replyTo: question.messageId })).rejects.toThrow("DISCUSSION_CONFLICT");
  expect(await db.select().from(schema.discussionEvents).where(eq(schema.discussionEvents.threadId, question.threadId))).toHaveLength(eventsBefore.length);
  const rewards = await db.select().from(schema.gamificationEventOutbox).where(eq(schema.gamificationEventOutbox.evidenceId, question.threadId));
  expect(rewards.map(row => row.source).sort()).toEqual(["discussion_answer", "discussion_question"]);
  const requests = await db.select().from(schema.discussionAiRequests).where(inArray(schema.discussionAiRequests.messageId, [question.messageId, answer.messageId]));
  expect(requests.map(row => [row.messageId, row.kind]).sort()).toEqual([
   [answer.messageId, "zyra"], [question.messageId, "label"], [question.messageId, "zyra"],
  ].sort());
 });

 test("forward replay rechecks its source and legacy submissions need manual reconciliation", async () => {
  for (const id of ["replay-source", "replay-forwarder"]) {
   await db.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role: "student" });
   await db.insert(schema.pengguna).values({ id, status: "active" });
   await db.insert(schema.penggunaPeran).values({ id: `membership-${id}`, penggunaId: id, peranId: "r-student", source: "test" });
  }
  const sourceInput = { ...submit("replay-source-request"), channelId: "global", title: "Source" };
  const source = await service.createThread("replay-source", sourceInput);
  const destination = await service.createThread("replay-source", { ...submit("replay-destination"), channelId: "global", title: "Destination" });
  const forwarded = await service.forward("replay-forwarder", source.messageId, destination.threadId, "replay-forward");
  await service.deleteMessage("replay-forwarder", forwarded.messageId);
  expect(await service.forward("replay-forwarder", source.messageId, destination.threadId, "replay-forward")).toEqual(forwarded);
  await expect(service.forward("replay-forwarder", destination.messageId, destination.threadId, "replay-forward")).rejects.toThrow("DISCUSSION_CONFLICT");
  await expect(service.forward("replay-forwarder", source.messageId, source.threadId, "replay-forward")).rejects.toThrow("DISCUSSION_CONFLICT");
  await db.update(schema.discussionMessages).set({ submissionFingerprint: null }).where(eq(schema.discussionMessages.id, source.messageId));
  for (const body of [sourceInput.body, "Changed"]) {
   await expect(service.createThread("replay-source", { ...sourceInput, body })).rejects.toMatchObject({
    message: "DISCUSSION_REPLAY_UNVERIFIED", threadId: source.threadId, messageId: source.messageId,
   });
  }
  await service.deleteMessage("replay-source", source.messageId);
  await expect(service.forward("replay-forwarder", source.messageId, destination.threadId, "replay-forward")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
 });

 test("event mention snapshots survive edits and deletion and include empty message snapshots", async () => {
  const question = await service.createThread("alice", { ...submit("event-question"), channelId: "global", title: "Snapshot", mentionIds: ["bob"] });
  await service.edit("alice", question.messageId, "Updated", 1);
  const answer = await service.reply("bob", { ...submit("event-answer"), threadId: question.threadId, messageType: "answer", mentionIds: ["alice"] });
  const forwarded = await service.forward("alice", question.messageId, question.threadId, "event-forward");
  await service.deleteMessage("bob", answer.messageId);
  const events = await db.select().from(schema.discussionEvents).where(eq(schema.discussionEvents.threadId, question.threadId));
  const snapshot = (kind, messageId) => JSON.parse(events.find(item => item.kind === kind && item.messageId === messageId).recipientCursor);
  expect(snapshot("question", question.messageId)).toEqual({ phase: "direct", after: null, mentions: ["bob"] });
  expect(snapshot("edit", question.messageId)).toEqual({ phase: "direct", after: null, mentions: ["bob"] });
  expect(snapshot("message", answer.messageId)).toEqual({ phase: "direct", after: null, mentions: ["alice"] });
  expect(snapshot("message", forwarded.messageId)).toEqual({ phase: "direct", after: null, mentions: [] });
  const eventFor = (kind, messageId) => events.find(item => item.kind === kind && item.messageId === messageId);
  expect([
   eventFor("question", question.messageId), eventFor("edit", question.messageId),
   eventFor("message", answer.messageId), eventFor("message", forwarded.messageId), eventFor("delete", answer.messageId),
  ].map(item => [item.kind, item.messageRevision, item.participantThroughSeq])).toEqual([
   ["question", 1, 1], ["edit", 2, 1], ["message", 1, 2], ["message", 1, 3], ["delete", 2, 3],
  ]);
  const participants = await db.select().from(schema.discussionThreadParticipants)
   .where(eq(schema.discussionThreadParticipants.threadId, question.threadId));
  expect(participants.map(item => [item.userId, item.firstSeq, item.earliestCreatedSeq]).sort())
   .toEqual([["alice", 1, 1], ["bob", 2, 2]]);
 });

 test("reports are private, rate limited, and require an active administrator decision", async () => {
  const first = await service.createThread("alice", { ...submit("report-q"), channelId: "channel-a", title: "Laporan" });
  const report = await service.report("bob", first.messageId, "Tinjau isi");
  expect(await service.report("bob", first.messageId, "Tinjau isi")).toEqual(report);
  await expect(service.listReports("bob")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  expect((await service.listReports("admin")).items.find(item => item.id === report.id)).toMatchObject({ threadTitle: "Laporan",
   message: { body: "Pertanyaan", seq: 1, deleted: false, authorName: "alice" } });
  for (let i = 0; i < 8; i++) await service.report("bob", first.messageId, "Tinjau isi");
  await expect(service.report("bob", first.messageId, "Tinjau isi")).rejects.toThrow("DISCUSSION_RATE_LIMITED");
  await service.deleteMessage("alice", first.messageId);
  expect((await service.listReports("admin")).items.find(item => item.id === report.id)?.message)
   .toEqual({ body: "Pesan dihapus.", seq: 1, deleted: true, authorName: "Pesan dihapus", bodyKind: "deleted", authorKind: "deleted" });
  expect(await service.resolveReport("admin", report.id, "dismissed")).toEqual({ status: "dismissed" });
 });

 test("report visibility is applied before the page limit", async () => {
  await db.insert(schema.courses).values({ id: "report-filter-legacy", title: "Archived", category: "Matematika" });
  await db.insert(schema.mataKuliah).values({ id: "report-filter-course", code: "REPORT-FILTER", title: "Archived", legacyCourseId: "report-filter-legacy", status: "archived" });
  await db.insert(schema.discussionChannels).values({ id: "report-filter-channel", kind: "course", title: "Archived", courseId: "report-filter-course", legacyCourseId: "report-filter-legacy" });
  await db.insert(schema.discussionThreads).values([
   { id: "report-filter-hidden", channelId: "report-filter-channel", authorId: "alice", title: "Hidden", nextSeq: 31 },
   { id: "report-filter-visible", channelId: "global", authorId: "alice", title: "Visible", nextSeq: 2 },
  ]);
  const hidden = Array.from({ length: 30 }, (_, index) => ({ id: `report-filter-message-${index}`, threadId: "report-filter-hidden", seq: index + 1, authorId: "alice", kind: "human", messageType: "answer", body: "Hidden", requestId: `report-filter-request-${index}` }));
  await db.insert(schema.discussionMessages).values([...hidden, { id: "report-filter-message-visible", threadId: "report-filter-visible", seq: 1, authorId: "alice", kind: "human", messageType: "question", body: "Visible", requestId: "report-filter-request-visible" }]);
  await recordSeedParticipants(["report-filter-hidden", "report-filter-visible"]);
  await db.insert(schema.discussionReports).values([
   ...hidden.map((message, index) => ({ id: `report-filter-${index}`, messageId: message.id, reporterId: "bob", reason: "Review", createdAt: new Date("2101-01-01") })),
   { id: "report-filter-visible", messageId: "report-filter-message-visible", reporterId: "bob", reason: "Review", createdAt: new Date("2100-01-01") },
  ]);
  const page = await service.listReports("admin");
  expect(page.items[0].id).toBe("report-filter-visible");
  expect(page.items.some(item => item.threadId === "report-filter-hidden")).toBe(false);
 });

 test("revision, server deadline, soft deletion, read position, and forwarding boundaries", async () => {
  const first = await service.createThread("alice", { ...submit("edit-q"), channelId: "channel-a", title: "Edit" });
  expect(await service.edit("alice", first.messageId, "Baru", 1)).toEqual({ revision: 2 });
  await expect(service.edit("alice", first.messageId, "Lama", 1)).rejects.toThrow("DISCUSSION_CONFLICT");
  await db.update(schema.discussionMessages).set({ createdAt: new Date("2000-01-01") }).where(eq(schema.discussionMessages.id, first.messageId));
  await expect(service.edit("alice", first.messageId, "Terlambat", 2)).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  expect(await service.edit("admin", first.messageId, "Admin", 2)).toEqual({ revision: 3 });
  const other = await service.createThread("alice", { ...submit("global-q"), channelId: "global", title: "Umum" });
  await expect(service.forward("alice", first.messageId, other.threadId, "forbidden-forward")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  const forwarded = await service.forward("alice", other.messageId, first.threadId, "allowed-forward");
  await expect(service.markRead("bob", first.threadId, 2, "invalid", [])).rejects.toThrow("DISCUSSION_INVALID");
  const observed = await service.getThread("bob", first.threadId);
  await expect(service.markRead("alice", first.threadId, 2, observed.messages.observationReceipt, [first.messageId])).rejects.toThrow("DISCUSSION_INVALID");
  await expect(service.markRead("bob", other.threadId, 2, observed.messages.observationReceipt, [first.messageId])).rejects.toThrow("DISCUSSION_INVALID");
  await expect(service.markRead("bob", first.threadId, 2, `${observed.messages.observationReceipt}x`, [first.messageId])).rejects.toThrow("DISCUSSION_INVALID");
  expect((await service.markRead("bob", first.threadId, 2, observed.messages.observationReceipt, [first.messageId, forwarded.messageId])).throughSeq).toBe(2);
  expect((await service.markRead("bob", first.threadId, 1, observed.messages.observationReceipt, [first.messageId])).throughSeq).toBe(2);
  await expect(service.markRead("bob", first.threadId, 999, observed.messages.observationReceipt, [])).rejects.toThrow("DISCUSSION_INVALID");
  await service.deleteMessage("alice", first.messageId);
  const view = await service.getThread("bob", first.threadId);
  expect(view.messages.items[0].body).toBe("Pesan dihapus.");
  expect(view.messages.items[0]).toMatchObject({ canReply: false, canForward: false, canReact: false });
  expect(view.messages.items.find(item => item.id === forwarded.messageId)).toMatchObject({ canReply: true, canForward: false, canReact: true });
  await service.setReaction("bob", forwarded.messageId, policy.DISCUSSION_REACTIONS[0], true);
  await service.setResolved("alice", first.threadId, true);
  expect((await service.getThread("bob", first.threadId)).messages.items.find(item => item.id === forwarded.messageId))
   .toMatchObject({ canReply: false, canForward: false, canReact: true });
  const events = await db.select().from(schema.discussionEvents).where(eq(schema.discussionEvents.threadId, first.threadId));
  expect(events.find(item => item.kind === "delete")).toMatchObject({ messageRevision: 4, participantThroughSeq: 2 });
  expect(events.find(item => item.kind === "resolved")).toMatchObject({ statusRevision: 1, participantThroughSeq: 2 });
  const reward = await db.select().from(schema.gamificationEventOutbox).where(and(eq(schema.gamificationEventOutbox.sourceId, first.messageId), eq(schema.gamificationEventOutbox.source, "discussion_question")));
  expect(reward).toHaveLength(1);
 });

 test("count cache survives body edits and unrelated reads but tracks scoped watermarks", async () => {
  await db.insert(schema.user).values({ id: "count-viewer", name: "Count viewer", email: "count-viewer@example.test", role: "student" });
  await db.insert(schema.pengguna).values({ id: "count-viewer" });
  await db.insert(schema.penggunaPeran).values({ id: "count-viewer-role", penggunaId: "count-viewer", peranId: "r-student", source: "test" });
  await db.insert(schema.enrollments).values([
   { id: "count-viewer-a", userId: "count-viewer", courseId: "legacy-a", expiresAt: new Date("2099-01-01") },
   { id: "count-viewer-b", userId: "count-viewer", courseId: "legacy-b", expiresAt: new Date("2099-01-01") },
  ]);
  const course = await service.createThread("alice", { ...submit("count-revision-course"), channelId: "channel-a", title: "Counts" });
  const answer = await service.reply("admin", { ...submit("count-revision-answer"), threadId: course.threadId, messageType: "answer" });
  const otherCourse = await service.createThread("admin", { ...submit("count-revision-other-course"), channelId: "channel-b", title: "Other counts" });
  await service.setMute("count-viewer", "channel-b", true);
  const revision = async channelId => (await db.select({ value: schema.discussionChannelPreferences.readRevision })
   .from(schema.discussionChannelPreferences).where(and(eq(schema.discussionChannelPreferences.userId, "count-viewer"),
    eq(schema.discussionChannelPreferences.channelId, channelId))))[0]?.value ?? 0n;
  const original = client.query, statements = [];
  client.query = function (...args) {
   const query = String(args[0]);
   statements.push(query);
   return original.apply(this, args);
  };
  const aggregates = () => statements.filter(query => /filter \(where/i.test(query) && /discussion_threads/i.test(query)).length;
  try {
   const before = await service.getDiscussionCounts("count-viewer", { courseId: "legacy-a" });
   statements.length = 0;
   const [channelBefore] = await db.select({ value: schema.discussionChannels.countRevision }).from(schema.discussionChannels).where(eq(schema.discussionChannels.id, "channel-a"));
   await service.edit("alice", course.messageId, "Edited text", 1);
   const [channelAfter] = await db.select({ value: schema.discussionChannels.countRevision }).from(schema.discussionChannels).where(eq(schema.discussionChannels.id, "channel-a"));
   expect(channelAfter.value).toBe(channelBefore.value);
   expect(await service.getDiscussionCounts("count-viewer", { courseId: "legacy-a" })).toEqual(before);
   expect(aggregates()).toBe(0);

   const otherRevision = await revision("channel-b");
   const otherView = await service.getThread("count-viewer", otherCourse.threadId);
   expect(await revision("channel-b")).toBe(otherRevision);
   await client.exec(`create function fixture_clear_failure() returns trigger language plpgsql as $$ begin raise exception 'fixture clear failure'; end $$;
    create trigger fixture_clear_failure before update on notifications for each statement execute function fixture_clear_failure();`);
   try {
    await expect(service.markRead("count-viewer", otherCourse.threadId, 1, otherView.messages.observationReceipt, [otherCourse.messageId])).rejects.toThrow();
   } finally { await client.exec('drop trigger fixture_clear_failure on notifications; drop function fixture_clear_failure();'); }
   expect(await revision("channel-b")).toBe(otherRevision);
   const [rolledBack] = await db.select({ throughSeq: schema.discussionThreadReads.throughSeq }).from(schema.discussionThreadReads).where(and(
    eq(schema.discussionThreadReads.userId, "count-viewer"), eq(schema.discussionThreadReads.threadId, otherCourse.threadId)));
   expect(rolledBack.throughSeq).toBe(0);
   await service.markRead("count-viewer", otherCourse.threadId, 1, otherView.messages.observationReceipt, [otherCourse.messageId]);
   expect(await revision("channel-b")).toBe(otherRevision + 1n);
   await service.markRead("count-viewer", otherCourse.threadId, 1, otherView.messages.observationReceipt, [otherCourse.messageId]);
   expect(await revision("channel-b")).toBe(otherRevision + 1n);
   const [preference] = await db.select().from(schema.discussionChannelPreferences).where(and(
    eq(schema.discussionChannelPreferences.userId, "count-viewer"), eq(schema.discussionChannelPreferences.channelId, "channel-b")));
   expect(preference.muted).toBe(true);
   expect(await service.getDiscussionCounts("count-viewer", { courseId: "legacy-a" })).toEqual(before);
   expect(aggregates()).toBe(0);

   const courseRevision = await revision("channel-a");
   const courseView = await service.getThread("count-viewer", course.threadId);
   expect(await revision("channel-a")).toBe(courseRevision);
   await service.markRead("count-viewer", course.threadId, 1, courseView.messages.observationReceipt, [course.messageId]);
   expect(await revision("channel-a")).toBe(courseRevision);
   expect(await service.getDiscussionCounts("count-viewer", { courseId: "legacy-a" })).toEqual(before);
   expect(aggregates()).toBe(0);
   await service.markRead("count-viewer", course.threadId, 2, courseView.messages.observationReceipt, [answer.messageId]);
   expect(await revision("channel-a")).toBe(courseRevision + 1n);
   const after = await service.getDiscussionCounts("count-viewer", { courseId: "legacy-a" });
   expect(after.course.unreadThreads).toBe(before.course.unreadThreads - 1);
   expect(aggregates()).toBe(1);
  } finally { client.query = original; }
 });

 test("forward and edit policies retain their exact boundaries", () => {
  const privateChannel = { id: "private", kind: "technical", courseId: null, legacyCourseId: null };
  const global = { id: "global", kind: "global", courseId: null, legacyCourseId: null };
  const course = { id: "course", kind: "course", courseId: "a", legacyCourseId: "old-a" };
  expect(policy.canForwardDiscussion(privateChannel, privateChannel)).toBe(true);
  expect(policy.canForwardDiscussion(privateChannel, global)).toBe(false);
  expect(policy.canForwardDiscussion(global, course)).toBe(true);
  expect(policy.canForwardDiscussion(course, global)).toBe(false);
  const createdAt = new Date("2026-01-01T00:00:00Z");
  const message = { authorId: "alice", kind: "human", createdAt, deletedAt: null };
  expect(policy.canEditDiscussionMessage({ id: "alice", role: "student" }, message, new Date(createdAt.getTime() + 299999))).toBe(true);
  expect(policy.canEditDiscussionMessage({ id: "alice", role: "student" }, message, new Date(createdAt.getTime() + 300000))).toBe(false);
 });

 test("legacy course and team channels grow canonical aliases without changing thread identities", async () => {
  await db.insert(schema.courses).values({ id: "legacy-growth", title: "Growth", category: "Matematika" });
  await db.insert(schema.enrollments).values({ id: "growth-enrollment", userId: "alice", courseId: "legacy-growth", expiresAt: new Date("2099-01-01") });
  await db.insert(schema.discussionChannels).values([
   { id: "growth-course", kind: "course", title: "Growth", legacyCourseId: "legacy-growth" },
   { id: "growth-team", kind: "academic", title: "Akademik", requesterId: "alice", legacyCourseId: "legacy-growth" },
  ]);
  await db.insert(schema.discussionThreads).values({ id: "growth-thread", channelId: "growth-course", authorId: "alice", title: "Preserved" });
  await db.insert(schema.mataKuliah).values({ id: "canonical-growth", code: "GROWTH", title: "Growth", legacyCourseId: "legacy-growth" });
  await expect(access.requireDiscussionChannelAccess(await access.getDiscussionActor("alice"), "growth-course")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  const team = await service.ensureDiscussionTeamChannel("alice", "academic", "legacy-growth");
  expect(team.id).toBe("growth-team");
  const channels = await service.listChannels("alice");
  expect(channels.some(row => row.id === "growth-course" && row.courseId === "canonical-growth")).toBe(true);
  expect((await db.select().from(schema.discussionThreads).where(eq(schema.discussionThreads.id, "growth-thread")))[0].channelId).toBe("growth-course");
  await db.insert(schema.mataKuliah).values({ id: "growth-ambiguous", code: "GROWTH2", title: "Other", legacyCourseId: "legacy-growth" });
  expect((await access.getAccessibleDiscussionChannels("alice")).some(row => row.id === "growth-course")).toBe(false);
  await db.delete(schema.mataKuliah).where(eq(schema.mataKuliah.id, "growth-ambiguous"));
 });

 test("conflicting canonical and legacy channel rows stay unavailable without merging histories", async () => {
  await db.insert(schema.courses).values({ id: "legacy-conflict", title: "Conflict", category: "Matematika" });
  await db.insert(schema.mataKuliah).values({ id: "canonical-conflict", code: "CONFLICT", title: "Conflict", legacyCourseId: "legacy-conflict" });
  await db.insert(schema.enrollments).values({ id: "conflict-enrollment", userId: "alice", courseId: "legacy-conflict", expiresAt: new Date("2099-01-01") });
  await db.insert(schema.discussionChannels).values([
   { id: "conflict-canonical", kind: "course", title: "Conflict", courseId: "canonical-conflict" },
   { id: "conflict-legacy", kind: "course", title: "Conflict", legacyCourseId: "legacy-conflict" },
  ]);
  const channels = await service.listChannels("alice");
  expect(channels.some(row => row.id === "conflict-canonical" || row.id === "conflict-legacy")).toBe(false);
  const [legacy] = await db.select().from(schema.discussionChannels).where(eq(schema.discussionChannels.id, "conflict-legacy"));
  expect(legacy.courseId).toBeNull();
 });

 test("initial catalog repairs a newly linked legacy alias for an existing canonical channel", async () => {
  await db.insert(schema.mataKuliah).values({ id: "canonical-link-growth", code: "LINKGROWTH", title: "Link growth", pricingCategory: "free" });
  await db.insert(schema.discussionChannels).values({ id: "canonical-link-channel", kind: "course", title: "Link growth", courseId: "canonical-link-growth" });
  await db.insert(schema.courses).values({ id: "legacy-link-growth", title: "Link growth", category: "Matematika" });
  await db.update(schema.mataKuliah).set({ legacyCourseId: "legacy-link-growth" }).where(eq(schema.mataKuliah.id, "canonical-link-growth"));
  expect((await service.listChannels("alice")).some(channel => channel.id === "canonical-link-channel")).toBe(true);
  const channel = await access.requireDiscussionChannelAccess(await access.getDiscussionActor("alice"), "canonical-link-channel");
  expect(channel).toMatchObject({ courseId: "canonical-link-growth", legacyCourseId: "legacy-link-growth" });
 });

 test("course resolution cannot restore revoked canonical roles or expose discussions", async () => {
  const { resolveCourseAccess } = require("../../lib/student/course-access.ts");
  for (const [role, code] of [["admin", "admin"], ["teacher", "tutor"], ["student", "student"]]) {
   const id = `revoked-legacy-${code}`;
   await db.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role });
   await db.insert(schema.pengguna).values({ id, status: "active" });
   await db.insert(schema.penggunaPeran).values({ id: `${id}-membership`, penggunaId: id, peranId: `r-${code}`, source: "test" });
   await db.delete(schema.penggunaPeran).where(eq(schema.penggunaPeran.penggunaId, id));
   const result = await resolveCourseAccess({ userId: id, courseId: "course-a" }, db);
   expect(result.roles).toEqual([]);
   expect(result.hasFullContentAccess).toBe(false);
   await expect(access.getDiscussionActor(id)).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  }
  for (const [role, code] of [["admin", "admin"], ["teacher", "tutor"], ["student", "student"]]) {
   const id = `fresh-course-${code}`;
   await db.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role });
   await resolveCourseAccess({ userId: id, courseId: "course-a" }, db);
   expect((await access.getDiscussionActor(id)).role).toBe(code);
  }
 });

 test("only authenticated legacy identities are provisioned and canonical roles and suspension win", async () => {
  await db.insert(schema.user).values({ id: "old-teacher", name: "Old teacher", email: "old-teacher@example.test", role: "teacher" });
  await expect(access.getDiscussionActor("old-teacher")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  sessionUserId = "old-teacher";
  expect(await session.getSessionDiscussionActor()).toEqual({ id: "old-teacher", role: "tutor" });
  await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, "old-teacher"));
  expect(await session.getSessionDiscussionActor()).toEqual({ id: "old-teacher", role: "tutor" });
  await db.delete(schema.penggunaPeran).where(eq(schema.penggunaPeran.penggunaId, "old-teacher"));
  await expect(session.getSessionDiscussionActor()).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await db.update(schema.pengguna).set({ status: "suspended" }).where(eq(schema.pengguna.id, "old-teacher"));
  await expect(session.getSessionDiscussionActor()).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(access.getDiscussionActor("old-teacher")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  sessionUserId = null;
  await expect(session.getSessionDiscussionActor()).rejects.toThrow("DISCUSSION_UNAVAILABLE");
 });

 test("legacy-only course channels are provisioned in their bounded course context", async () => {
  await db.insert(schema.courses).values({ id: "legacy-only-page", title: "Legacy only", category: "Matematika" });
  await db.insert(schema.enrollments).values({ id: "legacy-only-enrollment", userId: "alice", courseId: "legacy-only-page", expiresAt: new Date("2099-01-01") });
  const page = await service.listChannelsPage("alice", { courseId: "legacy-only-page", kind: "course" });
  expect(page.items).toHaveLength(1);
  expect(page.items[0].courseId).toBe("legacy-only-page");
  expect((await access.requireDiscussionChannelAccess(await access.getDiscussionActor("alice"), page.items[0].id)).legacyCourseId).toBe("legacy-only-page");
 });

 test("searched pages repair unambiguous legacy channel aliases without changing their identity", async () => {
  await db.insert(schema.courses).values({ id: "legacy-search-growth", title: "Search growth", category: "Matematika" });
  await db.insert(schema.enrollments).values({ id: "search-growth-enrollment", userId: "alice", courseId: "legacy-search-growth", expiresAt: new Date("2099-01-01") });
  await db.insert(schema.discussionChannels).values({ id: "search-growth-channel", kind: "course", title: "Search growth", legacyCourseId: "legacy-search-growth" });
  await db.insert(schema.mataKuliah).values({ id: "canonical-search-growth", code: "SEARCHGROWTH", title: "Search growth", legacyCourseId: "legacy-search-growth" });
  const page = await service.listChannelsPage("alice", { search: "Search growth", kinds: ["course"] });
  expect(page.items.map(row => row.id)).toEqual(["search-growth-channel"]);
  expect(page.items[0].courseId).toBe("canonical-search-growth");
  expect((await access.requireDiscussionChannelAccess(await access.getDiscussionActor("alice"), "search-growth-channel")).courseId).toBe("canonical-search-growth");
 });

 test("course entitlement batch matches direct access for canonical role precedence and revoked tutor assignments", async () => {
  await db.insert(schema.penggunaPeran).values({ id: "bob-tutor", penggunaId: "bob", peranId: "r-tutor", source: "test" });
  let actor = await access.getDiscussionActor("bob");
  expect(actor.role).toBe("tutor");
  expect((await access.resolveDiscussionCourses(actor, ["course-a", "legacy-a"])).get("course-a")?.hasFullContentAccess).toBe(false);
  await expect(access.requireDiscussionChannelAccess(actor, "channel-a")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await db.insert(schema.tutorCourses).values({ id: "bob-legacy-assignment", tutorId: "bob", courseId: "legacy-a" });
  await db.insert(schema.penugasanTutor).values({ id: "bob-revoked-assignment", penggunaId: "bob", mataKuliahId: "course-a", status: "revoked", assignmentScope: "course" });
  expect((await access.resolveDiscussionCourses(actor, ["course-a", "legacy-a"])).get("legacy-a")?.hasFullContentAccess).toBe(false);
  await expect(access.requireDiscussionChannelAccess(actor, "channel-a")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await db.insert(schema.penggunaPeran).values({ id: "bob-admin", penggunaId: "bob", peranId: "r-admin", source: "test" });
  actor = await access.getDiscussionActor("bob");
  expect(actor.role).toBe("admin");
  expect((await access.resolveDiscussionCourses(actor, ["course-a", "legacy-a"])).get("legacy-a")?.hasFullContentAccess).toBe(true);
  await expect(access.requireDiscussionChannelAccess(actor, "channel-a")).resolves.toBeDefined();
  await db.delete(schema.penggunaPeran).where(eq(schema.penggunaPeran.id, "bob-admin"));
  await db.delete(schema.penggunaPeran).where(eq(schema.penggunaPeran.id, "bob-tutor"));
 });

 test("PKA flag and existing registration gate apply to lists, direct access, and mentions", async () => {
  const previous = process.env.FEATURE_PKA;
  try {
   await db.insert(schema.courses).values({ id: "tutorial-pka", title: "Tutorial PKA", category: "Matematika" });
   await db.insert(schema.mataKuliah).values({ id: "canonical-pka", code: "PKA", title: "Tutorial PKA", legacyCourseId: "tutorial-pka", pricingCategory: "free" });
   await db.insert(schema.discussionChannels).values({ id: "pka-channel", kind: "course", title: "Tutorial PKA", courseId: "canonical-pka", legacyCourseId: "tutorial-pka" });
   const alice = await access.getDiscussionActor("alice"), bob = await access.getDiscussionActor("bob"), admin = await access.getDiscussionActor("admin");
   process.env.FEATURE_PKA = "0";
   await db.insert(schema.enrollments).values({ id: "alice-pka", userId: "alice", courseId: "tutorial-pka", expiresAt: new Date("2099-01-01") });
   await expect(access.requireDiscussionChannelAccess(alice, "pka-channel")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
   expect(await access.getAccessibleDiscussionChannels("alice", { channelIds: ["pka-channel"] })).toEqual([]);
   expect(await db.select({ id: schema.discussionChannels.id }).from(schema.discussionChannels)
    .where((await access.getDiscussionChannelVisibility("alice")).predicate)).not.toContainEqual({ id: "pka-channel" });
   process.env.FEATURE_PKA = "1";
   await expect(access.requireDiscussionChannelAccess(alice, "pka-channel")).resolves.toBeDefined();
   await expect(access.requireDiscussionChannelAccess(bob, "pka-channel")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
   await expect(access.requireDiscussionChannelAccess(admin, "pka-channel")).resolves.toBeDefined();
   const tutor = await access.getDiscussionActor("tutor");
   await expect(access.requireDiscussionChannelAccess(tutor, "pka-channel")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
   await db.insert(schema.penugasanTutor).values({ id: "pka-assignment", penggunaId: "tutor", mataKuliahId: "canonical-pka", status: "active", assignmentScope: "course" });
   await expect(access.requireDiscussionChannelAccess(tutor, "pka-channel")).resolves.toBeDefined();
   await db.update(schema.penugasanTutor).set({ status: "revoked" }).where(eq(schema.penugasanTutor.id, "pka-assignment"));
   await expect(access.requireDiscussionChannelAccess(tutor, "pka-channel")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
   expect((await service.listChannelsPage("bob", { search: "Tutorial PKA" })).items).toEqual([]);
   expect((await service.listChannelsPage("alice", { search: "Tutorial PKA" })).items.map(row => row.id)).toEqual(["pka-channel"]);
   expect(await db.select({ id: schema.discussionChannels.id }).from(schema.discussionChannels)
    .where((await access.getDiscussionChannelVisibility("alice")).predicate)).toContainEqual({ id: "pka-channel" });
   expect(await service.searchChannelMentions("alice", "pka-channel", "bo")).toEqual([]);
   await db.insert(schema.enrollments).values({ id: "bob-pka", userId: "bob", courseId: "tutorial-pka", expiresAt: new Date("2099-01-01") });
   expect(await service.searchChannelMentions("alice", "pka-channel", "bo")).toEqual([{ id: "bob", name: "bob", role: "student" }]);
   await db.delete(schema.enrollments).where(eq(schema.enrollments.id, "bob-pka"));
   await expect(access.requireDiscussionChannelAccess(bob, "pka-channel")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  } finally {
   if (previous === undefined) delete process.env.FEATURE_PKA; else process.env.FEATURE_PKA = previous;
  }
 });

 test("aggregate visibility matches bounded channel authorization for each role and after revocation", async () => {
  for (const actorId of ["alice", "bob", "tutor", "admin"]) {
   const allowed = (await access.getAccessibleDiscussionChannels(actorId)).map(row => row.id).sort();
   const visible = await db.select({ id: schema.discussionChannels.id }).from(schema.discussionChannels)
    .where((await access.getDiscussionChannelVisibility(actorId)).predicate);
   expect(visible.map(row => row.id).sort()).toEqual(allowed);
  }
  await db.update(schema.penugasanTutor).set({ status: "revoked" }).where(eq(schema.penugasanTutor.id, "assignment"));
  try {
   const allowed = (await access.getAccessibleDiscussionChannels("tutor")).map(row => row.id).sort();
   const visible = await db.select({ id: schema.discussionChannels.id }).from(schema.discussionChannels)
    .where((await access.getDiscussionChannelVisibility("tutor")).predicate);
   expect(visible.map(row => row.id).sort()).toEqual(allowed);
   expect(allowed).not.toContain("private-academic");
  } finally { await db.update(schema.penugasanTutor).set({ status: "active" }).where(eq(schema.penugasanTutor.id, "assignment")); }
 });

 test("filtered channel pages limit candidate rows before authorization without catalog provisioning or chapter reads", async () => {
  await db.insert(schema.user).values(Array.from({ length: 80 }, (_, index) => ({
   id: `picker-requester-${index}`, name: `Requester ${index}`, email: `picker-${index}@example.test`,
  })));
  await db.insert(schema.courses).values([
   { id: "legacy-picker-a", title: "Picker A", category: "Matematika" },
   { id: "legacy-picker-b", title: "Picker B", category: "Matematika" },
  ]);
  await db.insert(schema.discussionChannels).values([
   { id: "picker-a", kind: "course", title: "Picker A", legacyCourseId: "legacy-picker-a" },
   { id: "picker-b", kind: "course", title: "Picker B", legacyCourseId: "legacy-picker-b" },
   ...Array.from({ length: 80 }, (_, index) => ({ id: `picker-private-${index}`, kind: "academic", title: `Picker private ${index}`, requesterId: `picker-requester-${index}` })),
  ]);
  const original = client.query;
  const reads = [];
  client.query = function (...args) {
   return original.apply(this, args).then(result => {
    reads.push({ sql: String(args[0]), rows: result.rows.length });
    return result;
   });
  };
  try {
   const first = await service.listChannelsPage("admin", { search: "Picker", kinds: ["global", "course"], limit: 1 });
   expect(first.items.map(row => row.id)).toEqual(["picker-a"]);
   expect(first.nextCursor).not.toBeNull();
   const second = await service.listChannelsPage("admin", { search: "Picker", kinds: ["global", "course"], cursor: first.nextCursor, limit: 1 });
   expect(second.items.map(row => row.id)).toEqual(["picker-b"]);
   expect(second.nextCursor).toBeNull();
   const candidates = reads.filter(read => /from "discussion_channels"/i.test(read.sql) && /order by/i.test(read.sql) && /limit/i.test(read.sql));
   expect(candidates.length).toBeGreaterThan(0);
   expect(candidates.reduce((count, read) => count + read.rows, 0)).toBeLessThanOrEqual(3);
   expect(reads.some(read => /\b(insert|update)\b/i.test(read.sql))).toBe(false);
   expect(reads.some(read => /from "(bab|chapters)"/i.test(read.sql))).toBe(false);
   await expect(service.listChannelsPage("admin", { kinds: ["course", "course"] })).rejects.toThrow("DISCUSSION_INVALID");
   await expect(service.listChannelsPage("admin", { kinds: ["wrong"] })).rejects.toThrow("DISCUSSION_INVALID");
  } finally { client.query = original; }
 });

 test("explicit help kind survives classification and remains restricted to its team", async () => {
  const input = { ...submit("help-feature"), channelId: "private-tech", title: "Feature", helpKind: "feature" };
  const created = await service.createThread("alice", input);
  await db.update(schema.discussionThreads).set({ labels: ["bug"] }).where(eq(schema.discussionThreads.id, created.threadId));
  const view = await service.getThread("alice", created.threadId);
  expect(view.thread.helpKind).toBe("feature");
  expect(view.thread.labels[0]).toBe("feature");
  await expect(service.createThread("alice", { ...input, helpKind: "bug" })).rejects.toThrow("DISCUSSION_CONFLICT");
  await expect(service.createThread("alice", { ...input, requestId: "wrong-team", channelId: "private-academic" })).rejects.toThrow("DISCUSSION_INVALID");
  await expect(service.createThread("alice", { ...input, requestId: "wrong-public", channelId: "global" })).rejects.toThrow("DISCUSSION_INVALID");
 });

 test("message DTOs resolve the author's active canonical role", async () => {
  const question = await service.createThread("alice", { ...submit("role-question"), channelId: "global", title: "Role" });
  await service.reply("tutor", { ...submit("role-answer"), threadId: question.threadId, messageType: "answer" });
  const view = await service.getThread("alice", question.threadId);
  expect(view.messages.items.map(item => item.author?.role)).toEqual(["student", "tutor"]);
 });

 test("reported message lookup is bounded and requires current access to its thread", async () => {
  await db.insert(schema.discussionThreads).values([
   { id: "report-target-thread", channelId: "global", authorId: "alice", title: "Target", nextSeq: 56 },
   { id: "report-target-private", channelId: "private-tech", authorId: "alice", title: "Private target", nextSeq: 2 },
  ]);
  await db.insert(schema.discussionMessages).values([
   ...Array.from({ length: 55 }, (_, index) => ({ id: `reported-${index + 1}`, threadId: "report-target-thread", authorId: "alice", kind: "human",
    messageType: index ? "answer" : "question", body: `Message ${index + 1}`, seq: index + 1, requestId: `reported-${index + 1}` })),
   { id: "private-target-message", threadId: "report-target-private", authorId: "alice", kind: "human", messageType: "question", body: "PRIVATE TARGET", seq: 1, requestId: "private-target-message" },
  ]);
  const first = await service.getThread("bob", "report-target-thread");
  expect(first.messages.items).toHaveLength(30);
  expect(first.messages.items.some(item => item.id === "reported-45")).toBe(false);
  const target = await service.getThread("bob", "report-target-thread", undefined, "reported-45");
  expect(target.messages.items).toHaveLength(11);
  expect(target.messages.items[0]).toMatchObject({ id: "reported-45", seq: 45 });
  expect(target.messages.startCursor).toBeTruthy();
  expect(target.messages.previousCursor).toBeTruthy();
  const previous = await service.getThread("bob", "report-target-thread", target.messages.previousCursor);
  expect(previous.messages.items.map(item => item.seq)).toEqual(Array.from({ length: 30 }, (_, index) => index + 15));
  expect(previous.messages.nextCursor).toBe(target.messages.startCursor);
  expect((await service.getThread("bob", "report-target-thread", target.messages.startCursor)).messages.items.map(item => item.id))
   .toEqual(target.messages.items.map(item => item.id));
  await expect(service.markRead("bob", "report-target-thread", 45, target.messages.observationReceipt, ["reported-45"]))
   .rejects.toThrow("DISCUSSION_INVALID");
  for (const id of ["private-target-message", "missing-target"]) {
   await expect(service.getThread("bob", "report-target-thread", undefined, id)).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  }
  await expect(service.getThread("bob", "report-target-private", undefined, "private-target-message")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(service.getThread("bob", "report-target-thread", first.messages.nextCursor, "reported-45")).rejects.toThrow("DISCUSSION_INVALID");
 });

 test("a targeted message observation clears only its revision without skipping earlier unread events", async () => {
  const threadId = "read-target-thread";
  await db.insert(schema.discussionThreads).values({ id: threadId, channelId: "global", authorId: "alice", title: "Read target", nextSeq: 451, statusRevision: 2 });
  await db.insert(schema.discussionMessages).values(Array.from({ length: 450 }, (_, index) => ({
   id: `read-target-${index + 1}`, threadId, authorId: "alice", kind: "human", messageType: index ? "answer" : "question",
   body: "Message", seq: index + 1, revision: index === 449 ? 2 : 1, requestId: `read-target-request-${index + 1}`,
  })));
  const events = [
   { id: "read-target-early", kind: "edit", messageId: "read-target-1", messageRevision: 1, seq: 1 },
   { id: "read-target-current", kind: "edit", messageId: "read-target-450", messageRevision: 2, seq: 450 },
   { id: "read-target-newer", kind: "edit", messageId: "read-target-450", messageRevision: 3, seq: 450 },
   { id: "read-target-status", kind: "resolved", messageId: null, statusRevision: 2, seq: 450 },
  ];
  await db.insert(schema.discussionEvents).values(events.map(({ seq, ...event }) => ({ ...event, channelId: "global", threadId, actorId: "alice" })));
  await db.insert(schema.notifications).values(events.map(event => ({ id: `inbox-${event.id}`, userId: "bob", type: "discussion", title: "Discussion", body: "Discussion",
   metadata: { threadId, eventId: event.id, eventKind: event.kind, seq: event.seq } })));
  const target = await service.getThread("bob", threadId, undefined, "read-target-450");
  await expect(service.markRead("bob", threadId, 450, target.messages.observationReceipt, ["read-target-450"])).rejects.toThrow("DISCUSSION_INVALID");
  expect((await service.markRead("bob", threadId, 0, target.messages.observationReceipt, ["read-target-450"])).throughSeq).toBe(0);
  const observations = await db.select().from(schema.discussionMessageObservations).where(eq(schema.discussionMessageObservations.userId, "bob"));
  expect(observations.filter(row => row.messageId.startsWith("read-target-")).map(row => [row.messageId, row.revision])).toEqual([["read-target-450", 2]]);
  const inbox = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, "bob"));
  expect(events.map(event => inbox.find(row => row.id === `inbox-${event.id}`).read)).toEqual([false, true, false, false]);
  await db.update(schema.discussionMessages).set({ revision: 3 }).where(eq(schema.discussionMessages.id, "read-target-450"));
  const newer = await service.getThread("bob", threadId, undefined, "read-target-450");
  await service.markRead("bob", threadId, 0, newer.messages.observationReceipt, ["read-target-450"]);
  const after = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, "bob"));
  expect(events.map(event => after.find(row => row.id === `inbox-${event.id}`).read)).toEqual([false, true, true, false]);
 });

 test("deep reported targets expose the immediately preceding bounded page", async () => {
  await db.insert(schema.discussionThreads).values({ id: "deep-report-thread", channelId: "global", authorId: "alice", title: "Deep target", nextSeq: 456 });
  await db.insert(schema.discussionMessages).values(Array.from({ length: 455 }, (_, index) => ({
   id: `deep-reported-${index + 1}`, threadId: "deep-report-thread", authorId: "alice", kind: "human", messageType: index ? "answer" : "question",
   body: "Message", seq: index + 1, requestId: `deep-reported-${index + 1}`,
  })));
  const original = client.query, statements = [];
  client.query = function (...args) { statements.push({ sql: String(args[0]), params: args[1] }); return original.apply(this, args); };
  try {
   const target = await service.getThread("bob", "deep-report-thread", undefined, "deep-reported-450");
   expect(target.messages.items.map(item => item.seq)).toEqual([450, 451, 452, 453, 454, 455]);
   expect(JSON.parse(Buffer.from(target.messages.previousCursor, "base64url").toString())).toBe(419);
   const bounded = statements.filter(query => /from "discussion_messages"/i.test(query.sql) && /order by.*desc/i.test(query.sql) && /limit/i.test(query.sql));
   expect(bounded).toHaveLength(1);
   expect(bounded[0].params).toContain(31);
   const previous = await service.getThread("bob", "deep-report-thread", target.messages.previousCursor);
   expect(previous.messages.items.map(item => item.seq)).toEqual(Array.from({ length: 30 }, (_, index) => index + 420));
   expect(previous.messages.nextCursor).toBe(target.messages.startCursor);
   const earlier = await service.getThread("bob", "deep-report-thread", previous.messages.previousCursor);
   expect(earlier.messages.items.map(item => item.seq)).toEqual(Array.from({ length: 30 }, (_, index) => index + 390));
   const nearStart = await service.getThread("bob", "deep-report-thread", undefined, "deep-reported-2");
   expect(JSON.parse(Buffer.from(nearStart.messages.previousCursor, "base64url").toString())).toBe(0);
   expect((await service.getThread("bob", "deep-report-thread", undefined, "deep-reported-1")).messages.previousCursor).toBeUndefined();
  } finally { client.query = original; }
 });

 test("cross-page replies quote bounded parents, deleted tombstones and no inaccessible forwarded content", async () => {
  await db.insert(schema.discussionThreads).values([
   { id: "quote-thread", channelId: "global", authorId: "bob", title: "Quotes", nextSeq: 34, answerCount: 27 },
   { id: "quote-private", channelId: "private-tech", authorId: "alice", title: "Private", nextSeq: 2 },
  ]);
  await db.insert(schema.discussionMessages).values({ id: "quote-secret", threadId: "quote-private", authorId: "alice", kind: "human", messageType: "question",
   body: "SECRET PRIVATE CONTENT", seq: 1, requestId: "quote-secret" });
  await db.insert(schema.discussionMessages).values([
   { id: "quote-original", threadId: "quote-thread", authorId: "bob", kind: "human", messageType: "question", body: "x".repeat(240), seq: 1, requestId: "quote-original" },
   { id: "quote-deleted", threadId: "quote-thread", authorId: "alice", kind: "human", messageType: "answer", body: "deleted secret", seq: 2,
    requestId: "quote-deleted", deletedAt: new Date(), deletedById: "alice" },
   { id: "quote-forward", threadId: "quote-thread", authorId: "alice", kind: "human", messageType: "forward", body: "", seq: 3, requestId: "quote-forward", forwardedFromId: "quote-secret" },
   ...Array.from({ length: 27 }, (_, index) => ({ id: `quote-fill-${index}`, threadId: "quote-thread", authorId: "alice", kind: "human",
    messageType: "answer", body: "Filler", seq: index + 4, requestId: `quote-fill-${index}` })),
   ...["quote-original", "quote-deleted", "quote-forward"].map((parent, index) => ({ id: `quote-reply-${index}`, threadId: "quote-thread", authorId: "bob",
    kind: "human", messageType: "reply", body: "Reply", seq: index + 31, requestId: `quote-reply-${index}`, replyToId: parent })),
  ]);
  await recordSeedParticipants(["quote-thread", "quote-private"]);
  await db.update(schema.user).set({ name: "B".repeat(120) }).where(eq(schema.user.id, "bob"));
  const first = await service.getThread("bob", "quote-thread");
  expect(first.messages.items.find(item => item.id === "quote-original")).toMatchObject({ canReply: true, canForward: true, canReact: true });
  expect(first.messages.items.find(item => item.id === "quote-deleted")).toMatchObject({ canReply: false, canForward: false, canReact: false });
  expect(first.messages.items.find(item => item.id === "quote-forward")).toMatchObject({ canReply: false, canForward: false, canReact: false });
  await expect(service.reply("bob", { ...submit("quote-forward-reply"), threadId: "quote-thread", messageType: "reply", replyTo: "quote-forward" }))
   .rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(service.setReaction("bob", "quote-forward", policy.DISCUSSION_REACTIONS[0], true)).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  const page = await service.getThread("bob", "quote-thread", first.messages.nextCursor);
  expect(page.messages.items[0].replyTo).toEqual({ id: "quote-original", seq: 1, authorKind: "name", excerptKind: "body", authorName: "B".repeat(80), excerpt: "x".repeat(180) });
  expect(page.messages.items[1].replyTo).toEqual({ id: "quote-deleted", seq: 2, authorKind: "deleted", excerptKind: "deleted", authorName: "Pesan dihapus", excerpt: "Pesan dihapus." });
  expect(page.messages.items[2].replyTo).toEqual({ id: "quote-forward", seq: 3, authorKind: "name", excerptKind: "source_unavailable", authorName: "alice", excerpt: "Pesan asal tidak tersedia." });
  expect(JSON.stringify(page.messages.items)).not.toContain("SECRET PRIVATE CONTENT");
  await db.insert(schema.discussionReports).values({ id: "report-inaccessible-forward", messageId: "quote-forward", reporterId: "bob", reason: "Tinjau" });
  const reported = (await service.listReports("admin")).items.find(item => item.id === "report-inaccessible-forward");
  expect(reported).toMatchObject({ threadTitle: "Quotes", message: { body: "Pesan asal tidak tersedia.", seq: 3, deleted: false, authorName: "alice" } });
  expect(JSON.stringify(reported)).not.toContain("SECRET PRIVATE CONTENT");
  await db.update(schema.user).set({ name: "bob" }).where(eq(schema.user.id, "bob"));
 });

 test("aggregate thread pages filter authorized scopes and search before their stable cursor limit", async () => {
  const at = new Date("2026-01-01T00:00:00Z");
  await db.insert(schema.discussionThreads).values(Array.from({ length: 45 }, (_, index) => ({
   id: `page-${String(index).padStart(3, "0")}`, channelId: index < 20 ? "global" : index < 40 ? "channel-a" : "channel-b",
   authorId: "alice", title: `Needle ${index}`, createdAt: at, lastActivityAt: at,
  })));
  const first = await service.listThreadsAcrossChannels("alice", { search: "Needle" });
  expect(first.items).toHaveLength(30);
  expect(first.nextCursor).toBeTruthy();
  const second = await service.listThreadsAcrossChannels("alice", { search: "Needle", cursor: first.nextCursor });
  expect(second.items).toHaveLength(10);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(40);
  expect([...first.items, ...second.items].every(item => item.channelId !== "channel-b")).toBe(true);
  expect((await service.listThreadsAcrossChannels("alice", { search: "Needle 39" })).items.map(item => item.title)).toEqual(["Needle 39"]);
  await expect(service.listThreadsAcrossChannels("alice", { channelId: "channel-b" })).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  expect((await service.getDiscussionCounts("alice", { courseId: "legacy-a" })).course.activeThreads).toBeGreaterThan(0);
  await db.update(schema.enrollments).set({ expiresAt: new Date("2000-01-01") }).where(eq(schema.enrollments.id, "enrollment-alice"));
  expect((await service.getDiscussionCounts("alice", { courseId: "legacy-a" })).course).toEqual({ unreadThreads: 0, activeThreads: 0 });
  await db.update(schema.enrollments).set({ expiresAt: new Date("2099-01-01") }).where(eq(schema.enrollments.id, "enrollment-alice"));
 });

 test("AI publication requires the complete context and the attachment sets captured before generation", async () => {
  const question = await service.createThread("alice", { ...submit("snapshot-question"), channelId: "global", title: "Snapshot" });
  const invoking = await service.reply("bob", { ...submit("snapshot-invoking"), threadId: question.threadId, messageType: "answer", askZyra: true });
  const [request] = await db.select().from(schema.discussionAiRequests).where(and(eq(schema.discussionAiRequests.messageId, invoking.messageId), eq(schema.discussionAiRequests.kind, "zyra")));
  await db.update(schema.discussionAiRequests).set({ status: "processing" }).where(eq(schema.discussionAiRequests.id, request.id));
  const sources = [{ id: question.messageId, revision: 1 }, { id: invoking.messageId, revision: 1 }];
  const snapshot = { contextIds: [question.messageId, invoking.messageId], attachmentSets: sources.map(item => ({ messageId: item.id, ids: [] })) };
  await expect(service.publishDiscussionZyraAnswer(request.id, "Jawaban", [sources[1]], { contextIds: [invoking.messageId], attachmentSets: [snapshot.attachmentSets[1]] })).rejects.toThrow("DISCUSSION_AI_SOURCE_CHANGED");
  await db.insert(schema.discussionAttachments).values({ id: "late-attachment", channelId: "global", uploaderId: "alice", messageId: question.messageId, status: "attached",
   storageKey: "discussion-test-late", name: "late.png", mime: "image/png", size: 10, width: 1, height: 1, expiresAt: new Date("2099-01-01") });
  await expect(service.publishDiscussionZyraAnswer(request.id, "Jawaban", sources, snapshot)).rejects.toThrow("DISCUSSION_AI_SOURCE_CHANGED");
  snapshot.attachmentSets[0].ids.push("late-attachment");
  const answer = await service.publishDiscussionZyraAnswer(request.id, "Jawaban", sources, snapshot);
  expect(answer.threadId).toBe(question.threadId);
  const [event] = await db.select().from(schema.discussionEvents).where(eq(schema.discussionEvents.messageId, answer.messageId));
  expect(JSON.parse(event.recipientCursor)).toEqual({ phase: "direct", after: null, mentions: [] });
 });

 test("mention eligibility precedes the limit and channel access stays batched for 1000 private scopes", async () => {
  const candidates = Array.from({ length: 121 }, (_, index) => ({ id: `mention-${String(index).padStart(3, "0")}`, name: `Candidate ${String(index).padStart(3, "0")}` }));
  await db.insert(schema.user).values(candidates.map(row => ({ ...row, email: `${row.id}@example.test`, role: "student" })));
  await db.insert(schema.pengguna).values(candidates.map(row => ({ id: row.id })));
  await db.insert(schema.penggunaPeran).values(candidates.map(row => ({ id: `role-${row.id}`, penggunaId: row.id, peranId: "r-student", source: "test" })));
  await db.insert(schema.enrollments).values({ id: "mention-enrolled", userId: candidates[120].id, courseId: "legacy-a", expiresAt: new Date("2099-01-01") });
  expect(await service.searchChannelMentions("alice", "channel-a", "Candidate")).toEqual([{ ...candidates[120], role: "student" }]);

  const staff = Array.from({ length: 1000 }, (_, index) => `staff-${String(index).padStart(4, "0")}`);
  await db.insert(schema.user).values(staff.map(id => ({ id, name: id, email: `${id}@example.test`, role: "teacher" })));
  await db.insert(schema.pengguna).values(staff.map(id => ({ id })));
  await db.insert(schema.penggunaPeran).values(staff.map(id => ({ id: `role-${id}`, penggunaId: id, peranId: "r-tutor", source: "test" })));
  await db.insert(schema.discussionChannels).values(staff.map(id => ({ id: `channel-${id}`, kind: "academic", title: "Akademik", requesterId: id, courseId: "course-a", legacyCourseId: "legacy-a" })));
  let cursor = null;
  const found = [];
  do {
   const page = await access.getDiscussionCandidateUserIdsPage("private-academic", { cursor, limit: 100 });
   found.push(...page.items); cursor = page.nextCursor;
  } while (cursor);
  expect(found).toContain("staff-0999");
  expect(found.length).toBeGreaterThan(1000);

  const originalQuery = client.query;
  let queries = 0;
  client.query = function (...args) { queries++; return originalQuery.apply(this, args); };
  try {
   const allowed = await access.getAccessibleDiscussionChannels("tutor");
   expect(allowed.filter(row => row.id.startsWith("channel-staff-")).length).toBe(1000);
   expect(queries).toBeGreaterThan(0);
   expect(queries).toBeLessThan(30);
  } finally { client.query = originalQuery; }
  const counts = await service.getDiscussionCounts("tutor", { courseId: "legacy-a" });
  expect(Object.keys(counts.scopes).sort()).toEqual(["academic", "course", "global", "technical"]);
  expect(counts.course).not.toBeNull();
  const firstPage = await service.listChannelsPage("tutor", { search: "Akademik", limit: 20 });
  const secondPage = await service.listChannelsPage("tutor", { search: "Akademik", limit: 20, cursor: firstPage.nextCursor });
  expect(firstPage.items).toHaveLength(20);
  expect(secondPage.items).toHaveLength(20);
  expect(new Set([...firstPage.items, ...secondPage.items].map(item => item.id)).size).toBe(40);
 });
});


test("swept owned uploads remain recoverable without accepting another owner's attachment", async () => {
 await db.insert(schema.user).values({ id: 'swept-owner', name: 'Owner', email: 'swept-owner@example.test' });
 await db.insert(schema.pengguna).values({ id: 'swept-owner' });
 await db.insert(schema.penggunaPeran).values({ id: 'swept-role', penggunaId: 'swept-owner', peranId: 'r-student', source: 'test' });
 const question = await service.createThread('swept-owner', { ...submit('swept-question'), channelId: 'global', title: 'Retained draft' });
 for (const status of ['ready','deleting','failed','expired']) {
  const id = 'swept-' + status;
  await db.insert(schema.discussionAttachments).values({ id, uploaderId: 'swept-owner', channelId: 'global', status, storageKey: 'test/' + id, name: 'original.png', expiresAt: status === 'ready' ? new Date(0) : new Date('2099-01-01') });
  await expect(service.reply('swept-owner', { ...submit('recover-' + status), threadId: question.threadId, messageType: 'answer', attachmentIds: [id] })).rejects.toThrow('DISCUSSION_ATTACHMENT_EXPIRED');
  await expect(service.reply('admin', { ...submit('forged-' + status), threadId: question.threadId, messageType: 'answer', attachmentIds: [id] })).rejects.toThrow('DISCUSSION_IMAGE_SCOPE');
 }
 await expect(service.reply('swept-owner', { ...submit('missing-ownership'), threadId: question.threadId, messageType: 'answer', attachmentIds: ['never-owned'] })).rejects.toThrow('DISCUSSION_IMAGE_SCOPE');
 const visible = await service.getThread('swept-owner', question.threadId);
 expect(visible.messages.items).toHaveLength(1);
});

test("production read retry preserves the gap through signed receipt transactions", async () => {
 assert.ok(fs.existsSync(path.join(root, "drizzle-postgres/0034_aromatic_silhouette.sql")));
 const { createReadHarness } = require("./read-retry-harness.cjs");
 const first = await service.createThread("alice", { ...submit("read-retry-question"), channelId: "global", title: "Retry gap" });
 const second = await service.reply("alice", { ...submit("read-retry-answer"), threadId: first.threadId, messageType: "answer" });
 const page = await service.getThread("bob", first.threadId);
 assert.deepEqual(page.messages.items.map(message => message.id), [first.messageId, second.messageId]);
 let attempts = 0;
 const harness = createReadHarness(page, async (thread, through, receipt, ids) => {
  if (++attempts <= 3) throw new Error("Controlled acknowledgement failure");
  return service.markRead("bob", thread, through, receipt, ids);
 });
 const observations = () => db.select().from(schema.discussionMessageObservations)
  .where(and(eq(schema.discussionMessageObservations.userId, "bob"), inArray(schema.discussionMessageObservations.messageId, [first.messageId, second.messageId])));
 const read = () => db.select().from(schema.discussionThreadReads)
  .where(and(eq(schema.discussionThreadReads.userId, "bob"), eq(schema.discussionThreadReads.threadId, first.threadId)));
 try {
  await harness.tick(599);
  assert.equal(harness.observedMessages.current.size, 0);
  await harness.tick(1);
  await harness.tick(1500);
  await harness.tick(1500);
  await harness.tick(3000);
  assert.equal(attempts, 3);
  assert.equal(harness.error, true);
  assert.equal((await observations()).length, 0);
  assert.equal((await read())[0].throughSeq, 0);
  harness.show(second.messageId);
  harness.retry();
  assert.equal(harness.observedMessages.current.has(1), true);
  harness.block(true);
  await harness.tick(600);
  assert.equal(attempts, 3);
  harness.block(false);
  await harness.tick(599);
  assert.equal(attempts, 3);
  await harness.tick(1);
  await harness.tick(1500);
  await harness.settle();
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls[3].slice(1))), [0, page.messages.observationReceipt, [second.messageId]]);
  assert.deepEqual((await observations()).map(row => [row.messageId, row.revision]), [[second.messageId, 1]]);
  assert.equal((await read())[0].throughSeq, 0);
  harness.show(first.messageId);
  await harness.tick(600);
  await harness.tick(1500);
  await harness.settle();
  assert.deepEqual(JSON.parse(JSON.stringify(harness.calls[4].slice(1))), [2, page.messages.observationReceipt, [first.messageId]]);
  assert.deepEqual((await observations()).map(row => row.messageId).sort(), [first.messageId, second.messageId].sort());
  assert.equal((await read())[0].throughSeq, 2);
  assert.equal(harness.error, false);
 } finally { harness.stop(); }
});
