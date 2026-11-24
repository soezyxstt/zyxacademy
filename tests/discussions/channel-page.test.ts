import { expect, mock, test } from "bun:test";
import { and, getTableName, sql, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();
const courses = Array.from({ length: 120 }, (_, index) => {
 const n = String(index).padStart(3, "0");
 return { id: `c-${n}`, kind: "course" as const, title: `Picker ${n}`, courseId: `course-${n}`, legacyCourseId: `legacy-${n}`, requesterId: null, countRevision: 0 };
});
const privateChannels = Array.from({ length: 300 }, (_, index) => ({
 id: `private-${index}`, kind: "academic" as const, title: `Picker private ${index}`, courseId: null, legacyCourseId: null, requesterId: "other", countRevision: 0,
}));
const denied = new Set(["c-005", "c-012"]);
const all = [...privateChannels, ...courses];
const candidateReads: number[] = [];
const metadataSizes: number[] = [];
const candidateConditions: Array<{ sql: string; params: unknown[] }> = [];
let viewerRole: "student" | "admin" = "admin";

class Query {
 table = "";
 condition: unknown;
 constructor(readonly selection: Record<string, unknown> | undefined) {}
 from(table: Parameters<typeof getTableName>[0]) { this.table = getTableName(table); return this; }
 leftJoin() { return this; }
 where(value: unknown) { this.condition = value; return this; }
 orderBy() { return this; }
 groupBy() { return this; }
 rows(limit?: number) {
  if (this.table !== "discussion_channels") return [];
  const compiled = dialect.sqlToQuery(this.condition as never);
  if (this.selection && "channel" in this.selection) {
   const ids = compiled.params.filter(value => typeof value === "string" && value.startsWith("c-"));
   metadataSizes.push(ids.length);
   return courses.filter(row => ids.includes(row.id)).map(channel => ({ channel, muted: false }));
  }
  if (this.selection && "id" in this.selection) {
   const ids = compiled.params.flat().filter((value): value is string => typeof value === "string");
   return all.filter(row => ids.includes(row.id) && !denied.has(row.id)).map(row => ({ id: row.id }));
  }
  candidateConditions.push(compiled);
  const allowedKinds: readonly string[] = /"kind" in /i.test(compiled.sql) ? compiled.params.filter((value): value is string => value === "global" || value === "course") : [];
  const cursor = compiled.params.filter(value => typeof value === "string" && /^c-\d+$/.test(value)).at(-1) as string | undefined;
  const rows = all.filter(row => !denied.has(row.id) && (!allowedKinds.length || allowedKinds.includes(row.kind)) && (!cursor || row.id > cursor))
   .sort((a, b) => a.kind.localeCompare(b.kind) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)).slice(0, limit);
  candidateReads.push(rows.length);
  return rows;
 }
 async limit(limit: number) { return this.rows(limit); }
 then(resolve: (rows: unknown[]) => unknown, reject?: (error: unknown) => unknown) { return Promise.resolve(this.rows()).then(resolve, reject); }
}
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db: {
 select: (selection?: unknown) => new Query(selection as Record<string, unknown> | undefined),
 insert: () => { throw new Error("unexpected provisioning"); },
 update: () => { throw new Error("unexpected alias repair"); },
} }));
mock.module("@/lib/student/course-access", () => ({ resolveCourseAccess: async () => ({}) }));
mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() }));
mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
mock.module("@/lib/discussions/access", () => ({
 discussionChannelCandidateScope: () => undefined,
 getDiscussionActor: async (id: string) => ({ id, role: viewerRole }),
 getDiscussionChannelVisibility: async (_id: string, options: { scope?: SQL }) => ({ predicate: and(options.scope, sql`true`) }),
 getAccessibleDiscussionChannels: async (_actorId: string, options: { channelIds: string[] }) =>
  all.filter(row => options.channelIds.includes(row.id) && !denied.has(row.id)),
 resolveDiscussionCourses: async () => new Map(),
 requireDiscussionChannelAccess: async () => ({}), requireDiscussionCourse: async () => ({}),
 requireDiscussionMessageAccess: async () => ({}), requireDiscussionThreadAccess: async () => ({}),
}));
const { listChannelsPage, listChannelMetadataPage } = await import("@/lib/discussions/service");

test("kind filtering precedes limits and searched pages read only enough candidates", async () => {
 const first = await listChannelsPage("viewer", { search: "Picker", kinds: ["global", "course"], limit: 50 });
 expect(first.items).toHaveLength(50);
 expect(first.items.every(item => item.kind === "course" && !denied.has(item.id))).toBe(true);
 expect(candidateReads.reduce((sum, value) => sum + value, 0)).toBe(51);
 expect(metadataSizes).toEqual([31, 19]);
 expect(first.nextCursor).not.toBeNull();
 const second = await listChannelsPage("viewer", { search: "Picker", kinds: ["global", "course"], limit: 50, cursor: first.nextCursor! });
 expect(second.items).toHaveLength(50);
 expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(100);
 const picker = await listChannelsPage("viewer", { kinds: ["global", "course"], limit: 1 });
 expect(picker.items.map(item => item.id)).toEqual(["c-000"]);
 await expect(listChannelsPage("viewer", { kinds: ["course", "course"] })).rejects.toThrow("DISCUSSION_INVALID");
});

test("searches course labels in the SQL predicate before limiting without team scopes", async () => {
 candidateConditions.length = 0;
 await listChannelsPage("viewer", { search: "Nadia_%", limit: 1 });
 const adminQuery = candidateConditions[0];
 expect(adminQuery.sql).not.toContain('from "user" requester');
 expect(adminQuery.sql).toContain('from "mata_kuliah" course');
 expect(adminQuery.sql).toContain('from "courses" course');
 expect(adminQuery.sql).toContain('not exists (select 1 from "mata_kuliah" canonical');
 expect(adminQuery.params).toContain("%Nadia\\_\\%%");
 expect(adminQuery.params).not.toContain("academic");
 expect(adminQuery.params).not.toContain("technical");
 viewerRole = "student";
 candidateConditions.length = 0;
 try {
  await listChannelsPage("viewer", { search: "Matematika I", limit: 1 });
  expect(candidateConditions[0].sql).not.toContain('from "user" requester');
  expect(candidateConditions[0].sql).toContain('from "mata_kuliah" course');
 } finally { viewerRole = "admin"; }
});

test("workspace catalog omits aggregates while retaining authorized channels and mute preferences", async () => {
 candidateReads.length = 0;
 const page = await listChannelMetadataPage("viewer", { search: "Picker", kinds: ["global", "course"], limit: 10 });
 expect(page.items).toHaveLength(10);
 expect(page.items.map(item => item.id)).not.toContain("c-005");
 expect(page.items[0]).toEqual({ id: "c-000", kind: "course", courseId: "course-000", title: "Picker 000", muted: false });
 expect(page.nextCursor).not.toBeNull();
 expect(candidateReads).toEqual([11]);
});
