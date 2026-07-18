import { db } from "@/db";
import {
  enrollments,
  studentMaterialProgress,
  websiteMaterials,
  flashcardReviews,
  studentQuizAttempts,
  quizTemplates,
  studentStreaks,
  learningEvents,
  flashcards,
  flashcardSets,
  studentFlashcardProgress,
} from "@/db/schema";
import { eq, and, gte, sql, inArray } from "drizzle-orm";
import { StudentAnalytics, CourseAnalytics, ConsistencyMetrics, RetentionMetrics } from "@/types/learning-analytics";
import { calculateConsistencyScore } from "./consistency-score";
import { calculateRetentionScore } from "./retention-metrics";
import { startOfDayUtc, daysAgo } from "@/lib/date-utils";

/**
 * Service to aggregate, query, and compute learning analytics metrics.
 * Separated cleanly from any UI components or mastery business logic.
 */
export class LearningAnalyticsService {
  /**
   * Helper to fetch UTC start of today, start of week, and start of month dates.
   */
  private static getTimelineRanges() {
    const now = new Date();
    return {
      startOfToday: startOfDayUtc(now),
      startOfWeek: startOfDayUtc(daysAgo(7, now)),
      startOfMonth: startOfDayUtc(daysAgo(30, now)),
    };
  }

  /**
   * Gets analytics overview for a specific student.
   */
  async getStudentAnalytics(studentId: string, courseId?: string): Promise<StudentAnalytics> {
    const { startOfToday, startOfWeek, startOfMonth } = LearningAnalyticsService.getTimelineRanges();

    // 1. Fetch Streak
    const [streakRow] = await db
      .select()
      .from(studentStreaks)
      .where(eq(studentStreaks.studentId, studentId))
      .limit(1);
    
    const currentStreak = streakRow?.currentStreak ?? 0;
    const longestStreak = streakRow?.longestStreak ?? 0;

    // 2. Fetch Material Progress stats
    let materialQuery = db
      .select({
        completionPercent: studentMaterialProgress.completionPercent,
        timeSpentSeconds: studentMaterialProgress.timeSpentSeconds,
        lastOpenedAt: studentMaterialProgress.lastOpenedAt,
      })
      .from(studentMaterialProgress)
      .innerJoin(websiteMaterials, eq(studentMaterialProgress.materialId, websiteMaterials.id));

    const progressConditions = [eq(studentMaterialProgress.studentId, studentId)];
    if (courseId) {
      progressConditions.push(eq(websiteMaterials.courseId, courseId));
    }
    const progressList = await materialQuery.where(and(...progressConditions));

    let studyTimeToday = 0;
    let studyTimeThisWeek = 0;
    let studyTimeThisMonth = 0;
    let completedMaterials = 0;
    let materialsInProgress = 0;

    progressList.forEach((row) => {
      const openedAt = new Date(row.lastOpenedAt);
      if (openedAt >= startOfToday) {
        studyTimeToday += row.timeSpentSeconds;
      }
      if (openedAt >= startOfWeek) {
        studyTimeThisWeek += row.timeSpentSeconds;
      }
      if (openedAt >= startOfMonth) {
        studyTimeThisMonth += row.timeSpentSeconds;
      }

      if (row.completionPercent === 100) {
        completedMaterials++;
      } else if (row.completionPercent > 0) {
        materialsInProgress++;
      }
    });

    // 3. Fetch Flashcard Review stats
    let reviewsQuery = db
      .select({
        reviewedAt: flashcardReviews.reviewedAt,
      })
      .from(flashcardReviews)
      .innerJoin(flashcards, eq(flashcardReviews.flashcardId, flashcards.id))
      .innerJoin(flashcardSets, eq(flashcards.setId, flashcardSets.id));

    const reviewsConditions = [eq(flashcardReviews.studentId, studentId)];
    if (courseId) {
      reviewsConditions.push(eq(flashcardSets.courseId, courseId));
    }
    const reviews = await reviewsQuery.where(and(...reviewsConditions));

    let flashcardsReviewedToday = 0;
    let flashcardsReviewedThisWeek = 0;

    reviews.forEach((r) => {
      const reviewedAt = new Date(r.reviewedAt);
      if (reviewedAt >= startOfToday) {
        flashcardsReviewedToday++;
      }
      if (reviewedAt >= startOfWeek) {
        flashcardsReviewedThisWeek++;
      }
    });

    // 4. Fetch Quizzes Completed
    let quizQuery = db
      .select({ id: studentQuizAttempts.id })
      .from(studentQuizAttempts)
      .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
      .where(
        and(
          eq(studentQuizAttempts.studentId, studentId),
          eq(studentQuizAttempts.status, "completed"),
          courseId ? eq(quizTemplates.courseId, courseId) : sql`1=1`
        )
      );
    const quizAttempts = await quizQuery;
    const quizzesCompleted = quizAttempts.length;

    // 5. Active Days in Last 30 Days (from learning event logs)
    let eventQuery = db
      .select({
        createdAt: learningEvents.createdAt,
      })
      .from(learningEvents)
      .where(
        and(
          eq(learningEvents.studentId, studentId),
          gte(learningEvents.createdAt, startOfMonth),
          courseId ? eq(learningEvents.courseId, courseId) : sql`1=1`
        )
      );
    const events = await eventQuery;
    const uniqueDays = new Set(
      events.map((e) => {
        const d = new Date(e.createdAt);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      })
    );
    const activeDaysLast30 = uniqueDays.size;

    return {
      studyTimeToday,
      studyTimeThisWeek,
      studyTimeThisMonth,
      completedMaterials,
      materialsInProgress,
      flashcardsReviewedToday,
      flashcardsReviewedThisWeek,
      quizzesCompleted,
      activeDaysLast30,
      currentStreak,
      longestStreak,
    };
  }

