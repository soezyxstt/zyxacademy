import { afterAll, expect, mock, test } from "bun:test";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client } = await createPostgresTestDb();
let queries = 0;
const db = drizzle(client, { schema, logger: { logQuery: () => { queries++; } } });
mock.module("@/db", () => ({ db }));
const { notificationVisibility } = await import("@/lib/notifications/discussion-history");
afterAll(() => client.close());

async function visible(userId: string, viewerId = userId) {
 const predicate = await notificationVisibility(userId, viewerId);
 return db.select({ id: schema.notifications.id }).from(schema.notifications)
  .where(and(eq(schema.notifications.userId, userId), predicate)).orderBy(schema.notifications.id);
}

test("history applies current batched course, private-channel, tutor and report authorization", async () => {
 await db.insert(schema.peran).values([{ id: "student-role", code: "murid" }, { id: "tutor-role", code: "tutor" }, { id: "admin-role", code: "admin" }]);
 for (const [id, role] of [["alice", "student"], ["bob", "student"], ["tutor", "tutor"], ["admin", "admin"]] as const) {
  await db.insert(schema.user).values({ id, name: id, email: `${id}@example.test`, role: role === "tutor" ? "teacher" : role });
  await db.insert(schema.pengguna).values({ id, status: "active" });
  await db.insert(schema.penggunaPeran).values({ id: `membership-${id}`, penggunaId: id, peranId: `${role}-role`, source: "test" });
 }
 await db.insert(schema.courses).values([{ id: "legacy-a", title: "A", category: "Matematika" }, { id: "legacy-b", title: "B", category: "Fisika" }]);
 await db.insert(schema.mataKuliah).values([{ id: "course-a", code: "A", title: "A", legacyCourseId: "legacy-a" }, { id: "course-b", code: "B", title: "B", legacyCourseId: "legacy-b" }]);
 await db.insert(schema.enrollments).values({ id: "enroll-alice", userId: "alice", courseId: "legacy-a", expiresAt: new Date("2099-01-01") });
 await db.insert(schema.penugasanTutor).values({ id: "assignment", penggunaId: "tutor", mataKuliahId: "course-a", status: "active", assignmentScope: "course" });
 await db.insert(schema.discussionChannels).values([
  { id: "global", kind: "global", title: "Global" },
  { id: "channel-a", kind: "course", title: "A", courseId: "course-a", legacyCourseId: "legacy-a" },
  { id: "channel-b", kind: "course", title: "B", courseId: "course-b", legacyCourseId: "legacy-b" },
  { id: "private-tech", kind: "technical", title: "Tech", requesterId: "alice", courseId: "course-a", legacyCourseId: "legacy-a" },
  { id: "private-academic", kind: "academic", title: "Academic", requesterId: "alice", courseId: "course-a", legacyCourseId: "legacy-a" },
  { id: "private-other", kind: "technical", title: "Other", requesterId: "bob" },
 ]);
 await db.insert(schema.notifications).values([
  ...["global", "channel-a", "channel-b", "private-tech", "private-other"].map(id => ({ id: `alice-${id}`, userId: "alice", type: "discussion" as const, title: "Activity", body: "Activity", metadata: { channelId: id } })),
  ...["channel-a", "channel-b", "private-tech", "private-academic"].map(id => ({ id: `tutor-${id}`, userId: "tutor", type: "discussion" as const, title: "Activity", body: "Activity", metadata: { channelId: id } })),
  { id: "admin-report", userId: "admin", type: "discussion", title: "Activity", body: "Activity", metadata: { channelId: "global", eventKind: "report" } },
 ]);
 expect((await visible("alice")).map(row => row.id)).toEqual(["alice-channel-a", "alice-global", "alice-private-tech"]);
 expect((await visible("alice", "admin")).map(row => row.id)).toEqual(["alice-channel-a", "alice-global", "alice-private-tech"]);
 expect((await visible("tutor")).map(row => row.id)).toEqual(["tutor-channel-a", "tutor-private-academic"]);
 expect((await visible("admin")).map(row => row.id)).toEqual(["admin-report"]);
 expect(await visible("admin", "alice")).toEqual([]);
 await db.update(schema.penggunaPeran).set({ peranId: "student-role" }).where(eq(schema.penggunaPeran.id, "membership-admin"));
 expect(await visible("admin")).toEqual([]);
 await db.update(schema.penugasanTutor).set({ status: "revoked" }).where(eq(schema.penugasanTutor.id, "assignment"));
 expect(await visible("tutor")).toEqual([]);
 await db.insert(schema.mataKuliah).values({ id: "ambiguous", code: "AMB", title: "Ambiguous", legacyCourseId: "legacy-a" });
 expect((await visible("alice")).map(row => row.id)).toEqual(["alice-global"]);
 await db.delete(schema.mataKuliah).where(eq(schema.mataKuliah.id, "ambiguous"));
 await db.update(schema.enrollments).set({ expiresAt: new Date("2000-01-01") }).where(eq(schema.enrollments.id, "enroll-alice"));
 expect((await visible("alice")).map(row => row.id)).toEqual(["alice-global"]);

 queries = 0;
 await visible("alice");
 const before = queries;
 await db.insert(schema.notifications).values(Array.from({ length: 300 }, (_, i) => ({
  id: `historical-${i}`, userId: "alice", type: "discussion" as const, title: "Activity", body: "Activity",
  metadata: { channelId: `missing-${i}` },
 })));
 queries = 0;
 await visible("alice");
 expect(queries).toBe(before);
 expect(queries).toBeLessThan(30);
 expect(Number((await db.select({ count: sql<number>`count(*)` }).from(schema.notifications)
  .where(and(eq(schema.notifications.userId, "alice"), await notificationVisibility("alice", "alice"))))[0].count)).toBe(1);
}, 120_000);
