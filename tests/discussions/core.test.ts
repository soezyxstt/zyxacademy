import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createDiscussionTestDb } from "./local-postgres";

const { client, testDb: db } = await createDiscussionTestDb();
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db }));
mock.module("@/lib/db", () => ({ db }));
mock.module("@/lib/auth-secret", () => ({ resolveAuthSecret: () => "discussion-test-secret" }));
let sessionUserId: string | null = null;
mock.module("@/lib/auth-session", () => ({ getAuthSession: async () => sessionUserId ? { user: { id: sessionUserId } } : null }));
mock.module("@/lib/discussions/images", () => ({
 attachDiscussionImages: async (_tx: unknown, input: { attachmentIds: string[] }) => {
  if (input.attachmentIds.length) throw new Error("test has no uploaded images");
 },
 listDiscussionMessageAttachments: async () => [],
 listDiscussionAttachmentsForMessages: async () => new Map(),
}));
mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
mock.module("@/lib/discussions/rewards", () => ({
 enqueueDiscussionReward: async (tx: typeof db, input: { userId: string; threadId: string; messageId: string; kind: string; occurredAt: Date }) => {
  await tx.insert(schema.gamificationEventOutbox).values({ id: crypto.randomUUID(), userId: input.userId, source: `discussion_${input.kind}`,
   sourceId: input.messageId, evidenceId: input.threadId, occurredAt: input.occurredAt }).onConflictDoNothing();
 },
}));
const access = await import("@/lib/discussions/access");
const service = await import("@/lib/discussions/service");
const policy = await import("@/lib/discussions/policy");
const session = await import("@/lib/discussions/session");
afterAll(() => client.close());

