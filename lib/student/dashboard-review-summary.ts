import { db } from "@/db";
import { bab, flashcard, flashcardIde, flashcards, flashcardSets, kemajuanFlashcardMurid, pemahamanIde, setFlashcard, studentFlashcardProgress } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getStudentCourseAccess } from "@/lib/course-utils";
import { canAccessCourseContent } from "@/lib/student/course-access";
import { resolveStudentCourse } from "@/lib/student/course-catalog";
import { isReviewDue, rankFlashcardQueue, weakestFlashcardIdea } from "@/lib/flashcard-ranking";

const CHUNK = 400;
function chunks<T>(items: T[]): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) result.push(items.slice(i, i + CHUNK));
  return result;
}

export async function getDashboardReviewSummary(studentId: string, courseIds: readonly string[]) {
  const courses = await Promise.all(courseIds.map(async (id) => ({ id, course: await resolveStudentCourse(id), access: await getStudentCourseAccess(studentId, id) })));
  const canonicalIds = [...new Set(courses.flatMap(({ course, access }) => access && course?.canonicalId ? [course.canonicalId] : []))];
  const canonicalRows = (await Promise.all(chunks(canonicalIds).map((ids) => db.select({ courseId: setFlashcard.mataKuliahId, id: flashcard.id, chapterId: setFlashcard.babId, legacyChapterId: bab.legacyChapterId, due: kemajuanFlashcardMurid.dueAt, status: kemajuanFlashcardMurid.status, lastReviewedAt: kemajuanFlashcardMurid.lastReviewedAt }).from(flashcard)
    .innerJoin(setFlashcard, eq(flashcard.setFlashcardId, setFlashcard.id))
    .leftJoin(bab, eq(setFlashcard.babId, bab.id))
    .leftJoin(kemajuanFlashcardMurid, and(eq(kemajuanFlashcardMurid.flashcardId, flashcard.id), eq(kemajuanFlashcardMurid.penggunaId, studentId)))
    .where(and(inArray(setFlashcard.mataKuliahId, ids), eq(setFlashcard.status, "published"), eq(flashcard.status, "published")))))).flat();
  const cardIds = [...new Set(canonicalRows.map((row) => row.id))];
  const ideas = (await Promise.all(chunks(cardIds).map((ids) => db.select({ flashcardId: flashcardIde.flashcardId, ideaId: flashcardIde.ideId, masteryScore: pemahamanIde.skor, confidence: pemahamanIde.keyakinan }).from(flashcardIde)
    .leftJoin(pemahamanIde, and(eq(pemahamanIde.ideId, flashcardIde.ideId), eq(pemahamanIde.penggunaId, studentId)))
    .where(inArray(flashcardIde.flashcardId, ids))))).flat();
  const ideaMap = new Map<string, typeof ideas>();
  for (const idea of ideas) ideaMap.set(idea.flashcardId, [...(ideaMap.get(idea.flashcardId) ?? []), idea]);
  const canonicalCourses = new Set(canonicalRows.map((row) => row.courseId));
  const legacyIds = [...new Set(courses.flatMap(({ id, course, access }) => access && (!course?.canonicalId || !canonicalCourses.has(course.canonicalId)) ? [course?.legacyId ?? id] : []))];
  const legacyRows = (await Promise.all(chunks(legacyIds).map((ids) => db.select({ courseId: flashcardSets.courseId, chapterId: flashcardSets.chapterId, id: flashcards.id, due: studentFlashcardProgress.dueDate, lastReviewedAt: studentFlashcardProgress.lastReviewedAt }).from(flashcards)
    .innerJoin(flashcardSets, eq(flashcards.setId, flashcardSets.id))
    .leftJoin(studentFlashcardProgress, and(eq(studentFlashcardProgress.flashcardId, flashcards.id), eq(studentFlashcardProgress.studentId, studentId)))
    .where(and(inArray(flashcardSets.courseId, ids), eq(flashcardSets.status, "published"), eq(flashcardSets.isStale, false), eq(flashcards.status, "active")))))).flat();
  const now = Date.now();
  return courses.map(({ id, course, access }) => {
    if (!access) return { courseId: id, count: 0 };
    if (course?.canonicalId && canonicalCourses.has(course.canonicalId)) {
      const items = canonicalRows.filter((row) => row.courseId === course.canonicalId && canAccessCourseContent(access.policy, "flashcard", [row.chapterId, ...(row.legacyChapterId ? [row.legacyChapterId] : [])]) && isReviewDue(row.due ? { due: row.due, status: row.status ?? undefined } : null, now)).map((row) => {
        const idea = weakestFlashcardIdea(ideaMap.get(row.id) ?? []);
        return { cardId: row.id, ideaId: idea?.ideaId ?? null, masteryScore: idea?.masteryScore ?? null, confidence: idea?.confidence ?? null, seenBefore: Boolean(row.lastReviewedAt), nextReviewDue: row.due ?? new Date(0) };
      });
      return { courseId: id, count: rankFlashcardQueue(items).length };
    }
    const count = legacyRows.filter((row) => row.courseId === (course?.legacyId ?? id) && canAccessCourseContent(access.policy, "flashcard", [row.chapterId]) && isReviewDue(row.due ? { due: row.due } : null, now)).length;
    return { courseId: id, count };
  });
}
