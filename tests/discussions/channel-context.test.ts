import { expect, mock, test } from "bun:test";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const rows = [
  { id: "general", kind: "global", title: "Umum", courseId: null, legacyCourseId: null, requesterId: null },
  { id: "math", kind: "course", title: "Matematika I", courseId: "canonical", legacyCourseId: "legacy", requesterId: null },
  { id: "technical", kind: "technical", title: "Tim teknis", courseId: "canonical", legacyCourseId: "legacy", requesterId: "bob" },
  { id: "denied", kind: "course", title: "Fisika", courseId: "other", legacyCourseId: null, requesterId: null },
];
let courseBatches = 0;
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
  getAccessibleDiscussionChannels: async (_actor: string, options: { channelIds: string[] }) => rows.filter(row =>
    options.channelIds.includes(row.id) && (row.kind === "global" || (row.kind === "course" && row.id !== "denied" && !revoked))),
  resolveDiscussionCourses: async (_actor: unknown, ids: string[]) => {
    courseBatches++;
    return new Map(ids.map(id => [id, { canonicalCourseId: "canonical", legacyCourseId: "legacy", courseTitle: "Matematika I", hasFullContentAccess: !revoked }]));
  },
}));
const { listChannels } = await import("@/lib/discussions/service");

test("authorized channels exclude private team scopes and hide legacy identifiers", async () => {
  courseBatches = 0;
  const student = await listChannels("alice", rows.map(row => row.id));
  expect(student.map(row => row.id)).toEqual(["general", "math"]);
  expect(student).toMatchObject([{ kind: "global", courseId: null }, { kind: "course", courseId: "canonical" }]);
  expect(student.every(row => !("requesterName" in row))).toBe(true);
  expect(courseBatches).toBe(0);
  expect(JSON.stringify(student)).not.toContain("requesterId");
  expect(JSON.stringify(student)).not.toContain("legacy");
  revoked = true;
  try {
    const afterRevocation = await listChannels("admin", rows.map(row => row.id));
    expect(afterRevocation.map(row => row.id)).toEqual(["general"]);
  } finally { revoked = false; }
});