beforeAll(async () => {
 await db.insert(schema.peran).values([{ id: "r-student", code: "murid" }, { id: "r-tutor", code: "tutor" }, { id: "r-admin", code: "admin" }]);
 for (const [id, role] of [["alice", "student"], ["bob", "student"], ["carol", "student"], ["tutor", "tutor"], ["admin", "admin"], ["suspended", "student"]] as const) {
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

const submit = (requestId: string, body = "Pertanyaan") => ({ body, attachmentIds: [], mentionIds: [], askZyra: false, requestId });

describe("discussion authorization and transactions", () => {
 test("bounded channel metadata omits revoked scopes and exact course pages exclude team channels", async () => {
  const channels = await service.listChannels("bob", ["channel-a", "channel-b", "private-academic", "missing", "global"]);
  expect(channels.map(row => row.id).sort()).toEqual(["channel-a", "global"]);
  expect(channels.find(row => row.id === "channel-a")?.courseId).toBe("course-a");
  await expect(service.listChannels("bob", Array.from({ length: 32 }, () => "global"))).rejects.toThrow("DISCUSSION_INVALID");
  expect(await service.listChannels("bob", [])).toEqual([]);
  const course = await service.listChannelsPage("alice", { courseId: "legacy-a", kind: "course" });
  expect(course.items.map(row => row.id)).toEqual(["channel-a"]);
  await expect(service.listChannelsPage("alice", { kind: "unknown" as never })).rejects.toThrow("DISCUSSION_INVALID");
 });
 test("active roles, full entitlement, assignment, privacy, and alias ambiguity are enforced", async () => {
  const alice = await access.getDiscussionActor("alice"), bob = await access.getDiscussionActor("bob"), tutor = await access.getDiscussionActor("tutor");
  await expect(access.getDiscussionActor("suspended")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(access.requireDiscussionChannelAccess(alice, "channel-a")).resolves.toBeDefined();
  await expect(access.requireDiscussionChannelAccess(bob, "channel-b")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(access.requireDiscussionChannelAccess(alice, "private-academic")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(access.requireDiscussionChannelAccess(bob, "private-academic")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(access.requireDiscussionChannelAccess({ id: "bob", role: "admin" }, "private-tech")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(access.requireDiscussionChannelAccess(tutor, "private-tech")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(access.requireDiscussionChannelAccess(tutor, "private-academic")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(access.requireDiscussionChannelAccess(tutor, "channel-a")).resolves.toBeDefined();
  await db.update(schema.penugasanTutor).set({ status: "revoked" }).where(eq(schema.penugasanTutor.id, "assignment"));
  await expect(access.requireDiscussionChannelAccess(tutor, "channel-a")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
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

 test("channel listing excludes team channels and rejects team preparation", async () => {
  const channels = await service.listChannels("alice");
  expect(channels.some(channel => channel.id === "channel-a")).toBe(true);
  expect(channels.some(channel => channel.id === "channel-b")).toBe(false);
  expect(channels.filter(channel => channel.kind === "technical" || channel.kind === "academic")).toEqual([]);
  await expect(service.ensureDiscussionTeamChannel("alice", "technical", "legacy-a")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
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
  const answerInput = { ...submit("answer-1", "Jawaban"), threadId: first.threadId, messageType: "answer" as const };
  const answer = await service.reply("bob", answerInput);
  expect(await service.reply("bob", answerInput)).toEqual(answer);
  await service.reply("alice", { ...submit("self-answer"), threadId: first.threadId, messageType: "answer" });
  const reply = await service.reply("bob", { ...submit("context-reply"), threadId: first.threadId, messageType: "reply", replyTo: first.messageId });
  await expect(service.reply("bob", { ...submit("invalid-type"), threadId: first.threadId, messageType: "answer", replyTo: first.messageId } as never)).rejects.toThrow("DISCUSSION_INVALID");
  const messages = await db.select().from(schema.discussionMessages).where(eq(schema.discussionMessages.threadId, first.threadId)).orderBy(schema.discussionMessages.seq);
  expect(messages.map(row => [row.seq, row.messageType])).toEqual([[1, "question"], [2, "answer"], [3, "answer"], [4, "reply"]]);
  const page = await service.listThreads("bob", "channel-a");
  expect(page.items.find(item => item.id === first.threadId)?.answerCount).toBe(2);
  const [beforeFailure] = await db.select().from(schema.discussionThreads).where(eq(schema.discussionThreads.id, first.threadId));
  await expect(service.reply("bob", { ...submit("answer-attachment-failure"), threadId: first.threadId, messageType: "answer", attachmentIds: ["missing"] }))
   .rejects.toThrow("test has no uploaded images");
  const [afterFailure] = await db.select().from(schema.discussionThreads).where(eq(schema.discussionThreads.id, first.threadId));
  expect([afterFailure.nextSeq, afterFailure.answerCount]).toEqual([beforeFailure.nextSeq, beforeFailure.answerCount]);
  await expect(db.update(schema.discussionThreads).set({ answerCount: -1 }).where(eq(schema.discussionThreads.id, first.threadId)).execute()).rejects.toThrow();
  const rewards = await db.select().from(schema.gamificationEventOutbox).where(eq(schema.gamificationEventOutbox.evidenceId, first.threadId));
  expect(rewards.map(row => row.source).sort()).toEqual(["discussion_answer", "discussion_question"]);
  const request = requests.find(row => row.kind === "zyra")!;
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

 test("event mention snapshots survive edits and deletion and include empty message snapshots", async () => {
  const question = await service.createThread("alice", { ...submit("event-question"), channelId: "global", title: "Snapshot", mentionIds: ["bob"] });
  await service.edit("alice", question.messageId, "Updated", 1);
  const answer = await service.reply("bob", { ...submit("event-answer"), threadId: question.threadId, messageType: "answer", mentionIds: ["alice"] });
  const forwarded = await service.forward("alice", question.messageId, question.threadId, "event-forward");
  await service.deleteMessage("bob", answer.messageId);
  const events = await db.select().from(schema.discussionEvents).where(eq(schema.discussionEvents.threadId, question.threadId));
  const snapshot = (kind: string, messageId: string) => JSON.parse(events.find(item => item.kind === kind && item.messageId === messageId)!.recipientCursor!);
  expect(snapshot("question", question.messageId)).toEqual({ phase: "direct", after: null, mentions: ["bob"] });
  expect(snapshot("edit", question.messageId)).toEqual({ phase: "direct", after: null, mentions: ["bob"] });
  expect(snapshot("message", answer.messageId)).toEqual({ phase: "direct", after: null, mentions: ["alice"] });
  expect(snapshot("message", forwarded.messageId)).toEqual({ phase: "direct", after: null, mentions: [] });
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
  const hidden = Array.from({ length: 30 }, (_, index) => ({ id: `report-filter-message-${index}`, threadId: "report-filter-hidden", seq: index + 1, authorId: "alice", kind: "human" as const, messageType: "answer" as const, body: "Hidden", requestId: `report-filter-request-${index}` }));
  await db.insert(schema.discussionMessages).values([...hidden, { id: "report-filter-message-visible", threadId: "report-filter-visible", seq: 1, authorId: "alice", kind: "human", messageType: "question", body: "Visible", requestId: "report-filter-request-visible" }]);
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
  const reward = await db.select().from(schema.gamificationEventOutbox).where(and(eq(schema.gamificationEventOutbox.sourceId, first.messageId), eq(schema.gamificationEventOutbox.source, "discussion_question")));
  expect(reward).toHaveLength(1);
 });

 test("forward and edit policies retain their exact boundaries", () => {
  const privateChannel = { id: "private", kind: "technical" as const, courseId: null, legacyCourseId: null };
  const global = { id: "global", kind: "global" as const, courseId: null, legacyCourseId: null };
  const course = { id: "course", kind: "course" as const, courseId: "a", legacyCourseId: "old-a" };
  expect(policy.canForwardDiscussion(privateChannel, privateChannel)).toBe(false);
  expect(policy.canForwardDiscussion(privateChannel, global)).toBe(false);
  expect(policy.canForwardDiscussion(global, course)).toBe(true);
  expect(policy.canForwardDiscussion(course, global)).toBe(false);
  const createdAt = new Date("2026-01-01T00:00:00Z");
  const message = { authorId: "alice", kind: "human", createdAt, deletedAt: null };
  expect(policy.canEditDiscussionMessage({ id: "alice", role: "student" }, message, new Date(createdAt.getTime() + 299999))).toBe(true);
  expect(policy.canEditDiscussionMessage({ id: "alice", role: "student" }, message, new Date(createdAt.getTime() + 300000))).toBe(false);
 });

 test("legacy course channels grow canonical aliases without changing thread identities", async () => {
  await db.insert(schema.courses).values({ id: "legacy-growth", title: "Growth", category: "Matematika" });
  await db.insert(schema.enrollments).values({ id: "growth-enrollment", userId: "alice", courseId: "legacy-growth", expiresAt: new Date("2099-01-01") });
  await db.insert(schema.discussionChannels).values([
   { id: "growth-course", kind: "course", title: "Growth", legacyCourseId: "legacy-growth" },
   { id: "growth-team", kind: "academic", title: "Akademik", requesterId: "alice", legacyCourseId: "legacy-growth" },
  ]);
  await db.insert(schema.discussionThreads).values({ id: "growth-thread", channelId: "growth-course", authorId: "alice", title: "Preserved" });
  await db.insert(schema.mataKuliah).values({ id: "canonical-growth", code: "GROWTH", title: "Growth", legacyCourseId: "legacy-growth" });
  await expect(access.requireDiscussionChannelAccess(await access.getDiscussionActor("alice"), "growth-course")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(service.ensureDiscussionTeamChannel("alice", "academic", "legacy-growth")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  const channels = await service.listChannels("alice");
  expect(channels.some(row => row.id === "growth-course" && row.courseId === "canonical-growth")).toBe(true);
  expect(channels.some(row => row.id === "growth-team")).toBe(false);
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
   ...Array.from({ length: 80 }, (_, index) => ({ id: `picker-private-${index}`, kind: "academic" as const, title: `Picker private ${index}`, requesterId: `picker-requester-${index}` })),
  ]);
  const original = client.query;
  const reads: Array<{ sql: string; rows: number }> = [];
  client.query = function (this: unknown, ...args: Parameters<typeof client.query>) {
   return original.apply(this, args).then(result => {
    reads.push({ sql: String(args[0]), rows: result.rows.length });
    return result;
   });
  } as typeof client.query;
  try {
   const first = await service.listChannelsPage("admin", { search: "Picker", kinds: ["global", "course"], limit: 1 });
   expect(first.items.map(row => row.id)).toEqual(["picker-a"]);
   expect(first.nextCursor).not.toBeNull();
   const second = await service.listChannelsPage("admin", { search: "Picker", kinds: ["global", "course"], cursor: first.nextCursor!, limit: 1 });
   expect(second.items.map(row => row.id)).toEqual(["picker-b"]);
   expect(second.nextCursor).toBeNull();
   const candidates = reads.filter(read => /from "discussion_channels"/i.test(read.sql) && /order by/i.test(read.sql) && /limit/i.test(read.sql));
   expect(candidates.length).toBeGreaterThan(0);
   expect(candidates.reduce((count, read) => count + read.rows, 0)).toBeLessThanOrEqual(3);
   expect(reads.some(read => /\b(insert|update)\b/i.test(read.sql))).toBe(false);
   expect(reads.some(read => /from "(bab|chapters)"/i.test(read.sql))).toBe(false);
   await expect(service.listChannelsPage("admin", { kinds: ["course", "course"] })).rejects.toThrow("DISCUSSION_INVALID");
   await expect(service.listChannelsPage("admin", { kinds: ["wrong"] as never })).rejects.toThrow("DISCUSSION_INVALID");
  } finally { client.query = original; }
 });

 test("explicit help kind is rejected and omitted titles derive from the initial message", async () => {
  await expect(service.createThread("alice", { ...submit("help-feature"), channelId: "private-tech", title: "Feature", helpKind: "feature" as const })).rejects.toThrow("DISCUSSION_INVALID");
  await expect(service.createThread("alice", { ...submit("help-public"), channelId: "global", helpKind: "feature" as const })).rejects.toThrow("DISCUSSION_INVALID");
  await expect(service.createThread("alice", { ...submit("help-team"), channelId: "global", team: "technical" } as never)).rejects.toThrow("DISCUSSION_INVALID");
  const auto = await service.createThread("alice", { ...submit("auto-title-q", "Bagaimana cara menyelesaikan integral parsial ini? Saya bingung pada substitusi kedua."), channelId: "global" });
  const view = await service.getThread("alice", auto.threadId);
  expect(view.thread.title).toBe("Bagaimana cara menyelesaikan integral parsial ini?");
  expect(view.thread.helpKind).toBeNull();
 });

 test("message DTOs resolve the author's active canonical role", async () => {
  const question = await service.createThread("alice", { ...submit("role-question"), channelId: "global", title: "Role" });
  await service.reply("tutor", { ...submit("role-answer"), threadId: question.threadId, messageType: "answer" });
  const view = await service.getThread("alice", question.threadId);
  expect(view.messages.items.map(item => item.author?.role)).toEqual(["student", "tutor"]);
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
   ...Array.from({ length: 27 }, (_, index) => ({ id: `quote-fill-${index}`, threadId: "quote-thread", authorId: "alice", kind: "human" as const,
    messageType: "answer" as const, body: "Filler", seq: index + 4, requestId: `quote-fill-${index}` })),
   ...["quote-original", "quote-deleted", "quote-forward"].map((parent, index) => ({ id: `quote-reply-${index}`, threadId: "quote-thread", authorId: "bob",
    kind: "human" as const, messageType: "reply" as const, body: "Reply", seq: index + 31, requestId: `quote-reply-${index}`, replyToId: parent })),
  ]);
  await db.update(schema.user).set({ name: "B".repeat(120) }).where(eq(schema.user.id, "bob"));
  const first = await service.getThread("bob", "quote-thread");
  expect(first.messages.items.find(item => item.id === "quote-original")).toMatchObject({ canReply: true, canForward: true, canReact: true });
  expect(first.messages.items.find(item => item.id === "quote-deleted")).toMatchObject({ canReply: false, canForward: false, canReact: false });
  expect(first.messages.items.find(item => item.id === "quote-forward")).toMatchObject({ canReply: false, canForward: false, canReact: false });
  await expect(service.reply("bob", { ...submit("quote-forward-reply"), threadId: "quote-thread", messageType: "reply", replyTo: "quote-forward" }))
   .rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(service.setReaction("bob", "quote-forward", policy.DISCUSSION_REACTIONS[0], true)).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  const page = await service.getThread("bob", "quote-thread", first.messages.nextCursor!);
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
  const second = await service.listThreadsAcrossChannels("alice", { search: "Needle", cursor: first.nextCursor! });
  expect(second.items).toHaveLength(10);
  expect(second.nextCursor).toBeNull();
  expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(40);
  expect([...first.items, ...second.items].every(item => item.channelId !== "channel-b")).toBe(true);
  expect((await service.listThreadsAcrossChannels("alice", { search: "Needle 39" })).items.map(item => item.title)).toEqual(["Needle 39"]);
  await expect(service.listThreadsAcrossChannels("alice", { channelId: "channel-b" })).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  expect((await service.getDiscussionCounts("alice", { courseId: "legacy-a" })).course!.activeThreads).toBeGreaterThan(0);
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
  const snapshot = { contextIds: [question.messageId, invoking.messageId], attachmentSets: sources.map(item => ({ messageId: item.id, ids: [] as string[] })) };
  await expect(service.publishDiscussionZyraAnswer(request.id, "Jawaban", [sources[1]], { contextIds: [invoking.messageId], attachmentSets: [snapshot.attachmentSets[1]] })).rejects.toThrow("DISCUSSION_AI_SOURCE_CHANGED");
  await db.insert(schema.discussionAttachments).values({ id: "late-attachment", channelId: "global", uploaderId: "alice", messageId: question.messageId, status: "attached",
   storageKey: "discussion-test-late", name: "late.png", mime: "image/png", size: 10, width: 1, height: 1, expiresAt: new Date("2099-01-01") });
  await expect(service.publishDiscussionZyraAnswer(request.id, "Jawaban", sources, snapshot)).rejects.toThrow("DISCUSSION_AI_SOURCE_CHANGED");
  snapshot.attachmentSets[0].ids.push("late-attachment");
  const answer = await service.publishDiscussionZyraAnswer(request.id, "Jawaban", sources, snapshot);
  expect(answer.threadId).toBe(question.threadId);
  const [event] = await db.select().from(schema.discussionEvents).where(eq(schema.discussionEvents.messageId, answer.messageId));
  expect(JSON.parse(event.recipientCursor!)).toEqual({ phase: "direct", after: null, mentions: [] });
 });

 test("mention eligibility precedes the limit, team channels stay excluded, and course channels paginate cleanly", async () => {
  const candidates = Array.from({ length: 121 }, (_, index) => ({ id: `mention-${String(index).padStart(3, "0")}`, name: `Candidate ${String(index).padStart(3, "0")}` }));
  await db.insert(schema.user).values(candidates.map(row => ({ ...row, email: `${row.id}@example.test`, role: "student" as const })));
  await db.insert(schema.pengguna).values(candidates.map(row => ({ id: row.id })));
  await db.insert(schema.penggunaPeran).values(candidates.map(row => ({ id: `role-${row.id}`, penggunaId: row.id, peranId: "r-student", source: "test" })));
  await db.insert(schema.enrollments).values({ id: "mention-enrolled", userId: candidates[120].id, courseId: "legacy-a", expiresAt: new Date("2099-01-01") });
  expect(await service.searchChannelMentions("alice", "channel-a", "Candidate")).toEqual([{ ...candidates[120], role: "student" }]);

  const staff = Array.from({ length: 1000 }, (_, index) => `staff-${String(index).padStart(4, "0")}`);
  await db.insert(schema.user).values(staff.map(id => ({ id, name: id, email: `${id}@example.test`, role: "teacher" as const })));
  await db.insert(schema.pengguna).values(staff.map(id => ({ id })));
  await db.insert(schema.penggunaPeran).values(staff.map(id => ({ id: `role-${id}`, penggunaId: id, peranId: "r-tutor", source: "test" })));
  await db.insert(schema.discussionChannels).values(staff.map(id => ({ id: `channel-${id}`, kind: "academic" as const, title: "Akademik", requesterId: id, courseId: "course-a", legacyCourseId: "legacy-a" })));
  await expect(access.getDiscussionCandidateUserIdsPage("private-academic", { limit: 100 })).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  let cursor: string | null = null;
  const found: string[] = [];
  do {
   const page = await access.getDiscussionCandidateUserIdsPage("channel-a", { cursor, limit: 100 });
   found.push(...page.items); cursor = page.nextCursor;
  } while (cursor);
  expect(found).toContain("staff-0999");
  expect(found.length).toBeGreaterThan(1000);

  const originalQuery = client.query;
  let queries = 0;
  client.query = function (this: unknown, ...args: Parameters<typeof client.query>) { queries++; return originalQuery.apply(this, args); } as typeof client.query;
  try {
   const allowed = await access.getAccessibleDiscussionChannels("tutor");
   expect(allowed.filter(row => row.id.startsWith("channel-staff-"))).toHaveLength(0);
   expect(queries).toBeGreaterThan(0);
   expect(queries).toBeLessThan(30);
  } finally { client.query = originalQuery; }
  const counts = await service.getDiscussionCounts("tutor", { courseId: "legacy-a" });
  expect(Object.keys(counts.scopes).sort()).toEqual(["academic", "course", "global", "technical"]);
  expect(counts.course).not.toBeNull();

  const pageCourses = Array.from({ length: 45 }, (_, index) => `page-course-${String(index).padStart(2, "0")}`);
  await db.insert(schema.mataKuliah).values(pageCourses.map(id => ({ id, code: id.toUpperCase(), title: `Diskusi ${id}`, pricingCategory: "free" as const })));
  await db.insert(schema.discussionChannels).values(pageCourses.map(id => ({ id: `ch-${id}`, kind: "course" as const, title: `Diskusi ${id}`, courseId: id })));
  const firstPage = await service.listChannelsPage("admin", { search: "Diskusi page-course-", limit: 20 });
  const secondPage = await service.listChannelsPage("admin", { search: "Diskusi page-course-", limit: 20, cursor: firstPage.nextCursor! });
  expect(firstPage.items).toHaveLength(20);
  expect(secondPage.items).toHaveLength(20);
  expect(new Set([...firstPage.items, ...secondPage.items].map(item => item.id)).size).toBe(40);
 });

 test("author profile lookup enforces thread membership, privacy, block, staff, and soft-deletion boundaries", async () => {
  const thread = await service.createThread("alice", { ...submit("profile-q"), channelId: "global", title: "Profil" });
  const tutorAnswer = await service.reply("tutor", { ...submit("profile-tutor"), threadId: thread.threadId, messageType: "answer" });
  const deletedAnswer = await service.reply("carol", { ...submit("profile-carol"), threadId: thread.threadId, messageType: "answer" });
  await service.deleteMessage("carol", deletedAnswer.messageId);
  await db.insert(schema.gamificationProfiles).values([
   { userId: "alice", publicId: "pub-alice", displayName: "Alice Public", visibility: "members", leaderboardOptIn: true, allowFollows: true },
   { userId: "bob", publicId: "pub-bob", displayName: "Bob Private", visibility: "private", leaderboardOptIn: false },
  ]);
  await service.reply("bob", { ...submit("profile-bob"), threadId: thread.threadId, messageType: "answer" });
  expect(await service.getDiscussionAuthorProfile("bob", thread.threadId, "alice")).toMatchObject({
   kind: "student", role: "student", profile: { publicId: "pub-alice", displayName: "Alice Public", canFollow: true },
  });
  expect(await service.getDiscussionAuthorProfile("alice", thread.threadId, "bob")).toMatchObject({
   kind: "limited", id: "bob", role: "student", visibilityReason: "private",
  });
  expect(await service.getDiscussionAuthorProfile("bob", thread.threadId, "bob")).toMatchObject({
   kind: "student", role: "student", profile: { displayName: "Bob Private", canFollow: false },
  });
  expect(await service.getDiscussionAuthorProfile("alice", thread.threadId, "tutor")).toMatchObject({
   kind: "limited", id: tutorAnswer ? "tutor" : "tutor", role: "tutor", visibilityReason: "staff",
  });
  await expect(service.getDiscussionAuthorProfile("alice", thread.threadId, "carol")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
  await expect(service.getDiscussionAuthorProfile("carol", (await service.createThread("alice", { ...submit("profile-course"), channelId: "channel-a", title: "Priv" })).threadId, "alice"))
   .rejects.toThrow("DISCUSSION_UNAVAILABLE");
 });
});
