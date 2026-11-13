import { and, eq, inArray, or, sql } from "drizzle-orm";
import { aiQuestionBank, bab, chapters, knowledgeObjects, soal } from "@/db/schema";
import { db } from "@/db";
import type { CourseAccessDbExecutor, CourseAccessResult } from "@/lib/student/course-access";
import { validatedQuizScope } from "@/lib/quiz/student-access";

/** Shared chapter eligibility for Free course and restricted preview attempts. */
export async function freeQuizQuestionScope(access: CourseAccessResult, selectionRules: unknown, executor: CourseAccessDbExecutor = db) {
  const client = executor as typeof db;
  const requested = validatedQuizScope(selectionRules);
  if (!requested) return sql`false`;
  const permitted = access.hasFullContentAccess ? access.scopedChapterIds : access.freeChapterIds;
  const ids = requested.length ? requested : permitted;
  if (!ids.length) return sql`false`;
  const mapped = access.canonicalCourseId ? await client.select({ id: bab.id, legacyId: bab.legacyChapterId }).from(bab).where(and(
    eq(bab.mataKuliahId, access.canonicalCourseId), eq(bab.status, "active"),
    or(inArray(bab.id, ids), inArray(bab.legacyChapterId, ids)),
  )) : [];
  const chapterIds = [...new Set([...ids, ...mapped.flatMap((row) => [row.id, row.legacyId].filter((id): id is string => Boolean(id)))])];
  const canonical = access.canonicalCourseId;
  return and(
    eq(aiQuestionBank.status, "active"), eq(aiQuestionBank.isStale, false),
    or(
      canonical ? sql`exists (select 1 from ${soal} inner join ${bab} on ${bab.id} = ${soal.babId} where ${soal.id} = ${aiQuestionBank.id} and ${soal.mataKuliahId} = ${canonical} and ${soal.status} = 'published' and ${bab.mataKuliahId} = ${canonical} and ${bab.status} = 'active' and ${inArray(bab.id, chapterIds)})` : sql`false`,
      sql`not exists (select 1 from ${soal} where ${soal.id} = ${aiQuestionBank.id}) and exists (select 1 from ${knowledgeObjects} inner join ${chapters} on ${chapters.id} = ${knowledgeObjects.chapterId} where ${knowledgeObjects.id} = ${aiQuestionBank.knowledgeObjectId} and ${knowledgeObjects.courseId} = ${aiQuestionBank.courseId} and ${knowledgeObjects.status} = 'active' and ${chapters.status} = 'published' and ${chapters.courseId} = ${aiQuestionBank.courseId} and ${inArray(chapters.id, chapterIds)} and not exists (select 1 from ${bab} where ${bab.legacyChapterId} = ${chapters.id} and ${bab.status} <> 'active'))`,
    ),
  );
}

/** Authorize immutable snapshot IDs against current chapter scope, not template rules. */
export async function canAccessQuizSnapshots(access: CourseAccessResult, snapshots: readonly unknown[], executor: CourseAccessDbExecutor = db): Promise<boolean[]> {
  if (!access.hasCourseAccess || !access.isAuthenticated) return snapshots.map(() => false);
  if (access.tier !== "free" || access.hasFullContentAccess) return snapshots.map(() => true);
  const idsBySnapshot = snapshots.map((snapshot) => {
    if (!Array.isArray(snapshot) || !snapshot.length) return null;
    const ids = snapshot.map((question) => question && typeof question === "object" && !Array.isArray(question) ? question.id : null);
    return ids.every((id) => typeof id === "string" && id.trim() === id && id.length > 0) ? ids as string[] : null;
  });
  const ids = [...new Set(idsBySnapshot.flatMap((row) => row ?? []))];
  const courseIds = [access.canonicalCourseId, access.legacyCourseId].filter((id): id is string => Boolean(id));
  if (!ids.length || !courseIds.length) return snapshots.map(() => false);
  const rows = await (executor as typeof db).select({ id: aiQuestionBank.id }).from(aiQuestionBank).where(and(
    inArray(aiQuestionBank.id, ids), inArray(aiQuestionBank.courseId, courseIds),
    eq(aiQuestionBank.reviewStatus, "published"), await freeQuizQuestionScope(access, {}, executor),
  ));
  const permitted = new Set(rows.map((row) => row.id));
  return idsBySnapshot.map((row) => Boolean(row && row.every((id) => permitted.has(id))));
}

export async function canAccessQuizSnapshot(access: CourseAccessResult, snapshot: unknown, executor: CourseAccessDbExecutor = db): Promise<boolean> {
  return (await canAccessQuizSnapshots(access, [snapshot], executor))[0];
}
