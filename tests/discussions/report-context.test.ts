import { expect, mock, test } from "bun:test";

const at = new Date("2026-01-01T00:00:00Z");
const channel = { id: "destination", kind: "course", courseId: "course", legacyCourseId: "legacy" };
const global = { id: "global", kind: "global", courseId: null, legacyCourseId: null };
const privateChannel = { id: "private", kind: "technical", courseId: null, legacyCourseId: null };
const revoked = { id: "revoked", kind: "course", courseId: "course", legacyCourseId: "legacy" };
const messages = [
 { id: "normal", threadId: "t", authorId: "alice", kind: "human", messageType: "answer", body: "A".repeat(3000), seq: 1, deletedAt: null, forwardedFromId: null },
 { id: "deleted", threadId: "t", authorId: "alice", kind: "human", messageType: "answer", body: "DELETED SECRET", seq: 2, deletedAt: at, forwardedFromId: null },
 { id: "allowed", threadId: "t", authorId: "alice", kind: "human", messageType: "forward", body: "", seq: 3, deletedAt: null, forwardedFromId: "source-allowed" },
 { id: "private-forward", threadId: "t", authorId: "alice", kind: "human", messageType: "forward", body: "", seq: 4, deletedAt: null, forwardedFromId: "source-private" },
 { id: "revoked-forward", threadId: "t", authorId: "alice", kind: "human", messageType: "forward", body: "", seq: 5, deletedAt: null, forwardedFromId: "source-revoked" },
 { id: "image", threadId: "t", authorId: "alice", kind: "human", messageType: "answer", body: "", seq: 6, deletedAt: null, forwardedFromId: null },
 { id: "unknown-author", threadId: "t", authorId: null, kind: "human", messageType: "answer", body: "Authored content", seq: 7, deletedAt: null, forwardedFromId: null },
 { id: "authored-placeholder", threadId: "t", authorId: "alice", kind: "human", messageType: "answer", body: "Pesan asal tidak tersedia.", seq: 8, deletedAt: null, forwardedFromId: null },
];
const sources = [
 { id: "source-allowed", body: "B".repeat(3000), deletedAt: null, messageType: "answer", channel: global },
 { id: "source-private", body: "PRIVATE SECRET", deletedAt: null, messageType: "question", channel: privateChannel },
 { id: "source-revoked", body: "REVOKED SECRET", deletedAt: null, messageType: "question", channel: revoked },
];
const reportRows = messages.map(message => ({ report: { id: `report-${message.id}`, messageId: message.id, reason: "Review", status: "pending", createdAt: at }, reporter: { id: "reporter", name: "Reporter" }, channel, thread: { id: "t", title: "Reported thread" }, message }));
let authorQueries = 0, sourceQueries = 0;
const db = { select: (selection: Record<string, unknown>) => {
 const result = "report" in selection ? reportRows : "body" in selection ? (sourceQueries++, sources) : (authorQueries++, [{ id: "alice", name: "Alice" }]);
 const query = {
  from() { return this; }, innerJoin() { return this; }, where() { return this; }, orderBy() { return this; },
  async limit() { return result; },
  then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve(result).then(resolve, reject); },
 };
 return query;
} };
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db }));
mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() }));
mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
mock.module("@/lib/discussions/access", () => ({
 discussionChannelsWithPendingReports: () => undefined,
 discussionChannelCandidateScope: () => undefined, getDiscussionChannelVisibility: async () => ({}), resolveDiscussionCourses: async () => new Map(),
 getDiscussionActor: async (id: string) => ({ id, role: id === "admin" ? "admin" : "student" }),
 getAccessibleDiscussionChannels: async () => [channel, global, privateChannel],
 requireDiscussionChannelAccess: async () => ({}), requireDiscussionCourse: async () => ({}), requireDiscussionThreadAccess: async () => ({}),
 requireDiscussionMessageAccess: async (_actor: unknown, id: string) => ({ channel, thread: { id: "t", title: "Reported thread" }, message: messages.find(message => message.id === id) }),
}));
const { listReports } = await import("@/lib/discussions/service");

test("report context is bounded, batched, and never exposes deleted or unauthorized sources", async () => {
 await expect(listReports("student")).rejects.toThrow("DISCUSSION_UNAVAILABLE");
 const page = await listReports("admin");
 expect(page.items).toHaveLength(8);
 expect(page.items[0]).toMatchObject({ threadTitle: "Reported thread", message: { body: "A".repeat(2000), seq: 1, deleted: false, authorName: "Alice" } });
 expect(page.items[1].message).toEqual({ body: "Pesan dihapus.", seq: 2, deleted: true, authorName: "Pesan dihapus", bodyKind: "deleted", authorKind: "deleted" });
 expect(page.items[2].message.body).toBe("B".repeat(2000));
 expect(page.items[3].message.body).toBe("Pesan asal tidak tersedia.");
 expect(page.items[4].message.body).toBe("Pesan asal tidak tersedia.");
 expect(page.items[4].message.bodyKind).toBe("source_unavailable");
 expect(page.items[5].message.bodyKind).toBe("image");
 expect(page.items[6].message.authorKind).toBe("unavailable");
 expect(page.items[7].message).toMatchObject({ body: "Pesan asal tidak tersedia.", bodyKind: "body", authorKind: "name" });
 expect(JSON.stringify(page)).not.toContain("SECRET");
 expect([authorQueries, sourceQueries]).toEqual([1, 1]);
});
