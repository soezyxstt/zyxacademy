import { expect, mock, test } from "bun:test";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const rows = [
  { id: "general", kind: "academic", title: "Tim akademik", courseId: null, legacyCourseId: null, requesterId: "alice" },
  { id: "math", kind: "academic", title: "Tim akademik", courseId: "canonical", legacyCourseId: "legacy", requesterId: "alice" },
  { id: "technical", kind: "technical", title: "Tim teknis", courseId: "canonical", legacyCourseId: "legacy", requesterId: "bob" },
  { id: "denied", kind: "academic", title: "Tim akademik", courseId: "other", legacyCourseId: null, requesterId: "bob" },
];
const users = [{ id: "alice", name: "Alice" }, { id: "bob", name: "Bob" }];
let projectionReads = 0, courseBatches = 0;
let revoked = false;
const dialect = new PgDialect();

class Query {
  table = ""; condition: unknown;
  from(table: Parameters<typeof getTableName>[0]) { this.table = getTableName(table); return this; }
  leftJoin() { return this; }
  where(value: unknown) { this.condition = value; return this; }
  orderBy() { return this; }
  then(resolve: (value: unknown[]) => void) {
    const params = dialect.sqlToQuery(this.condition as never).params;
    if (this.table === "discussion_channels") return resolve(rows.filter(row => params.includes(row.id)).map(channel => ({ channel, muted: false, unreadThreads: 0, activeThreads: 0 })));
    if (this.table === "user") { projectionReads++; return resolve(users.filter(row => params.includes(row.id))); }
    throw new Error(`Unexpected table ${this.table}`);
  }
}
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: { select: () => new Query() } }));
mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() }));
mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
mock.module("@/lib/discussions/participants", () => ({ recordDiscussionParticipant: async () => {} }));
mock.module("@/lib/discussions/read-receipt", () => ({ signDiscussionReadReceipt: () => "", verifyDiscussionReadReceipt: () => null }));
mock.module("@/lib/discussions/access", () => ({
  getDiscussionChannelVisibility: async () => ({}), requireDiscussionChannelAccess: async () => ({}), requireDiscussionCourse: async () => ({}),
  requireDiscussionMessageAccess: async () => ({}), requireDiscussionThreadAccess: async () => ({}),
  getDiscussionActor: async (id: string) => ({ id, role: id === "alice" ? "student" : id }),
  getAccessibleDiscussionChannels: async (actor: string, options: { channelIds: string[] }) => rows.filter(row => options.channelIds.includes(row.id) && row.id !== "denied" &&
    (actor === "admin" || actor === "tutor" && row.kind === "academic" || actor === row.requesterId)),
  resolveDiscussionCourses: async (_actor: unknown, ids: string[]) => {
    courseBatches++;
    return new Map(ids.map(id => [id, { canonicalCourseId: "canonical", legacyCourseId: "legacy", courseTitle: "Matematika I", hasFullContentAccess: !revoked }]));
  },
}));
const { listChannels } = await import("@/lib/discussions/service");

test("private context is projected in batches only for reauthorized channels", async () => {
  projectionReads = courseBatches = 0;
  const student = await listChannels("alice", rows.map(row => row.id));
  expect(student.map(row => row.id)).toEqual(["general", "math"]);
  expect(student).toMatchObject([{ courseTitle: null, isRequester: true }, { courseTitle: "Matematika I", isRequester: true }]);
  expect(student.every(row => !("requesterName" in row))).toBe(true);
  expect(projectionReads).toBe(0);
  expect(courseBatches).toBe(1);

  projectionReads = courseBatches = 0;
  const staff = await listChannels("admin", rows.map(row => row.id));
  expect(staff.map(row => row.id)).toEqual(["general", "math", "technical"]);
  expect(staff).toMatchObject([{ requesterName: "Alice", isRequester: false }, { requesterName: "Alice", courseTitle: "Matematika I" }, { requesterName: "Bob", courseTitle: "Matematika I" }]);
  expect(projectionReads).toBe(1);
  expect(courseBatches).toBe(1);
  expect(JSON.stringify(staff)).not.toContain("requesterId");
  expect(JSON.stringify(staff)).not.toContain("legacy");
  revoked = true;
  try {
    const afterRevocation = await listChannels("admin", rows.map(row => row.id));
    expect(afterRevocation.map(row => row.id)).toEqual(["general"]);
    expect(JSON.stringify(afterRevocation)).not.toContain("Bob");
  } finally { revoked = false; }
});
