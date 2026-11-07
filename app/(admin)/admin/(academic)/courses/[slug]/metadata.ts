import "server-only";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { courses, mataKuliah } from "@/db/schema";
import { assertAdmin } from "@/lib/auth/admin-guards";

/** Title projection of getCourseDetailData, including its compatibility order. */
export async function getCourseTitleOnly(courseId: string) {
  await assertAdmin();

  const cleanCourseId = courseId.trim().toLowerCase();
  // Keep the same predicates and unordered limit as the detail resolver.
  // An id/legacyCourseId collision must follow the existing database selection.
  const [canonicalCourse, legacyCourse] = await Promise.all([
    db
      .select({ title: mataKuliah.title })
      .from(mataKuliah)
      .where(and(eq(mataKuliah.status, "active"), or(eq(mataKuliah.id, cleanCourseId), eq(mataKuliah.legacyCourseId, cleanCourseId))))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    db
      .select({ title: courses.title })
      .from(courses)
      .where(eq(courses.id, cleanCourseId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  if (!canonicalCourse && !legacyCourse) return null;
  return { title: canonicalCourse?.title ?? legacyCourse!.title };
}
