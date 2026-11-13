import { afterAll, expect, mock, test } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
mock.module("@/db", () => ({ db: testDb }));
const { resolveCourseAccess, resolveCourseAccessBatch, canAccessCourseContent } = await import("@/lib/student/course-access");
afterAll(() => client.close());

test("archived canonical chapters never reappear through published legacy chapters", async () => {
  await testDb.insert(schema.user).values({ id: "scope-student", name: "Student", email: "scope@test.local", role: "student" });
  await testDb.insert(schema.pengguna).values({ id: "scope-student" });
  await testDb.insert(schema.courses).values(["archived", "mixed", "absent"].map((id) => ({ id: `legacy-${id}`, title: id, category: "Fisika" as const })));
  await testDb.insert(schema.mataKuliah).values(["archived", "mixed", "absent"].map((id) => ({ id: `canonical-${id}`, code: id, title: id, legacyCourseId: `legacy-${id}`, pricingCategory: "limited_time_free" as const, freeStartsAt: new Date("2020-01-01Z"), freeEndsAt: new Date("2020-01-02Z") })));
  await testDb.insert(schema.chapters).values(["archived", "mixed", "absent"].map((id) => ({ id: `old-${id}`, courseId: `legacy-${id}`, title: id, orderIndex: 1, status: "published" as const })));
  await testDb.insert(schema.bab).values([
    { id: "archived-bab", mataKuliahId: "canonical-archived", code: "A", title: "Archived", orderIndex: 1, legacyChapterId: "old-archived", status: "archived" },
    { id: "mixed-archived", mataKuliahId: "canonical-mixed", code: "A", title: "Archived", orderIndex: 1, legacyChapterId: "old-mixed", status: "archived" },
    { id: "mixed-active", mataKuliahId: "canonical-mixed", code: "B", title: "Active", orderIndex: 2 },
  ]);
  const ids = ["canonical-archived", "legacy-archived", "canonical-mixed", "legacy-mixed", "canonical-absent", "legacy-absent"];
  for (const now of [new Date("2020-01-01T12:00:00Z"), new Date("2020-01-02T00:00:00Z")]) {
    const batch = await resolveCourseAccessBatch("scope-student", ids, { now, executor: testDb });
    for (const id of ids) expect(batch.get(id)).toEqual(await resolveCourseAccess({ courseId: id, userId: "scope-student", now }, testDb));
    for (const id of ["canonical-archived", "legacy-archived"]) {
      const access = batch.get(id)!;
      expect(access.scopedChapterIds).toEqual([]);
      expect(access.freeChapterIds).toEqual([]);
      expect(canAccessCourseContent(access, "article", ["old-archived"])).toBe(false);
    }
    const mixed = batch.get("legacy-mixed")!;
    expect(canAccessCourseContent(mixed, "article", ["old-mixed"])).toBe(false);
    expect(canAccessCourseContent(mixed, "article", ["mixed-active"])).toBe(true);
    expect(canAccessCourseContent(batch.get("legacy-absent")!, "article", ["old-absent"])).toBe(true);
  }
  await testDb.update(schema.mataKuliah).set({ pricingCategory: "free", freeStartsAt: null, freeEndsAt: null }).where(eq(schema.mataKuliah.id, "canonical-archived"));
  const free = await resolveCourseAccess({ courseId: "legacy-archived", userId: "scope-student", now: new Date("2020-01-02Z") }, testDb);
  expect(free.hasFullContentAccess).toBe(true);
  expect(canAccessCourseContent(free, "article", ["old-archived"])).toBe(false);
  await testDb.update(schema.mataKuliah).set({ pricingCategory: "limited_time_free", freeStartsAt: new Date("2020-01-01Z"), freeEndsAt: new Date("2020-01-02Z") }).where(eq(schema.mataKuliah.id, "canonical-archived"));
  await testDb.insert(schema.pendaftaranMurid).values({ id: "scope-paid", penggunaId: "scope-student", mataKuliahId: "canonical-archived", status: "active" });
  const paid = await resolveCourseAccess({ courseId: "legacy-archived", userId: "scope-student", now: new Date("2020-01-02Z") }, testDb);
  expect(paid.tier).toBe("enrolled");
  expect(canAccessCourseContent(paid, "article", ["old-archived"])).toBe(false);
  expect((await resolveCourseAccessBatch("scope-student", ids, { now: new Date("2020-01-02Z"), executor: testDb })).get("legacy-archived")).toEqual(paid);
});