  /**
   * Gets course-wide aggregate analytics.
   */
  async getCourseAnalytics(courseId: string): Promise<CourseAnalytics> {
    const { startOfMonth } = LearningAnalyticsService.getTimelineRanges();

    // 1. Enrolled Students
    const [enrollmentRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(enrollments)
      .where(eq(enrollments.courseId, courseId));
    const enrolledStudents = enrollmentRow?.count || 0;

    // 2. Active Students (in the last 30 days)
    const activeStudentsRow = await db
      .select({ studentId: learningEvents.studentId })
      .from(learningEvents)
      .where(
        and(
          eq(learningEvents.courseId, courseId),
          gte(learningEvents.createdAt, startOfMonth)
        )
      );
    const activeStudents = new Set(activeStudentsRow.map((r) => r.studentId)).size;

    // 3. Materials count
    const courseMaterials = await db
      .select({ id: websiteMaterials.id })
      .from(websiteMaterials)
      .where(
        and(
          eq(websiteMaterials.courseId, courseId),
          eq(websiteMaterials.status, "published")
        )
      );
    const totalMaterialsCount = courseMaterials.length;

    // 4. Material completion rate and average completions across enrolled students
    let completionRate = 0;
    let averageMaterialCompletion = 0;
    let averageStudyTime = 0;

    const enrolledStudentsRows = await db
      .select({ userId: enrollments.userId })
      .from(enrollments)
      .where(eq(enrollments.courseId, courseId));
    
    if (enrolledStudentsRows.length > 0) {
      const studentIds = enrolledStudentsRows.map((s) => s.userId);

      // Average Study Time per Student
      const [studyTimeRow] = await db
        .select({ total: sql<number>`sum(${studentMaterialProgress.timeSpentSeconds})` })
        .from(studentMaterialProgress)
        .innerJoin(websiteMaterials, eq(studentMaterialProgress.materialId, websiteMaterials.id))
        .where(
          and(
            inArray(studentMaterialProgress.studentId, studentIds),
            eq(websiteMaterials.courseId, courseId)
          )
        );
      averageStudyTime = Math.round((studyTimeRow?.total || 0) / studentIds.length);

      if (totalMaterialsCount > 0) {
        // Find completed and overall percent progress
        const progressRows = await db
          .select({
            studentId: studentMaterialProgress.studentId,
            completionPercent: studentMaterialProgress.completionPercent,
          })
          .from(studentMaterialProgress)
          .where(
            and(
              inArray(studentMaterialProgress.studentId, studentIds),
              inArray(
                studentMaterialProgress.materialId,
                courseMaterials.map((m) => m.id)
              )
            )
          );

        const progressMap: Record<string, { totalPct: number; completedCount: number }> = {};
        studentIds.forEach((id) => {
          progressMap[id] = { totalPct: 0, completedCount: 0 };
        });

        progressRows.forEach((row) => {
          if (progressMap[row.studentId]) {
            progressMap[row.studentId].totalPct += row.completionPercent;
            if (row.completionPercent === 100) {
              progressMap[row.studentId].completedCount++;
            }
          }
        });

        let totalPctSum = 0;
        let fullyCompletedCount = 0;

        studentIds.forEach((id) => {
          const stats = progressMap[id];
          totalPctSum += stats.totalPct / totalMaterialsCount;
          if (stats.completedCount === totalMaterialsCount) {
            fullyCompletedCount++;
          }
        });

        averageMaterialCompletion = Math.round(totalPctSum / studentIds.length);
        completionRate = Math.round((fullyCompletedCount / studentIds.length) * 100);
      }
    }

    // 5. Flashcard Activity
    const flashcardActivityRows = await db
      .select({
        studentId: flashcardReviews.studentId,
      })
      .from(flashcardReviews)
      .innerJoin(flashcards, eq(flashcardReviews.flashcardId, flashcards.id))
      .innerJoin(flashcardSets, eq(flashcards.setId, flashcardSets.id))
      .where(eq(flashcardSets.courseId, courseId));

    const flashcardActivity = {
      reviewedCount: flashcardActivityRows.length,
      activeUsers: new Set(flashcardActivityRows.map((r) => r.studentId)).size,
    };

    // 6. Quiz Participation
    const quizAttemptsRows = await db
      .select({
        studentId: studentQuizAttempts.studentId,
        score: studentQuizAttempts.score,
      })
      .from(studentQuizAttempts)
      .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
      .where(
        and(
          eq(quizTemplates.courseId, courseId),
          eq(studentQuizAttempts.status, "completed")
        )
      );

    let averageScore = 0;
    if (quizAttemptsRows.length > 0) {
      const validScores = quizAttemptsRows
        .filter((r) => r.score !== null)
        .map((r) => r.score as number);
      const scoreSum = validScores.reduce((acc, curr) => acc + curr, 0);
      averageScore = Math.round(scoreSum / Math.max(1, validScores.length));
    }

    const quizParticipation = {
      attemptsCount: quizAttemptsRows.length,
      uniqueParticipants: new Set(quizAttemptsRows.map((r) => r.studentId)).size,
      averageScore,
    };

    return {
      enrolledStudents,
      activeStudents,
      completionRate,
      averageStudyTime,
      averageMaterialCompletion,
      flashcardActivity,
      quizParticipation,
    };
  }

  /**
   * Fetches study consistency score for a specific student.
   */
  async getStudentConsistency(studentId: string, courseId?: string): Promise<ConsistencyMetrics> {
    const { startOfMonth } = LearningAnalyticsService.getTimelineRanges();

    // 1. Get streak
    const [streakRow] = await db
      .select({ currentStreak: studentStreaks.currentStreak })
      .from(studentStreaks)
      .where(eq(studentStreaks.studentId, studentId))
      .limit(1);
    const currentStreak = streakRow?.currentStreak ?? 0;

    // 2. Fetch learning events to build a daily study time log map
    const events = await db
      .select({
        createdAt: learningEvents.createdAt,
        eventType: learningEvents.eventType,
      })
      .from(learningEvents)
      .where(
        and(
          eq(learningEvents.studentId, studentId),
          gte(learningEvents.createdAt, startOfMonth),
          courseId ? eq(learningEvents.courseId, courseId) : sql`1=1`
        )
      );

    const dailyMap: Record<string, number> = {};
    for (let i = 0; i < 30; i++) {
      const d = daysAgo(i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      dailyMap[key] = 0;
    }

    events.forEach((e) => {
      const d = new Date(e.createdAt);
      const dateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
      if (dateStr in dailyMap) {
        let estimatedSeconds = 120;
        if (e.eventType === "material_completed") estimatedSeconds = 600;
        if (e.eventType === "quiz_answer") estimatedSeconds = 180;
        if (e.eventType === "flashcard_review") estimatedSeconds = 30;
        dailyMap[dateStr] += estimatedSeconds;
      }
    });

    const dailyStudyTime = Object.entries(dailyMap).map(([date, timeSpentSeconds]) => ({
      date,
      timeSpentSeconds,
    }));

    return calculateConsistencyScore(dailyStudyTime, currentStreak);
  }

  /**
   * Fetches retention metrics for a specific student.
   */
  async getStudentRetention(studentId: string, courseId?: string): Promise<RetentionMetrics> {
    const { startOfMonth } = LearningAnalyticsService.getTimelineRanges();

    // 1. Count reviews and unique flashcards in the last 30 days
    let reviewsQuery = db
      .select({
        flashcardId: flashcardReviews.flashcardId,
        grade: flashcardReviews.grade,
      })
      .from(flashcardReviews)
      .innerJoin(flashcards, eq(flashcardReviews.flashcardId, flashcards.id))
      .innerJoin(flashcardSets, eq(flashcards.setId, flashcardSets.id));

    const reviewsConditions = [
      eq(flashcardReviews.studentId, studentId),
      gte(flashcardReviews.reviewedAt, startOfMonth),
    ];
    if (courseId) {
      reviewsConditions.push(eq(flashcardSets.courseId, courseId));
    }
    const recentReviews = await reviewsQuery.where(and(...reviewsConditions));

    const totalReviews30Days = recentReviews.length;
    const uniqueReviewedIds = new Set(recentReviews.map((r) => r.flashcardId));
    const uniqueCardsReviewed = uniqueReviewedIds.size;

    // 2. Fetch total cards in course sets
    let totalCardsQuery = db
      .select({ id: flashcards.id })
      .from(flashcards)
      .innerJoin(flashcardSets, eq(flashcards.setId, flashcardSets.id));
    if (courseId) {
      totalCardsQuery.where(eq(flashcardSets.courseId, courseId));
    }
    const totalCardsList = await totalCardsQuery;
    const totalCardsInCourseSets = totalCardsList.length;

    // 3. Fetch average grade
    let averageGrade = 3.0; // default to 'Good'
    if (totalReviews30Days > 0) {
      const gradeSum = recentReviews.reduce((acc, curr) => acc + curr.grade, 0);
      averageGrade = gradeSum / totalReviews30Days;
    }

    // 4. Fetch total lapses in flashcard progress
    let lapsesQuery = db
      .select({ lapses: studentFlashcardProgress.lapses })
      .from(studentFlashcardProgress)
      .innerJoin(flashcards, eq(studentFlashcardProgress.flashcardId, flashcards.id))
      .innerJoin(flashcardSets, eq(flashcards.setId, flashcardSets.id));

    const lapsesConditions = [eq(studentFlashcardProgress.studentId, studentId)];
    if (courseId) {
      lapsesConditions.push(eq(flashcardSets.courseId, courseId));
    }
    const progressList = await lapsesQuery.where(and(...lapsesConditions));
    const lapsesCount = progressList.reduce((acc, curr) => acc + curr.lapses, 0);

    return calculateRetentionScore(
      totalReviews30Days,
      uniqueCardsReviewed,
      totalCardsInCourseSets,
      averageGrade,
      lapsesCount
    );
  }
}
