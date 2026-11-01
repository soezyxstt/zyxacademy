import { db } from "@/db";
import {
  chatSessions,
  tutorChatMessages,
  learningEvents,
  studentQuizAttempts,
  studentFlashcardProgress,
  studentMaterialProgress,
  websiteMaterials,
  flashcards,
  flashcardReviews,
  quizTemplates,
} from "@/db/schema";
import { and, eq, gte, sql, count, desc, asc } from "drizzle-orm";

export function getRecentSessionsQuery(
  studentId: string,
  courseId: string,
  limit = 10
) {
  return db
    .select({
      id: chatSessions.id,
      title: chatSessions.title,
      startedAt: chatSessions.startedAt,
      lastMessageAt: chatSessions.lastMessageAt,
      messageCount: count(tutorChatMessages.id).as("messageCount"),
    })
    .from(chatSessions)
    .leftJoin(tutorChatMessages, and(
      eq(tutorChatMessages.sessionId, chatSessions.id),
      eq(tutorChatMessages.studentId, chatSessions.studentId),
      eq(tutorChatMessages.courseId, chatSessions.courseId),
    ))
    .where(and(
      eq(chatSessions.studentId, studentId),
      eq(chatSessions.courseId, courseId)
    ))
    .groupBy(chatSessions.id)
    .orderBy(desc(chatSessions.lastMessageAt))
    .limit(limit);
}

export async function getRecentSessions(studentId: string, courseId: string, limit = 10) {
  return getRecentSessionsQuery(studentId, courseId, limit);
}

export async function getMostDiscussedConcepts(
  studentId: string,
  courseId: string,
  limit = 10
): Promise<Array<{ conceptName: string; questionCount: number }>> {
  return db
    .select({
      conceptName: learningEvents.conceptName,
      questionCount: count(),
    })
    .from(learningEvents)
    .where(and(
      eq(learningEvents.studentId, studentId),
      eq(learningEvents.courseId, courseId),
      eq(learningEvents.eventType, "tutor_question"),
      sql`${learningEvents.conceptName} is not null`
    ))
    .groupBy(learningEvents.conceptName)
    .orderBy(desc(count()))
    .limit(limit)
    .then((rows) =>
      rows.map((r) => ({
        conceptName: r.conceptName ?? "unknown",
        questionCount: r.questionCount,
      }))
    );
}

export interface SessionActivitySummary {
  totalSessions: number;
  totalQuestions: number;
  avgQuestionsPerSession: number;
  lastSessionDate: Date | null;
  conceptCoverage: number;
}

export async function getSessionActivitySummary(
  studentId: string,
  courseId: string,
  sinceDays = 30
): Promise<SessionActivitySummary> {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  const [eventStats, sessionCount, conceptCount] = await Promise.all([
    db
      .select({
        totalQuestions: count(),
        lastSession: sql<Date>`max(${learningEvents.createdAt})`,
      })
      .from(learningEvents)
      .where(and(
        eq(learningEvents.studentId, studentId),
        eq(learningEvents.courseId, courseId),
        eq(learningEvents.eventType, "tutor_question"),
        gte(learningEvents.createdAt, since)
      )),
    db
      .select({ count: count() })
      .from(chatSessions)
      .where(and(
        eq(chatSessions.studentId, studentId),
        eq(chatSessions.courseId, courseId),
        gte(chatSessions.lastMessageAt, since)
      )),
    db
      .select({ count: count() })
      .from(learningEvents)
      .where(and(
        eq(learningEvents.studentId, studentId),
        eq(learningEvents.courseId, courseId),
        eq(learningEvents.eventType, "tutor_question"),
        gte(learningEvents.createdAt, since),
        sql`${learningEvents.conceptName} is not null`
      ))
      .groupBy(learningEvents.conceptName),
  ]);

  const totalSessions = sessionCount[0]?.count ?? 1;
  const totalQuestions = eventStats[0]?.totalQuestions ?? 0;

  return {
    totalSessions,
    totalQuestions,
    avgQuestionsPerSession: Math.round((totalQuestions / totalSessions) * 10) / 10,
    lastSessionDate: eventStats[0]?.lastSession ?? null,
    conceptCoverage: conceptCount.length,
  };
}

export async function getLearningMemorySummary(
  studentId: string,
  courseId: string
) {
  const windowDate = new Date();
  windowDate.setDate(windowDate.getDate() - 30);

  const [materials, reviews, quizzes, fcDue] = await Promise.all([
    db
      .select({ count: count() })
      .from(studentMaterialProgress)
      .innerJoin(websiteMaterials, eq(studentMaterialProgress.materialId, websiteMaterials.id))
      .where(and(
        eq(studentMaterialProgress.studentId, studentId),
        eq(websiteMaterials.courseId, courseId),
        eq(studentMaterialProgress.completionPercent, 100)
      )),
    db
      .select({ count: count() })
      .from(flashcardReviews)
      .innerJoin(flashcards, eq(flashcardReviews.flashcardId, flashcards.id))
      .where(and(
        eq(flashcardReviews.studentId, studentId),
        gte(flashcardReviews.reviewedAt, windowDate)
      )),
    db
      .select({ count: count() })
      .from(studentQuizAttempts)
      .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
      .where(and(
        eq(studentQuizAttempts.studentId, studentId),
        eq(quizTemplates.courseId, courseId),
        eq(studentQuizAttempts.status, "completed")
      )),
    db
      .select({ count: count() })
      .from(studentFlashcardProgress)
      .where(and(
        eq(studentFlashcardProgress.studentId, studentId),
        sql`${studentFlashcardProgress.dueDate} <= now()`
      )),
  ]);

  return {
    completedMaterials: materials[0]?.count ?? 0,
    flashcardsReviewed: reviews[0]?.count ?? 0,
    quizzesCompleted: quizzes[0]?.count ?? 0,
    flashcardsDue: fcDue[0]?.count ?? 0,
  };
}

export async function getConceptPerformanceByQuiz(
  studentId: string,
  courseId: string,
  limit = 5
): Promise<Array<{ conceptName: string; accuracy: number; attempts: number }>> {
  return db
    .select({
      conceptName: learningEvents.conceptName,
      accuracy: sql<number>`avg(${learningEvents.correctness}) * 100`,
      attempts: count(),
    })
    .from(learningEvents)
    .where(and(
      eq(learningEvents.studentId, studentId),
      eq(learningEvents.courseId, courseId),
      eq(learningEvents.eventType, "quiz_answer"),
      sql`${learningEvents.conceptName} is not null`
    ))
    .groupBy(learningEvents.conceptName)
    .orderBy(asc(sql`avg(${learningEvents.correctness})`))
    .limit(limit)
    .then((rows) =>
      rows.map((r) => ({
        conceptName: r.conceptName ?? "unknown",
        accuracy: Math.round((r.accuracy ?? 0) * 10) / 10,
        attempts: r.attempts,
      }))
    );
}
