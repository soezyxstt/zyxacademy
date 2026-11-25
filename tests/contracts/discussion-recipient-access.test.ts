import { afterAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb: db } = await createPostgresTestDb();
mock.module("@/db", () => ({ db }));
const { canAccessDiscussionChannel } = await import("@/lib/discussions/access");
const { getDiscussionRecipientAccess } = await import("@/lib/discussions/recipient-access");

afterAll(async () => {
 await client.close();
});

test("bounded recipient access matches current single-user channel authorization", async () => {
 await db.insert(schema.peran).values([
  { id: "student-role", code: "murid" }, { id: "tutor-role", code: "tutor" }, { id: "admin-role", code: "admin" },
 ]);
 const users = ["alice", "bob", "tutor", "admin", "suspended", "dual"];
 await db.insert(schema.user).values(users.map(id => ({ id, name: id, email: `${id}@example.test` })));
 await db.insert(schema.pengguna).values(users.map(id => ({ id, status: id === "suspended" ? "suspended" as const : "active" as const })));
 await db.insert(schema.penggunaPeran).values(users.map(id => ({
  id: `membership-${id}`, penggunaId: id, peranId: id === "tutor" || id === "dual" ? "tutor-role" : id === "admin" ? "admin-role" : "student-role", source: "test",
 })));
 await db.insert(schema.penggunaPeran).values({ id: "membership-dual-admin", penggunaId: "dual", peranId: "admin-role", source: "test" });
 await db.insert(schema.courses).values([
  { id: "legacy", title: "Course", category: "Matematika" }, { id: "tutorial-pka", title: "PKA", category: "TPB" },
 ]);
 await db.insert(schema.mataKuliah).values([
  { id: "canonical", code: "COURSE", title: "Course", legacyCourseId: "legacy" },
  { id: "pka-canonical", code: "PKA", title: "PKA", legacyCourseId: "tutorial-pka", pricingCategory: "free" },
 ]);
 await db.insert(schema.enrollments).values({ id: "alice-enrollment", userId: "alice", courseId: "legacy", expiresAt: new Date("2099-01-01") });
 await db.insert(schema.penugasanTutor).values({ id: "assignment", penggunaId: "tutor", mataKuliahId: "canonical", status: "active", assignmentScope: "course" });
 await db.insert(schema.discussionChannels).values([
  { id: "global", kind: "global", title: "Global" },
  { id: "course", kind: "course", title: "Course", courseId: "canonical", legacyCourseId: "legacy" },
  { id: "technical", kind: "technical", title: "Technical", requesterId: "alice", courseId: "canonical", legacyCourseId: "legacy" },
  { id: "academic", kind: "academic", title: "Academic", requesterId: "alice", courseId: "canonical", legacyCourseId: "legacy" },
  { id: "pka", kind: "course", title: "PKA", courseId: "pka-canonical", legacyCourseId: "tutorial-pka" },
 ]);
 async function compare(channel: string) {
  const expected = (await Promise.all(users.map(async id => await canAccessDiscussionChannel(id, channel) ? id : null))).filter((id): id is string => Boolean(id)).sort();
  const actual = [...(await getDiscussionRecipientAccess(channel, users)).keys()].sort();
  expect(actual).toEqual(expected);
 }
 for (const channel of ["global", "course", "technical", "academic", "pka"]) await compare(channel);
 expect((await getDiscussionRecipientAccess("technical", users)).size).toBe(0);
 expect((await getDiscussionRecipientAccess("academic", users)).size).toBe(0);
 expect((await getDiscussionRecipientAccess("global", users)).get("dual")?.role).toBe("admin");
 await db.insert(schema.tutorCourses).values({ id: "legacy-assignment", tutorId: "tutor", courseId: "legacy" });
 await db.update(schema.penugasanTutor).set({ status: "revoked" }).where(eq(schema.penugasanTutor.id, "assignment"));
 await compare("course");
 expect((await getDiscussionRecipientAccess("course", users)).has("tutor")).toBe(false);
 await db.delete(schema.penugasanTutor).where(eq(schema.penugasanTutor.id, "assignment"));
 await compare("course");
 expect((await getDiscussionRecipientAccess("course", users)).has("tutor")).toBe(true);
 await db.insert(schema.mataKuliah).values({ id: "ambiguous", code: "AMB", title: "Ambiguous", legacyCourseId: "legacy" });
 await compare("course");
 expect((await getDiscussionRecipientAccess("course", users)).size).toBe(0);
 await db.delete(schema.mataKuliah).where(eq(schema.mataKuliah.id, "ambiguous"));
 await db.insert(schema.enrollments).values({ id: "pka-alice", userId: "alice", courseId: "tutorial-pka", expiresAt: new Date("2000-01-01") });
 await compare("pka");
 expect((await getDiscussionRecipientAccess("pka", users)).has("alice")).toBe(true);
 expect((await getDiscussionRecipientAccess("pka", users)).has("admin")).toBe(true);
 expect((await getDiscussionRecipientAccess("pka", users)).has("bob")).toBe(false);
 expect((await getDiscussionRecipientAccess("pka", users)).has("tutor")).toBe(false);
 await db.insert(schema.penugasanTutor).values({ id: "pka-assignment", penggunaId: "tutor", mataKuliahId: "pka-canonical", status: "active", assignmentScope: "course" });
 expect((await getDiscussionRecipientAccess("pka", users)).has("tutor")).toBe(true);
 await compare("pka");
 await expect(getDiscussionRecipientAccess("global", Array.from({ length: 101 }, () => "alice"))).rejects.toThrow("DISCUSSION_UNAVAILABLE");
}, 120_000);
