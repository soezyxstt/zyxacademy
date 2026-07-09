import { db } from "@/db";
import { learningEvents, studentMaterialProgress, flashcardReviews, studentQuizAttempts, websiteMaterials, flashcards, quizTemplates } from "@/db/schema";
import { and, eq, gte, count, desc } from "drizzle-orm";
import type { LearningMemory } from "./memory-layers";

const ACTIVITY_WINDOW_DAYS = 30;

export interface LearningMemoryInput {
  studentId: string;
  courseId: string;
  limit?: number;
}

export async function getLearningMemory(input: LearningMemoryInput): Promise<LearningMemory> {
  const { studentId, courseId, limit = 10 } = input;
  const since = new Date();
  since.setDate(since.getDate() - ACTIVITY_WINDOW_DAYS);

  const [
    completedMaterialsCount,
    flashcardsReviewedCount,
    quizzesCompletedCount,
    lastActivity,
    recentEvents,
  ] = await Promise.all([
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
        gte(flashcardReviews.reviewedAt, since)
      )),
    db
      .select({ count: count() })
      .from(studentQuizAttempts)
      .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
      .where(and(
        eq(studentQuizAttempts.studentId, studentId),
        eq(studentQuizAttempts.status, "completed"),
        eq(quizTemplates.courseId, courseId)
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
    db
      .select({
        eventType: learningEvents.eventType,
        conceptName: learningEvents.conceptName,
        createdAt: learningEvents.createdAt,
      })
      .from(learningEvents)
      .where(and(
        eq(learningEvents.studentId, studentId),
        eq(learningEvents.courseId, courseId),
        gte(learningEvents.createdAt, since)
      ))
      .orderBy(desc(learningEvents.createdAt))
      .limit(limit),
  ]);

  return {
    summary: {
      completedMaterials: completedMaterialsCount[0]?.count ?? 0,
      flashcardsReviewed: flashcardsReviewedCount[0]?.count ?? 0,
      quizzesCompleted: quizzesCompletedCount[0]?.count ?? 0,
      lastActiveDate: lastActivity[0]?.createdAt ?? null,
      totalStudyTimeMinutes: 0,
    },
    recentActivity: recentEvents.map((e) => ({
      type: e.eventType === "material_completed" ? "material" : e.eventType === "flashcard_review" ? "flashcard" : "quiz",
      conceptName: e.conceptName,
      timestamp: e.createdAt,
      metadata: {},
    })),
  };
}