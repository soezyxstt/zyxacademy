import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createDiscussionTestDb } from "./local-postgres";

const { client, testDb: db } = await createDiscussionTestDb();
mock.module("server-only", () => ({}));
mock.module("@/db", () => ({ db }));
mock.module("@/lib/db", () => ({ db }));
mock.module("@/lib/auth-secret", () => ({ resolveAuthSecret: () => "discussion-test-secret" }));
mock.module("@/lib/discussions/images", () => ({ attachDiscussionImages: async () => {}, listDiscussionAttachmentsForMessages: async () => new Map() }));
mock.module("@/lib/discussions/notifications", () => ({ clearDiscussionNotificationsThroughSeq: async () => {} }));
mock.module("@/lib/discussions/rewards", () => ({ enqueueDiscussionReward: async () => {} }));
const { listChannelsPage } = await import("@/lib/discussions/service");
afterAll(() => client.close());

beforeAll(async () => {
 await db.insert(schema.peran).values([{ id: "student-role", code: "murid" }, { id: "tutor-role", code: "tutor" }, { id: "admin-role", code: "admin" }]);
 const people = [
  { id: "admin", name: "Admin", role: "admin" }, { id: "tutor", name: "Tutor", role: "tutor" },
  { id: "nadia", name: "Nadia Putri", role: "student" }, { id: "other", name: "Nadia Dua", role: "student" },
  { id: "outsider", name: "Secret Person", role: "student" },
 ];
 await db.insert(schema.user).values(people.map(person => ({ id: person.id, name: person.name, email: `${person.id}@example.test` })));
 await db.insert(schema.pengguna).values(people.map(person => ({ id: person.id })));
 await db.insert(schema.penggunaPeran).values(people.map(person => ({ id: `${person.id}-role`, penggunaId: person.id, peranId: `${person.role}-role`, source: "test" })));
 await db.insert(schema.courses).values([
  { id: "legacy-math", title: "Old math name", category: "Matematika" },
  { id: "legacy-only", title: "Legacy Label", category: "Matematika" },
 ]);
 await db.insert(schema.mataKuliah).values([
  { id: "math", code: "MATH", title: "Matematika I", legacyCourseId: "legacy-math" },
  { id: "math-two", code: "MATH2", title: "Matematika Lanjut" },
 ]);
 await db.insert(schema.enrollments).values({ id: "legacy-nadia", userId: "nadia", courseId: "legacy-only", expiresAt: new Date("2099-01-01") });
 await db.insert(schema.penugasanTutor).values({ id: "math-tutor", penggunaId: "tutor", mataKuliahId: "math", status: "active", assignmentScope: "course" });
 await db.insert(schema.discussionChannels).values([
  { id: "course-math", kind: "course", title: "Kursus I", courseId: "math", legacyCourseId: "legacy-math" },
  { id: "course-math-two", kind: "course", title: "Kursus II", courseId: "math-two" },
  { id: "course-legacy", kind: "course", title: "Warisan", legacyCourseId: "legacy-only" },
  { id: "academic-nadia", kind: "academic", title: "Tim akademik", requesterId: "nadia", courseId: "math", legacyCourseId: "legacy-math" },
  { id: "technical-nadia", kind: "technical", title: "Tim teknis", requesterId: "nadia", courseId: "math", legacyCourseId: "legacy-math" },
  { id: "academic-other", kind: "academic", title: "Tim akademik", requesterId: "other", courseId: "math", legacyCourseId: "legacy-math" },
  { id: "technical-secret", kind: "technical", title: "Tim teknis", requesterId: "outsider", courseId: "math", legacyCourseId: "legacy-math" },
  { id: "technical-legacy", kind: "technical", title: "Tim teknis", requesterId: "nadia", legacyCourseId: "legacy-only" },
 ]);
}, 120_000);

describe("channel search", () => {
 test("private team channels are excluded while course channels paginate safely", async () => {
  expect((await listChannelsPage("admin", { search: "Nadia" })).items).toEqual([]);
  expect((await listChannelsPage("nadia", { search: "Nadia" })).items).toEqual([]);
  expect((await listChannelsPage("tutor", { search: "Nadia" })).items).toEqual([]);
  const ids: string[] = [];
  let cursor: string | undefined;
  for (let pageIndex = 0; pageIndex < 10; pageIndex++) {
   const page = await listChannelsPage("admin", { search: "Matematika", limit: 1, cursor });
   ids.push(...page.items.map(item => item.id));
   expect(JSON.stringify(page)).not.toContain("@example.test");
   expect(JSON.stringify(page)).not.toContain("requesterId");
   cursor = page.nextCursor ?? undefined;
   if (!cursor) break;
  }
  expect(cursor).toBeUndefined();
  expect(ids.sort()).toEqual(["course-math", "course-math-two"]);
  expect(new Set(ids).size).toBe(ids.length);
  expect((await listChannelsPage("admin", { search: "Matematika%" })).items).toEqual([]);
  expect((await listChannelsPage("nadia", { search: "Matematika" })).items).toEqual([]);
  expect((await listChannelsPage("tutor", { search: "Matematika" })).items.map(item => item.id)).toEqual(["course-math"]);
 });

 test("course labels use current canonical or legacy titles and retain course access rechecks", async () => {
  const adminMath = await listChannelsPage("admin", { search: "Matematika I" });
  expect(adminMath.items.map(item => item.id)).toEqual(["course-math"]);
  expect((await listChannelsPage("admin", { search: "Old math name" })).items).toEqual([]);
  const legacy = await listChannelsPage("nadia", { search: "Legacy Label" });
  expect(legacy.items.map(item => item.id)).toEqual(["course-legacy"]);
  await db.update(schema.penugasanTutor).set({ status: "revoked" }).where(eq(schema.penugasanTutor.id, "math-tutor"));
  try { expect((await listChannelsPage("tutor", { search: "Matematika I" })).items).toEqual([]); }
  finally { await db.update(schema.penugasanTutor).set({ status: "active" }).where(eq(schema.penugasanTutor.id, "math-tutor")); }
  await db.insert(schema.mataKuliah).values({ id: "conflict", code: "CONFLICT", title: "Other", legacyCourseId: "legacy-math", pricingCategory: "free" });
  try { expect((await listChannelsPage("admin", { search: "Matematika I" })).items).toEqual([]); }
  finally { await db.delete(schema.mataKuliah).where(eq(schema.mataKuliah.id, "conflict")); }
 }, 120_000);
});
