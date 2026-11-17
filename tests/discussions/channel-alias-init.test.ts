import { expect, mock, test } from "bun:test";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();
const channels = [
 { id: "global", kind: "global", title: "Global", courseId: null, legacyCourseId: null, requesterId: null, countRevision: 0 },
 { id: "academic", kind: "academic", title: "Academic", courseId: null, legacyCourseId: null, requesterId: "viewer", countRevision: 0 },
 { id: "technical", kind: "technical", title: "Technical", courseId: null, legacyCourseId: null, requesterId: "viewer", countRevision: 0 },
 { id: "growth", kind: "course", title: "Growth", courseId: "canonical", legacyCourseId: null, requesterId: null, countRevision: 0 },
 { id: "conflict-a", kind: "course", title: "Conflict", courseId: "canonical-conflict", legacyCourseId: null, requesterId: null, countRevision: 0 },
 { id: "conflict-b", kind: "course", title: "Conflict", courseId: null, legacyCourseId: "legacy-conflict", requesterId: null, countRevision: 0 },
];
const scopes = [
 { canonicalCourseId: "canonical", legacyCourseId: "legacy", courseTitle: "Growth", hasFullContentAccess: true },
 { canonicalCourseId: "canonical-conflict", legacyCourseId: "legacy-conflict", courseTitle: "Conflict", hasFullContentAccess: true },
];
let updates = 0;
class Query {
 table = "";
 condition: unknown;
 constructor(readonly selection: Record<string, unknown> | undefined) {}
 from(table: Parameters<typeof getTableName>[0]) { this.table = getTableName(table); return this; }
 leftJoin() { return this; }
 where(value: unknown) { this.condition = value; return this; }
 orderBy() { return this; }
 groupBy() { return this; }
 limit() { return this; }
 then(resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
  let rows: unknown[] = [];
  if (this.table === "mata_kuliah") rows = scopes.map(scope => ({ id: scope.canonicalCourseId }));
  else if (this.table === "courses") rows = scopes.map(scope => ({ id: scope.legacyCourseId }));
  else if (this.table === "discussion_channels") {
   if (this.selection && "channel" in this.selection) {
    const ids = dialect.sqlToQuery(this.condition as never).params;
    rows = channels.filter(channel => ids.includes(channel.id)).map(channel => ({ channel, muted: false }));
   } else if (this.selection && "id" in this.selection) {
    const ids = dialect.sqlToQuery(this.condition as never).params.flat();
    rows = channels.filter(channel => ids.includes(channel.id)).map(channel => ({ id: channel.id }));
   } else {
    rows = channels;
   }
  }
  return Promise.resolve(rows).then(resolve, reject);
 }
}
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: {
 select: (selection?: unknown) => new Query(selection as Record<string, unknown> | undefined),
 insert: () => { throw new Error("unexpected provisioning"); },
 update: () => ({ set: (values: { courseId: string; legacyCourseId: string }) => ({ where: async (condition: never) => {
  const params = dialect.sqlToQuery(condition).params;
  const channel = channels.find(row => params.includes(row.id));
  if (!channel) throw new Error("missing channel");
  Object.assign(channel, values); updates++;
 } }) }),
} }));
mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() }));
mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
mock.module("@/lib/discussions/access", () => ({
 discussionChannelCandidateScope: () => undefined, getDiscussionChannelVisibility: async () => ({}),
 requireDiscussionChannelAccess: async () => ({}), requireDiscussionCourse: async () => ({}),
 requireDiscussionMessageAccess: async () => ({}), requireDiscussionThreadAccess: async () => ({}),
 getDiscussionActor: async (id: string) => ({ id, role: "student" }),
 resolveDiscussionCourses: async (_actor: unknown, ids: string[]) => new Map(ids.flatMap(id => {
  const scope = scopes.find(row => row.canonicalCourseId === id || row.legacyCourseId === id);
  return scope ? [[id, scope]] : [];
 })),
 getAccessibleDiscussionChannels: async () => channels.filter(channel => channel.kind !== "course" || scopes.some(scope =>
  scope.canonicalCourseId === channel.courseId && scope.legacyCourseId === channel.legacyCourseId)),
}));
const { listChannels } = await import("@/lib/discussions/service");

test("initial catalog repairs an unambiguous canonical channel once without merging conflicting histories", async () => {
 const first = await listChannels("viewer");
 expect(first.some(channel => channel.id === "growth")).toBe(true);
 expect(channels.find(channel => channel.id === "growth")?.legacyCourseId).toBe("legacy");
 expect(channels.find(channel => channel.id === "conflict-a")?.legacyCourseId).toBeNull();
 expect(channels.find(channel => channel.id === "conflict-b")?.courseId).toBeNull();
 expect(first.some(channel => channel.id.startsWith("conflict-"))).toBe(false);
 await listChannels("viewer");
 expect(updates).toBe(1);
});
