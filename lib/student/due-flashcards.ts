import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { flashcards, flashcardSets, studentFlashcardProgress, flashcard, setFlashcard, kemajuanFlashcardMurid } from "@/db/schema";
import { canAccessCourseContent, resolveCourseAccessBatch } from "@/lib/student/course-access";

export async function getDueFlashcardCounts(studentId: string, now = new Date()) {
  const [legacy, canonical] = await Promise.all([
    db.select({ courseId: flashcardSets.courseId, chapterId: flashcardSets.chapterId,
      due: sql<number>`count(distinct ${flashcards.id}) filter (where ${studentFlashcardProgress.id} is null or ${studentFlashcardProgress.dueDate} <= ${now})` })
      .from(flashcards).innerJoin(flashcardSets, eq(flashcards.setId, flashcardSets.id))
      .leftJoin(studentFlashcardProgress, and(eq(studentFlashcardProgress.flashcardId, flashcards.id), eq(studentFlashcardProgress.studentId, studentId)))
      .where(and(eq(flashcards.status, "active"), eq(flashcardSets.status, "published"), eq(flashcardSets.isStale, false)))
      .groupBy(flashcardSets.courseId, flashcardSets.chapterId),
    db.select({ courseId: setFlashcard.mataKuliahId, chapterId: setFlashcard.babId,
      due: sql<number>`count(distinct ${flashcard.id}) filter (where ${kemajuanFlashcardMurid.id} is null or (${kemajuanFlashcardMurid.status} = 'active' and ${kemajuanFlashcardMurid.dueAt} <= ${now}))` })
      .from(flashcard).innerJoin(setFlashcard, eq(flashcard.setFlashcardId, setFlashcard.id))
      .leftJoin(kemajuanFlashcardMurid, and(eq(kemajuanFlashcardMurid.flashcardId, flashcard.id), eq(kemajuanFlashcardMurid.penggunaId, studentId)))
      .where(and(eq(flashcard.status, "published"), eq(setFlashcard.status, "published")))
      .groupBy(setFlashcard.mataKuliahId, setFlashcard.babId),
  ]);
  const access = await resolveCourseAccessBatch(studentId, [...legacy, ...canonical].map((row) => row.courseId), { now });
  const canonicalCourses = new Set(canonical.map((row) => row.courseId));
  const counts = new Map<string, number>();
  for (const row of [...canonical.map((row) => ({ ...row, canonical: true })), ...legacy.map((row) => ({ ...row, canonical: false }))]) {
    const policy = access.get(row.courseId);
    if (!policy || (!row.canonical && policy.canonicalCourseId && canonicalCourses.has(policy.canonicalCourseId))) continue;
    if (!canAccessCourseContent(policy, "flashcard", [row.chapterId])) continue;
    const courseId = policy.publicCourseId ?? row.courseId;
    counts.set(courseId, (counts.get(courseId) ?? 0) + Number(row.due));
  }
  return counts;
}
