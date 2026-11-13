import { afterAll, describe, expect, it, mock } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@/db/schema";
import { createPostgresTestDb } from "../helpers/postgres";

const { client, testDb } = await createPostgresTestDb();
mock.module("@/db", () => ({ db: testDb }));
const { saveCourseWithCanonicalProjection } = await import("@/lib/academic/course-canonical-sync");
const { resolveStudentCourse, listStudentCourses } = await import("@/lib/student/course-catalog");
const { resolveCourseAccess, resolveCourseAccessBatch, canAccessCourseContent } = await import("@/lib/student/course-access");
const { canAccessStudentQuizTemplate } = await import("@/lib/quiz/student-access");
afterAll(() => client.close());

const start = new Date("2026-12-01T01:30:00Z");
const end = new Date("2026-12-02T01:30:00Z");
const limited = { category: "limited_time_free" as const, startsAt: start, endsAt: end };

describe("course pricing integration", () => {
  it("persists validated pricing, preserves omitted input, and enforces database constraints", async () => {
    await saveCourseWithCanonicalProjection({ id: "legacy", title: "Course", category: "Fisika", isNew: true });
    let [row] = await testDb.select().from(schema.mataKuliah).where(eq(schema.mataKuliah.id, "legacy"));
    expect([row.pricingCategory, row.freeStartsAt, row.freeEndsAt]).toEqual(["premium", null, null]);
    await saveCourseWithCanonicalProjection({ id: "legacy", title: "Course", category: "Fisika", isNew: false, pricing: limited });
    await saveCourseWithCanonicalProjection({ id: "legacy", title: "Updated", category: "Kimia", isNew: false });
    [row] = await testDb.select().from(schema.mataKuliah).where(eq(schema.mataKuliah.id, "legacy"));
    expect([row.pricingCategory, row.freeStartsAt, row.freeEndsAt]).toEqual([limited.category, start, end]);
    await expect(saveCourseWithCanonicalProjection({ id: "legacy", title: "Invalid", category: "Fisika", isNew: false, pricing: { ...limited, endsAt: start } })).rejects.toThrow();
    expect((await testDb.select().from(schema.courses).where(eq(schema.courses.id, "legacy")))[0].title).toBe("Updated");
    expect((await testDb.select().from(schema.courses).where(eq(schema.courses.id, "legacy")))[0].category).toBe("Kimia");
    for (const values of [
      { pricingCategory: "invalid" },
      { pricingCategory: "limited_time_free", freeStartsAt: start, freeEndsAt: null },
      { pricingCategory: "limited_time_free", freeStartsAt: end, freeEndsAt: start },
      { pricingCategory: "free", freeStartsAt: start },
    ]) {
      await expect(client.query("INSERT INTO mata_kuliah (id, code, title, pricing_category, free_starts_at, free_ends_at) VALUES ($1,$1,$1,$2,$3,$4)", [crypto.randomUUID(), values.pricingCategory, values.freeStartsAt ?? null, values.freeEndsAt ?? null])).rejects.toThrow();
    }
    await testDb.insert(schema.courses).values({ id: "old-only", title: "Old", category: "Biologi" });
    await testDb.insert(schema.courses).values({ id: "alias", title: "Alias", category: "Fisika" });
    await testDb.insert(schema.mataKuliah).values({ id: "canonical", code: "CAN", title: "Alias", legacyCourseId: "alias", pricingCategory: "free" });
    await saveCourseWithCanonicalProjection({ id: "alias", title: "Alias updated", category: "Fisika", isNew: false });
    expect((await resolveStudentCourse("canonical"))?.pricing.category).toBe("free");
    expect((await resolveStudentCourse("alias"))?.pricing.category).toBe("free");
    expect((await resolveStudentCourse("old-only"))?.pricing.category).toBe("premium");
    expect((await listStudentCourses()).find((course) => course.id === "legacy")?.pricing).toEqual(limited);
  });

  it("resolves full content at schedule boundaries without granting enrollment or extra AI quota", async () => {
    await testDb.insert(schema.peran).values([{ id: "role-murid", code: "murid" }, { id: "role-admin", code: "admin" }, { id: "role-tutor", code: "tutor" }]);
    for (const [id, role, status] of [["student", "murid", "active"], ["suspended", "murid", "suspended"], ["admin", "admin", "active"], ["tutor", "tutor", "active"]] as const) {
      await testDb.insert(schema.user).values({ id, name: id, email: `${id}@test.local`, role: role === "tutor" ? "teacher" : role === "murid" ? "student" : role });
      await testDb.insert(schema.pengguna).values({ id, status });
      await testDb.insert(schema.penggunaPeran).values({ id: `membership-${id}`, penggunaId: id, peranId: `role-${role}`, source: "test" });
    }
    await testDb.insert(schema.bab).values([
      { id: "chapter-1", mataKuliahId: "legacy", code: "01", title: "One", orderIndex: 1 },
      { id: "chapter-2", mataKuliahId: "legacy", code: "02", title: "Two", orderIndex: 2 },
    ]);
    for (const [instant, full] of [[new Date(start.getTime() - 1), false], [start, true], [new Date(end.getTime() - 1), true], [end, false], [new Date(end.getTime() + 1), false]] as const) {
      const single = await resolveCourseAccess({ courseId: "legacy", userId: "student", now: instant }, testDb);
      const batch = (await resolveCourseAccessBatch("student", ["legacy"], { now: instant, executor: testDb })).get("legacy");
      expect(batch).toEqual(single);
      expect(single.hasFullContentAccess).toBe(full);
      expect(single.isEnrolled).toBe(false);
      expect(single.tier).toBe("free");
      expect(single.capabilities.zyraDailyQuestionLimit).toBe(5);
      expect(canAccessCourseContent(single, "article", ["chapter-2"])).toBe(full);
      expect(canAccessCourseContent(single, "diktat", ["chapter-2"])).toBe(full);
      expect(canAccessCourseContent(single, "diktat-download", ["chapter-2"])).toBe(full);
      expect(canAccessCourseContent(single, "quiz", ["chapter-2"])).toBe(full);
      expect(canAccessCourseContent(single, "flashcard", ["chapter-2"])).toBe(full);
      expect(canAccessCourseContent(single, "zyra", ["chapter-2"])).toBe(full);
      expect(canAccessCourseContent(single, "article", ["foreign"])).toBe(false);
    }
    const chapterTwoQuiz = { status: "published", category: "chapter", visibility: "paid", selectionRules: { chapterId: "chapter-2" } } as typeof schema.quizTemplates.$inferSelect;
    const firstChapterPreview = { ...chapterTwoQuiz, visibility: "free", selectionRules: { chapterId: "chapter-1" } } as typeof schema.quizTemplates.$inferSelect;
    const active = await resolveCourseAccess({ courseId: "legacy", userId: "student", now: start }, testDb);
    const expired = await resolveCourseAccess({ courseId: "legacy", userId: "student", now: end }, testDb);
    expect(canAccessStudentQuizTemplate(active, chapterTwoQuiz)).toBe(true);
    expect(canAccessStudentQuizTemplate(active, { ...chapterTwoQuiz, selectionRules: { chapterId: "foreign" } })).toBe(false);
    expect(canAccessStudentQuizTemplate(expired, chapterTwoQuiz)).toBe(false);
    expect(canAccessStudentQuizTemplate(expired, firstChapterPreview)).toBe(true);
    expect(canAccessStudentQuizTemplate(active, { ...chapterTwoQuiz, status: "draft" })).toBe(false);
    expect(canAccessStudentQuizTemplate({ ...active, hasCourseAccess: false }, chapterTwoQuiz)).toBe(false);
    expect(canAccessStudentQuizTemplate(await resolveCourseAccess({ courseId: "legacy", userId: "suspended", now: start }, testDb), chapterTwoQuiz)).toBe(false);
    expect(canAccessStudentQuizTemplate(await resolveCourseAccess({ courseId: "legacy", now: start }, testDb), chapterTwoQuiz)).toBe(false);
    expect(canAccessCourseContent(active, "article", ["foreign"])).toBe(false);
    expect((await resolveCourseAccess({ courseId: "legacy", now: start }, testDb)).hasFullContentAccess).toBe(false);
    expect((await resolveCourseAccess({ courseId: "legacy", userId: "suspended", now: start }, testDb)).reason).toBe("USER_INACTIVE");
    expect((await resolveCourseAccess({ courseId: "legacy", userId: "tutor", now: start }, testDb)).hasFullContentAccess).toBe(false);
    expect((await resolveCourseAccess({ courseId: "legacy", userId: "admin", now: end }, testDb)).tier).toBe("staff");
    await testDb.insert(schema.pendaftaranMurid).values({ id: "paid", penggunaId: "student", mataKuliahId: "legacy", status: "active", endAt: new Date(end.getTime() + 10000) });
    const paid = await resolveCourseAccess({ courseId: "legacy", userId: "student", now: end }, testDb);
    expect([paid.tier, paid.isEnrolled, paid.hasFullContentAccess]).toEqual(["enrolled", true, true]);
    expect(canAccessStudentQuizTemplate(paid, chapterTwoQuiz)).toBe(true);
    const { hasFullContentAccess: _omitted, ...legacyFixture } = paid;
    expect(canAccessCourseContent(legacyFixture as typeof paid, "article", ["chapter-2"])).toBe(true);
    await testDb.update(schema.mataKuliah).set({ status: "archived" }).where(eq(schema.mataKuliah.id, "legacy"));
    expect((await resolveCourseAccess({ courseId: "legacy", userId: "student", now: start }, testDb)).hasFullContentAccess).toBe(false);
    const free = await resolveCourseAccess({ courseId: "canonical", userId: "student", now: end }, testDb);
    expect([free.isFreeNow, free.hasFullContentAccess, free.isEnrolled, free.tier]).toEqual([true, true, false, "free"]);
    const alias = await resolveCourseAccess({ courseId: "alias", userId: "student", now: end }, testDb);
    expect([alias.canonicalCourseId, alias.isFreeNow, alias.hasFullContentAccess]).toEqual(["canonical", true, true]);
    const unassignedTutor = await resolveCourseAccess({ courseId: "alias", userId: "tutor", now: end }, testDb);
    expect(unassignedTutor.hasFullContentAccess).toBe(false);
    const batch = await resolveCourseAccessBatch("tutor", ["canonical", "alias"], { now: end, executor: testDb });
    expect(batch.get("alias")).toEqual(unassignedTutor);
  });
});
