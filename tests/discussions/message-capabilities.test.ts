import { expect, mock, test } from "bun:test";
import { verifyDiscussionReadReceipt } from "@/lib/discussions/read-receipt";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const at = new Date("2026-01-01T00:00:00Z");
const thread = { id: "thread", channelId: "destination", authorId: "alice", title: "Question", status: "open", statusRevision: 0, labels: [], helpKind: null,
 createdAt: at, lastActivityAt: at };
const channel = { id: "destination", kind: "course", courseId: "course", legacyCourseId: "legacy" };
const global = { id: "global", kind: "global", courseId: null, legacyCourseId: null };
const inaccessible = { id: "private", kind: "technical", courseId: null, legacyCourseId: null };
const common = { threadId: "thread", authorId: "alice", kind: "human", body: "Body", createdAt: at, editedAt: null,
 revision: 1, replyToId: null, skinId: null };
const messages = [
 { ...common, id: "normal", messageType: "answer", seq: 1, deletedAt: null, forwardedFromId: null },
 { ...common, id: "deleted", messageType: "answer", seq: 2, deletedAt: at, forwardedFromId: null },
 { ...common, id: "allowed", messageType: "forward", seq: 3, deletedAt: null, forwardedFromId: "source-allowed" },
 { ...common, id: "unavailable", messageType: "forward", seq: 4, deletedAt: null, forwardedFromId: "source-unavailable" },
];
const sources = [
 { channel: global, message: { id: "source-allowed", threadId: "source-thread", body: "Visible", deletedAt: null, messageType: "answer" } },
 { channel: inaccessible, message: { id: "source-unavailable", threadId: "private-thread", body: "SECRET", deletedAt: null, messageType: "answer" } },
];
const readUpdates: { values: unknown; update: { set: Record<string, unknown> } }[] = [];
const tx = {
 select: () => { throw new Error("The fetch must not lock the shared thread"); },
 insert: () => ({ values: (values: unknown) => ({ onConflictDoUpdate: async (update: { set: Record<string, unknown> }) => { readUpdates.push({ values, update }); } }) }),
};
const db = {
 select: (selection?: Record<string, unknown>) => {
  const result = !selection ? messages : "message" in selection ? sources : "threadId" in selection ? [{ threadId: "thread", answerCount: 1, unreadCount: 0 }]
   : "messageId" in selection ? [] : [{ id: "alice", name: "Alice", role: "murid" }];
  const query = {
   from() { return this; }, leftJoin() { return this; }, innerJoin() { return this; }, where() { return this; }, orderBy() { return this; }, groupBy() { return this; },
   async limit() { return result; },
   then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve(result).then(resolve, reject); },
  };
  return query;
 },
 transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => work(tx),
};
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db }));
mock.module("@/lib/auth-secret", () => ({ resolveAuthSecret: () => "fixture secret" }));
mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() }));
mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
mock.module("@/lib/discussions/access", () => ({
 discussionChannelCandidateScope: () => undefined, getDiscussionChannelVisibility: async () => ({}), resolveDiscussionCourses: async () => new Map(),
 getDiscussionActor: async (id: string) => ({ id, role: "student" }), getAccessibleDiscussionChannels: async () => [global],
 requireDiscussionChannelAccess: async () => ({}), requireDiscussionCourse: async () => ({}), requireDiscussionMessageAccess: async () => ({}),
 requireDiscussionThreadAccess: async () => ({ channel, thread }),
}));
const { getThread } = await import("@/lib/discussions/service");

test("message capabilities follow deletion, source visibility, and thread status", async () => {
 const open = await getThread("viewer", "thread");
 expect(readUpdates[0].values).toMatchObject({ userId: "viewer", threadId: "thread", observedSeq: 4 });
 expect(Object.keys(readUpdates[0].update.set)).toEqual(["observedSeq"]);
 expect(new PgDialect().sqlToQuery(readUpdates[0].update.set.observedSeq as SQL).sql).toContain("greatest(");
 expect(verifyDiscussionReadReceipt(open.messages.observationReceipt, "viewer", "thread", "fixture secret")).toMatchObject({
  status: "open", statusRevision: 0, messages: messages.map(({ id, seq, revision }) => ({ id, seq, revision })),
 });
 expect(open.messages.items[0]).toMatchObject({ bodyKind: "body", canReply: true, canForward: true, canReact: true });
 expect(open.messages.items[1]).toMatchObject({ body: "Pesan dihapus.", bodyKind: "deleted", canReply: false, canForward: false, canReact: false });
 expect(open.messages.items[2]).toMatchObject({ body: "Visible", bodyKind: "body", canReply: true, canForward: false, canReact: true });
 expect(open.messages.items[3]).toMatchObject({ body: "Pesan asal tidak tersedia.", bodyKind: "source_unavailable", canReply: false, canForward: false, canReact: false });
 expect(JSON.stringify(open)).not.toContain("SECRET");
 thread.status = "resolved";
 thread.statusRevision = 1;
 try {
  const resolved = await getThread("viewer", "thread");
  expect(resolved.messages.items[0]).toMatchObject({ canReply: false, canForward: true, canReact: true });
 } finally { thread.status = "open"; thread.statusRevision = 0; }
});
