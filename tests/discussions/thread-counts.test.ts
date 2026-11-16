import { expect, mock, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

let countsSelection: Record<string, unknown> | undefined;
const thread = { id: "thread", channelId: "channel", authorId: "author", title: "Question", status: "open", labels: [], helpKind: null,
 createdAt: new Date("2026-01-01T00:00:00Z"), lastActivityAt: new Date("2026-01-01T00:00:00Z") };
const db = { select: (selection: Record<string, unknown>) => {
 if ("answerCount" in selection) countsSelection = selection;
 const result = "thread" in selection ? [{ thread, cursorAt: "2026-01-01T00:00:00Z" }]
  : [{ threadId: "thread", answerCount: 3, unreadCount: 2 }];
 const query = {
  from() { return this; }, leftJoin() { return this; }, where() { return this; }, orderBy() { return this; },
  async limit() { return result; },
  then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) { return Promise.resolve(result).then(resolve, reject); },
 };
 return query;
} };
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: async () => ({}) }));
mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() }));
mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
mock.module("@/lib/discussions/access", () => ({
 discussionChannelCandidateScope: () => undefined, getDiscussionActor: async (id: string) => ({ id, role: "student" }),
 getDiscussionChannelVisibility: async () => ({}), getAccessibleDiscussionChannels: async () => [{ id: "channel" }],
 resolveDiscussionCourses: async () => new Map(), requireDiscussionChannelAccess: async () => ({}), requireDiscussionCourse: async () => ({}),
 requireDiscussionMessageAccess: async () => ({}), requireDiscussionThreadAccess: async () => ({}),
}));
const { listThreads } = await import("@/lib/discussions/service");

test("thread refresh reads the maintained answer total and counts only the unread sequence range", async () => {
 const page = await listThreads("viewer", "channel");
 expect(page.items[0]).toMatchObject({ answerCount: 3, unreadCount: 2 });
 expect(countsSelection?.answerCount).toBe(schema.discussionThreads.answerCount);
 const unread = new PgDialect().sqlToQuery(countsSelection!.unreadCount as never);
 expect(unread.sql).toContain("m.seq > coalesce");
 expect(unread.sql).toContain("m.deleted_at is null");
 expect(unread.sql).toContain("m.author_id is distinct from");
});
