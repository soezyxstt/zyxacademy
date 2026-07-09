import { db } from "@/db";
import {
  learningEvents,
  studentMaterialProgress,
  flashcardReviews,
  studentQuizAttempts,
  websiteMaterials,
  flashcards,
  quizTemplates,
} from "@/db/schema";
import { and, eq, gte, lt, sql, count, desc } from "drizzle-orm";

export interface LearningMemorySummary {
  completedMaterials: number;
  flashcardsReviewed: number;
  quizzesCompleted: number;
  lastActiveDate: Date | null;
}

export interface DetailedLearningSummary {
  summary: LearningMemorySummary;
  byConcept: Array<{
    conceptName: string;
    eventCount: number;
    accuracyRate: number;
  }>;
  weeklyActivity: Array<{
    weekStart: string;
    materialsCompleted: number;
    flashcardsReviewed: number;
    quizzesTaken: number;
  }>;
}

export async function getLearningMemorySummary(
  studentId: string,
  courseId: string
): Promise<LearningMemorySummary> {
  const windowDate = new Date();
  windowDate.setDate(windowDate.getDate() - 30);

  const [materials, fcReviews, quizzes, lastEvent] = await Promise.all([
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
      .select({ createdAt: learningEvents.createdAt })
      .from(learningEvents)
      .where(and(
        eq(learningEvents.studentId, studentId),
        eq(learningEvents.courseId, courseId)
      ))
      .orderBy(desc(learningEvents.createdAt))
      .limit(1),
  ]);

  return {
    completedMaterials: materials[0]?.count ?? 0,
    flashcardsReviewed: fcReviews[0]?.count ?? 0,
    quizzesCompleted: quizzes[0]?.count ?? 0,
    lastActiveDate: lastEvent[0]?.createdAt ?? null,
  };
}

export async function getDetailedLearningSummary(
  studentId: string,
  courseId: string
): Promise<DetailedLearningSummary> {
  const summary = await getLearningMemorySummary(studentId, courseId);

  const [byConcept, weekly] = await Promise.all([
    db
      .select({
        conceptName: learningEvents.conceptName,
        eventCount: count(),
        accuracyRate: sql<number>`avg(${learningEvents.correctness})`,
      })
      .from(learningEvents)
      .where(and(
        eq(learningEvents.studentId, studentId),
        eq(learningEvents.courseId, courseId),
        sql`${learningEvents.conceptName} is not null`
      ))
      .groupBy(learningEvents.conceptName)
      .orderBy(desc(count())),
    getWeeklyActivitySummary(studentId, courseId),
  ]);

  return {
    summary,
    byConcept: byConcept.map((c) => ({
      conceptName: c.conceptName ?? "unknown",
      eventCount: c.eventCount,
      accuracyRate: (c.accuracyRate ?? 0) * 100,
    })),
    weeklyActivity: weekly,
  };
}

export async function getWeeklyActivitySummary(
  studentId: string,
  courseId: string,
  weeks = 4
): Promise<DetailedLearningSummary["weeklyActivity"]> {
  const results: DetailedLearningSummary["weeklyActivity"] = [];

  for (let i = weeks - 1; i >= 0; i--) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - i * 7);
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7);

    const [materials, reviews, quizzes] = await Promise.all([
      db
        .select({ count: count() })
        .from(studentMaterialProgress)
        .innerJoin(websiteMaterials, eq(studentMaterialProgress.materialId, websiteMaterials.id))
        .where(and(
          eq(studentMaterialProgress.studentId, studentId),
          eq(websiteMaterials.courseId, courseId),
          gte(studentMaterialProgress.updatedAt, startDate),
          lt(studentMaterialProgress.updatedAt, endDate)
        )),
      db
        .select({ count: count() })
        .from(flashcardReviews)
        .innerJoin(flashcards, eq(flashcardReviews.flashcardId, flashcards.id))
        .where(and(
          eq(flashcardReviews.studentId, studentId),
          gte(flashcardReviews.reviewedAt, startDate),
          lt(flashcardReviews.reviewedAt, endDate)
        )),
      db
        .select({ count: count() })
        .from(studentQuizAttempts)
        .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
        .where(and(
          eq(studentQuizAttempts.studentId, studentId),
          eq(quizTemplates.courseId, courseId),
          gte(studentQuizAttempts.startedAt, startDate),
          lt(studentQuizAttempts.startedAt, endDate)
        )),
    ]);

    results.push({
      weekStart: startDate.toISOString().slice(0, 10),
      materialsCompleted: materials[0]?.count ?? 0,
      flashcardsReviewed: reviews[0]?.count ?? 0,
      quizzesTaken: quizzes[0]?.count ?? 0,
    });
  }

  return results;
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

export async function getSessionActivitySummary(
  studentId: string,
  courseId: string,
  sinceDays = 30
): Promise<{
  totalSessions: number;
  totalQuestions: number;
  avgQuestionsPerSession: number;
  lastSessionDate: Date | null;
}> {
  const since = new Date();
  since.setDate(since.getDate() - sinceDays);

  const stats = await db
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
    ));

  return {
    totalSessions: 0,
    totalQuestions: stats[0]?.totalQuestions ?? 0,
    avgQuestionsPerSession: 0,
    lastSessionDate: stats[0]?.lastSession ?? null,
  };
}