import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, mock } from "bun:test";
import { and, eq } from "drizzle-orm";
import { createPostgresTestDb } from "../helpers/postgres";
import { bab, chapters, courses, mataKuliah, penugasanTutor, pengguna, tutorCourses, user } from "@/db/schema";
const { client, testDb: db } = await createPostgresTestDb();
mock.module("@/db", () => ({ db }));
mock.module("@/lib/db", () => ({ db }));
mock.module("@/lib/vector-sync-dispatch", () => ({ dispatchVectorSync: async () => undefined }));
afterAll(async () => { await client.close(); });
const {
  archiveChapterWithLegacyDeletion,
  archiveCourseWithLegacyDeletion,
  reorderChaptersWithCanonicalProjection,
  saveChapterWithCanonicalProjection,
  saveCourseWithCanonicalProjection,
} = await import("@/lib/academic/course-canonical-sync");
const {
  dualWriteTutorAssignment,
  revokeCanonicalTutorCourseAssignments,
} = await import("@/lib/migrasi/repository-kompatibilitas");

function fixtureId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

describe("Admin course and chapter canonical sync", () => {
  it("creates, updates, and archives a course with its legacy projection", async () => {
    const courseId = fixtureId("admin-course-sync");

    await saveCourseWithCanonicalProjection({
      id: courseId,
      title: "Kalkulus Dasar",
      category: "Matematika",
      description: "Deskripsi awal",
      isNew: true,
    });

    const [legacyCreated] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
    const [canonicalCreated] = await db
      .select()
      .from(mataKuliah)
      .where(eq(mataKuliah.legacyCourseId, courseId))
      .limit(1);
    expect(legacyCreated?.title).toBe("Kalkulus Dasar");
    expect(canonicalCreated?.title).toBe("Kalkulus Dasar");
    expect(canonicalCreated?.status).toBe("active");

    await saveCourseWithCanonicalProjection({
      id: courseId,
      title: "Kalkulus I",
      category: "Matematika",
      description: "Deskripsi baru",
      isNew: false,
    });

    const [legacyUpdated] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
    const [canonicalUpdated] = await db
      .select()
      .from(mataKuliah)
      .where(eq(mataKuliah.legacyCourseId, courseId))
      .limit(1);
    expect(legacyUpdated?.title).toBe("Kalkulus I");
    expect(canonicalUpdated?.title).toBe("Kalkulus I");

    await archiveCourseWithLegacyDeletion(courseId);

    const [legacyDeleted] = await db.select().from(courses).where(eq(courses.id, courseId)).limit(1);
    const [canonicalArchived] = await db
      .select()
      .from(mataKuliah)
      .where(eq(mataKuliah.id, canonicalCreated!.id))
      .limit(1);
    expect(legacyDeleted).toBeUndefined();
    expect(canonicalArchived?.status).toBe("archived");
  });

  it("creates, reorders, and archives chapters in both schemas", async () => {
    const courseId = fixtureId("admin-chapter-course");
    await saveCourseWithCanonicalProjection({
      id: courseId,
      title: "Matematika Sinkron",
      category: "Matematika",
      isNew: true,
    });

    const first = await saveChapterWithCanonicalProjection({
      courseId,
      title: "Fungsi",
      orderIndex: 1,
    });
    const second = await saveChapterWithCanonicalProjection({
      courseId,
      title: "Limit",
      orderIndex: 2,
    });

    const [canonicalCourse] = await db
      .select({ id: mataKuliah.id })
      .from(mataKuliah)
      .where(eq(mataKuliah.legacyCourseId, courseId))
      .limit(1);
    const canonicalRows = await db
      .select()
      .from(bab)
      .where(eq(bab.mataKuliahId, canonicalCourse!.id));
    expect(canonicalRows.map((row) => row.legacyChapterId).sort()).toEqual([first.id, second.id].sort());

    await reorderChaptersWithCanonicalProjection(courseId, [second.id, first.id]);

    const [legacySecond] = await db
      .select()
      .from(chapters)
      .where(and(eq(chapters.id, second.id), eq(chapters.courseId, courseId)))
      .limit(1);
    const [canonicalSecond] = await db
      .select()
      .from(bab)
      .where(eq(bab.legacyChapterId, second.id))
      .limit(1);
    expect(legacySecond?.orderIndex).toBe(1);
    expect(canonicalSecond?.orderIndex).toBe(1);

    await archiveChapterWithLegacyDeletion(second.id);

    const [legacyDeleted] = await db.select().from(chapters).where(eq(chapters.id, second.id)).limit(1);
    const [canonicalArchived] = await db.select().from(bab).where(eq(bab.id, canonicalSecond!.id)).limit(1);
    expect(legacyDeleted).toBeUndefined();
    expect(canonicalArchived?.status).toBe("archived");

    await archiveCourseWithLegacyDeletion(courseId);
  });

  it("replaces tutor course assignments without leaving canonical access active", async () => {
    const courseId = fixtureId("admin-tutor-course");
    const tutorId = fixtureId("admin-tutor");
    const firstAssignmentId = fixtureId("legacy-assignment");
    const replacementAssignmentId = fixtureId("legacy-assignment");

    await saveCourseWithCanonicalProjection({
      id: courseId,
      title: "Matematika Tutor",
      category: "Matematika",
      isNew: true,
    });
    await db.insert(user).values({
      id: tutorId,
      name: "Tutor Sinkron",
      email: `${tutorId}@example.com`,
      emailVerified: true,
      role: "teacher",
    });
    await db.insert(pengguna).values({ id: tutorId, status: "active" });

    await db.transaction(async (tx) => {
      const assignment = { id: firstAssignmentId, tutorId, courseId };
      await tx.insert(tutorCourses).values(assignment);
      await dualWriteTutorAssignment(tx, { ...assignment, status: "active" }, tutorId);
    });

    await db.transaction(async (tx) => {
      await revokeCanonicalTutorCourseAssignments(tx, tutorId, tutorId);
      await tx.delete(tutorCourses).where(eq(tutorCourses.tutorId, tutorId));
      const replacement = { id: replacementAssignmentId, tutorId, courseId };
      await tx.insert(tutorCourses).values(replacement);
      await dualWriteTutorAssignment(tx, { ...replacement, status: "active" }, tutorId);
    });

    const [canonicalAssignment] = await db
      .select()
      .from(penugasanTutor)
      .where(and(eq(penugasanTutor.penggunaId, tutorId), eq(penugasanTutor.assignmentScope, "course")))
      .limit(1);
    expect(canonicalAssignment?.status).toBe("active");
    expect(canonicalAssignment?.legacyTutorCourseId).toBe(replacementAssignmentId);

    await archiveCourseWithLegacyDeletion(courseId);
  });
});
