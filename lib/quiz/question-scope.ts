import { and, eq, inArray, or, sql } from "drizzle-orm";
import { aiQuestionBank, bab, chapters, knowledgeObjects, soal } from "@/db/schema";
import { db } from "@/db";
import type { CourseAccessResult } from "@/lib/student/course-access";
import { validatedQuizScope } from "@/lib/quiz/student-access";

/** Shared chapter eligibility for Free course and restricted preview attempts. */
export async function freeQuizQuestionScope(access: CourseAccessResult, selectionRules: unknown) {
  const requested = validatedQuizScope(selectionRules);
  if (!requested) return sql`false`;
  const permitted = access.hasFullContentAccess ? access.scopedChapterIds : access.freeChapterIds;
  const ids = requested.length ? requested : permitted;
  if (!ids.length) return sql`false`;
  const mapped = access.canonicalCourseId ? await db.select({ id: bab.id, legacyId: bab.legacyChapterId }).from(bab).where(and(
    eq(bab.mataKuliahId, access.canonicalCourseId), eq(bab.status, "active"),
    or(inArray(bab.id, ids), inArray(bab.legacyChapterId, ids)),
  )) : [];
  const chapterIds = [...new Set([...ids, ...mapped.flatMap((row) => [row.id, row.legacyId].filter((id): id is string => Boolean(id)))])];
  const canonical = access.canonicalCourseId;
  return and(
    eq(aiQuestionBank.status, "active"), eq(aiQuestionBank.isStale, false),
    or(
      canonical ? sql`exists (select 1 from ${soal} inner join ${bab} on ${bab.id} = ${soal.babId} where ${soal.id} = ${aiQuestionBank.id} and ${soal.mataKuliahId} = ${canonical} and ${soal.status} = 'published' and ${bab.mataKuliahId} = ${canonical} and ${bab.status} = 'active' and ${inArray(bab.id, chapterIds)})` : sql`false`,
      sql`not exists (select 1 from ${soal} where ${soal.id} = ${aiQuestionBank.id}) and exists (select 1 from ${knowledgeObjects} inner join ${chapters} on ${chapters.id} = ${knowledgeObjects.chapterId} where ${knowledgeObjects.id} = ${aiQuestionBank.knowledgeObjectId} and ${knowledgeObjects.status} = 'active' and ${chapters.status} = 'published' and ${chapters.courseId} = ${aiQuestionBank.courseId} and ${inArray(chapters.id, chapterIds)} and not exists (select 1 from ${bab} where ${bab.legacyChapterId} = ${chapters.id} and ${bab.status} <> 'active'))`,
    ),
  );
}
