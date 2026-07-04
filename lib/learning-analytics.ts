import { db } from "@/db";
import {
  flashcardReviews,
  flashcards,
  flashcardSets,
  studentFlashcardProgress,
  studentMaterialProgress,
  websiteMaterials,
  learningEvents,
  studentConceptMastery,
  studentChapterMastery,
  studentChapterProgress,
  chapters,
  quizTemplates,
  studentQuizAttempts,
} from "@/db/schema";
import { eq, and, lte, or, isNull, inArray, gte, sql, desc, asc, notInArray } from "drizzle-orm";
import { getOrUpdateStreak } from "@/lib/streak-service";
import { CourseLearningSummary, CourseDailyPlan, CourseDailyPlanItem } from "@/types/course-learning";

/**
 * Gets the start of today in UTC.
 */
function getStartOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Helper to get card review count today.
 */
export async function getCardsReviewedToday(studentId: string, courseId?: string): Promise<number> {
  const startOfToday = getStartOfToday();
  const query = db
    .select({ count: sql<number>`count(*)` })
    .from(flashcardReviews)
    .innerJoin(flashcards, eq(flashcardReviews.flashcardId, flashcards.id))
    .innerJoin(flashcardSets, eq(flashcards.setId, flashcardSets.id));

  const conditions = [
    eq(flashcardReviews.studentId, studentId),
    gte(flashcardReviews.reviewedAt, startOfToday),
  ];

  if (courseId) {
    conditions.push(eq(flashcardSets.courseId, courseId));
  }

  const [result] = await query.where(and(...conditions));
  return result?.count || 0;
}

/**
 * Helper to get cards due today count.
 */
export async function getCardsDueToday(studentId: string, courseId?: string): Promise<number> {
  const now = new Date();
  
  // 1. Get all active cards of published sets
  let setsQuery;
  if (courseId) {
    setsQuery = db
      .select({ id: flashcardSets.id })
      .from(flashcardSets)
      .where(
        and(
          eq(flashcardSets.courseId, courseId),
          eq(flashcardSets.status, "published")
        )
      );
  } else {
    setsQuery = db
      .select({ id: flashcardSets.id })
      .from(flashcardSets)
      .where(eq(flashcardSets.status, "published"));
  }

  const publishedSets = await setsQuery;
  if (publishedSets.length === 0) return 0;
  const setIds = publishedSets.map(s => s.id);

  // 2. Count due cards
  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(flashcards)
    .leftJoin(
      studentFlashcardProgress,
      and(
        eq(studentFlashcardProgress.flashcardId, flashcards.id),
        eq(studentFlashcardProgress.studentId, studentId)
      )
    )
    .where(
      and(
        inArray(flashcards.setId, setIds),
        eq(flashcards.status, "active"),
        or(
          isNull(studentFlashcardProgress.id),
          lte(studentFlashcardProgress.dueDate, now)
        )
      )
    );

  return result?.count || 0;
}

/**
 * Helper to get average review grade.
 */
export async function getAverageReviewGrade(studentId: string, courseId?: string): Promise<number> {
  const query = db
    .select({ avgGrade: sql<number>`avg(${flashcardReviews.grade})` })
    .from(flashcardReviews)
    .innerJoin(flashcards, eq(flashcardReviews.flashcardId, flashcards.id))
    .innerJoin(flashcardSets, eq(flashcards.setId, flashcardSets.id));

  const conditions = [eq(flashcardReviews.studentId, studentId)];
  if (courseId) {
    conditions.push(eq(flashcardSets.courseId, courseId));
  }

  const [result] = await query.where(and(...conditions));
  return result?.avgGrade ? parseFloat(result.avgGrade.toFixed(2)) : 0;
}

/**
 * Helper to get material completion percentage for a course.
 */
export async function getMaterialCompletionPercentage(studentId: string, courseId: string): Promise<number> {
  // Find all website materials in the course
  const courseMaterialsList = await db
    .select({ id: websiteMaterials.id })
    .from(websiteMaterials)
    .where(and(eq(websiteMaterials.courseId, courseId), eq(websiteMaterials.status, "published")));

  if (courseMaterialsList.length === 0) return 0;
  const materialIds = courseMaterialsList.map(m => m.id);

  // Find progress for these materials
  const progressRows = await db
    .select({ completionPercent: studentMaterialProgress.completionPercent })
    .from(studentMaterialProgress)
    .where(
      and(
        eq(studentMaterialProgress.studentId, studentId),
        inArray(studentMaterialProgress.materialId, materialIds)
      )
    );

  const totalCompletionPercent = progressRows.reduce((acc, row) => acc + row.completionPercent, 0);
  return Math.round(totalCompletionPercent / courseMaterialsList.length);
}

/**
 * Helper to get total study time spent (in seconds).
 */
export async function getTotalStudyTime(studentId: string, courseId?: string): Promise<number> {
  const query = db
    .select({ totalTime: sql<number>`sum(${studentMaterialProgress.timeSpentSeconds})` })
    .from(studentMaterialProgress);

  if (courseId) {
    const [result] = await query
      .innerJoin(websiteMaterials, eq(studentMaterialProgress.materialId, websiteMaterials.id))
      .where(
        and(
          eq(studentMaterialProgress.studentId, studentId),
          eq(websiteMaterials.courseId, courseId)
        )
      );
    return result?.totalTime || 0;
  } else {
    const [result] = await query.where(eq(studentMaterialProgress.studentId, studentId));
    return result?.totalTime || 0;
  }
}

/**
 * Gets the most recently opened material progress for Continue Reading.
 */
export async function getContinueReading(studentId: string, courseId: string) {
  const [lastProgress] = await db
    .select({
      id: studentMaterialProgress.id,
      materialId: studentMaterialProgress.materialId,
      completionPercent: studentMaterialProgress.completionPercent,
      lastSectionId: studentMaterialProgress.lastSectionId,
      lastPosition: studentMaterialProgress.lastPosition,
      timeSpentSeconds: studentMaterialProgress.timeSpentSeconds,
      lastOpenedAt: studentMaterialProgress.lastOpenedAt,
      title: websiteMaterials.title,
      slug: websiteMaterials.slug,
    })
    .from(studentMaterialProgress)
    .innerJoin(websiteMaterials, eq(studentMaterialProgress.materialId, websiteMaterials.id))
    .where(
      and(
        eq(studentMaterialProgress.studentId, studentId),
        eq(websiteMaterials.courseId, courseId)
      )
    )
    .orderBy(desc(studentMaterialProgress.lastOpenedAt))
    .limit(1);

  return lastProgress || null;
}

/**
 * Gets the learning summary for a course page using live database queries.
 */
export async function getCourseLearningSummary(
  courseId: string,
  studentId: string
): Promise<CourseLearningSummary> {
  const now = new Date();

  // 1. Get continue reading
  const lastProgress = await getContinueReading(studentId, courseId);
  const continueReading = lastProgress
    ? {
        materialId: lastProgress.materialId,
        materialTitle: lastProgress.title,
        chapterTitle: lastProgress.lastSectionId || "Awal materi",
        completionPercent: lastProgress.completionPercent,
        lastSectionId: lastProgress.lastSectionId || undefined,
        lastPosition: lastProgress.lastPosition || undefined,
      }
    : null;

  // 2. Get due flashcards
  const dueCount = await getCardsDueToday(studentId, courseId);
  const dueFlashcards = {
    dueCount,
    nextReviewRecommendation: dueCount > 0
      ? `Kamu memiliki ${dueCount} flashcard untuk diulas hari ini.`
      : "Hebat! Semua kartu telah diulas.",
  };

  // 3. Get recent activities
  const recentEvents = await db
    .select()
    .from(learningEvents)
    .where(
      and(
        eq(learningEvents.studentId, studentId),
        eq(learningEvents.courseId, courseId)
      )
    )
    .orderBy(desc(learningEvents.createdAt))
    .limit(5);

  const recentActivities = recentEvents.map((ev) => {
    let type: "flashcard_review" | "material_completion" | "quiz_completion" | "tryout_completion" = "flashcard_review";
    let title = "Aktivitas belajar";
    let description = ev.conceptName || "";

    if (ev.eventType === "material_completed") {
      type = "material_completion";
      title = "Menyelesaikan dokumen";
    } else if (ev.eventType === "quiz_answer") {
      type = "quiz_completion";
      title = "Menjawab kuis";
    } else if (ev.eventType === "flashcard_review") {
      type = "flashcard_review";
      title = "Mengulas flashcard";
    }

    return {
      id: ev.id,
      type,
      title,
      timestamp: ev.createdAt ? ev.createdAt.toISOString() : now.toISOString(),
      description,
    };
  });

  // 4. Get stats
  const totalSeconds = await getTotalStudyTime(studentId, courseId);
  const studyTimeMin = Math.round(totalSeconds / 60);

  // Completed materials count
  const [completedMats] = await db
    .select({ count: sql<number>`count(*)` })
    .from(studentMaterialProgress)
    .innerJoin(websiteMaterials, eq(studentMaterialProgress.materialId, websiteMaterials.id))
    .where(
      and(
        eq(studentMaterialProgress.studentId, studentId),
        eq(websiteMaterials.courseId, courseId),
        gte(studentMaterialProgress.completionPercent, 90)
      )
    );
  const completedMaterialsCount = completedMats?.count || 0;

  // Cards reviewed count
  const [reviewedCards] = await db
    .select({ count: sql<number>`count(*)` })
    .from(flashcardReviews)
    .innerJoin(flashcards, eq(flashcardReviews.flashcardId, flashcards.id))
    .innerJoin(flashcardSets, eq(flashcards.setId, flashcardSets.id))
    .where(
      and(
        eq(flashcardReviews.studentId, studentId),
        eq(flashcardSets.courseId, courseId)
      )
    );
  const cardsReviewedCount = reviewedCards?.count || 0;

  // Streak
  let currentStreakDays = 0;
  try {
    const streakInfo = await getOrUpdateStreak(studentId);
    currentStreakDays = streakInfo.current;
  } catch (e) {
    console.error("Failed to load streak for summary:", e);
  }

  const studyStatistics = {
    studyTimeMin,
    completedMaterialsCount,
    cardsReviewedCount,
    currentStreakDays,
  };

  return {
    continueReading,
    dueFlashcards,
    recentActivities,
    studyStatistics,
  };
}

export async function getStudentConceptMastery(studentId: string, courseId: string) {
  return db
    .select()
    .from(studentConceptMastery)
    .where(
      and(
        eq(studentConceptMastery.studentId, studentId),
        eq(studentConceptMastery.courseId, courseId)
      )
    )
    .orderBy(desc(studentConceptMastery.masteryScore));
}

export async function getStudentChapterMastery(studentId: string, courseId: string) {
  return db
    .select()
    .from(studentChapterMastery)
    .where(
      and(
        eq(studentChapterMastery.studentId, studentId),
        eq(studentChapterMastery.courseId, courseId)
      )
    )
    .orderBy(desc(studentChapterMastery.masteryScore));
}

export async function getWeakestConcepts(studentId: string, courseId: string, limit: number = 5) {
  return db
    .select()
    .from(studentConceptMastery)
    .where(
      and(
        eq(studentConceptMastery.studentId, studentId),
        eq(studentConceptMastery.courseId, courseId)
      )
    )
    .orderBy(asc(studentConceptMastery.masteryScore))
    .limit(limit);
}

/**
 * Builds a course-scoped "today" plan for the course overview page.
 * Deterministic (no AI): due flashcards, a quiz targeted at the weakest concept,
 * and the next material to read. Mirrors the landing "Rencana Hari Ini" pane.
 */
export async function getCourseDailyPlan(
  studentId: string,
  courseId: string
): Promise<CourseDailyPlan> {
  const items: CourseDailyPlanItem[] = [];

  // 1. Flashcards due today
  const dueCount = await getCardsDueToday(studentId, courseId);
  if (dueCount > 0) {
    items.push({
      kind: "flashcards",
      label: "Flashcard jatuh tempo",
      meta: `${dueCount} kartu`,
      href: `/courses/${courseId}/flashcard`,
    });
  }

  // 2. Weakest concept -> a quiz still worth taking
  const weakest = await getWeakestConcepts(studentId, courseId, 1);
  const weakestConcept = weakest[0]?.conceptName ?? null;

  const passedRows = await db
    .select({ templateId: studentQuizAttempts.templateId })
    .from(studentQuizAttempts)
    .where(
      and(
        eq(studentQuizAttempts.studentId, studentId),
        eq(studentQuizAttempts.status, "completed"),
        gte(studentQuizAttempts.score, 70)
      )
    );
  const passedIds = passedRows.map((r) => r.templateId);

  const quizzes = await db
    .select({
      id: quizTemplates.id,
      title: quizTemplates.title,
      category: quizTemplates.category,
      selectionRules: quizTemplates.selectionRules,
    })
    .from(quizTemplates)
    .where(
      and(
        eq(quizTemplates.courseId, courseId),
        passedIds.length > 0 ? notInArray(quizTemplates.id, passedIds) : undefined
      )
    );

  if (quizzes.length > 0) {
    // Prefer a quiz whose selection rules tag the weakest concept, then weekly, then any.
    const taggedForWeak = weakestConcept
      ? quizzes.find((q) => {
          const rules = q.selectionRules as Record<string, unknown> | null;
          const tags = (rules?.tags as string[] | undefined) ?? [];
          return tags.includes(weakestConcept);
        })
      : undefined;
    const quiz = taggedForWeak ?? quizzes.find((q) => q.category === "weekly") ?? quizzes[0];

    items.push({
      kind: "quiz",
      label: weakestConcept ? `Kuis: ${weakestConcept}` : quiz.title,
      meta: weakestConcept ? "konsep terlemah" : "latihan",
      href: `/courses/${courseId}/quiz/${quiz.id}`,
    });
  }

  // 3. Next material: continue an open one, else the first unread published material
  const lastProgress = await getContinueReading(studentId, courseId);
  if (lastProgress && lastProgress.completionPercent < 90) {
    const section = lastProgress.lastSectionId
      ? `?section=${encodeURIComponent(lastProgress.lastSectionId)}`
      : "";
    items.push({
      kind: "module",
      label: `Lanjutkan: ${lastProgress.title}`,
      meta: `${lastProgress.completionPercent}% selesai`,
      href: `/courses/${courseId}/material/${lastProgress.materialId}${section}`,
    });
  } else {
    const completedChapIds = await db
      .select({ chapterId: studentChapterProgress.chapterId })
      .from(studentChapterProgress)
      .where(
        and(
          eq(studentChapterProgress.studentId, studentId),
          eq(studentChapterProgress.completed, true)
        )
      );
    const completedIds = completedChapIds.map((r) => r.chapterId);

    const [nextMaterial] = await db
      .select({
        id: websiteMaterials.id,
        title: websiteMaterials.title,
      })
      .from(websiteMaterials)
      .innerJoin(chapters, eq(websiteMaterials.chapterId, chapters.id))
      .where(
        and(
          eq(websiteMaterials.courseId, courseId),
          eq(websiteMaterials.status, "published"),
          eq(chapters.status, "published"),
          completedIds.length > 0
            ? notInArray(websiteMaterials.chapterId, completedIds)
            : undefined
        )
      )
      .orderBy(asc(chapters.orderIndex))
      .limit(1);

    if (nextMaterial) {
      items.push({
        kind: "module",
        label: `Baca: ${nextMaterial.title}`,
        meta: "materi",
        href: `/courses/${courseId}/material/${nextMaterial.id}`,
      });
    }
  }

  // Streak (best-effort; deterministic day-streak service)
  let streakDays = 0;
  try {
    const streakInfo = await getOrUpdateStreak(studentId);
    streakDays = streakInfo.current;
  } catch (e) {
    console.error("Failed to load streak for course daily plan:", e);
  }

  return { items, streakDays, weakestConcept };
}

export async function getStrongestConcepts(studentId: string, courseId: string, limit: number = 5) {
  return db
    .select()
    .from(studentConceptMastery)
    .where(
      and(
        eq(studentConceptMastery.studentId, studentId),
        eq(studentConceptMastery.courseId, courseId)
      )
    )
    .orderBy(desc(studentConceptMastery.masteryScore))
    .limit(limit);
}

export async function getChapterProgressSummary(studentId: string, courseId: string) {
  const courseChapters = await db
    .select()
    .from(chapters)
    .where(and(eq(chapters.courseId, courseId), eq(chapters.status, "published")))
    .orderBy(asc(chapters.orderIndex));

  const chapterIds = courseChapters.map((c) => c.id);
  if (chapterIds.length === 0) return [];

  const masteries = await db
    .select()
    .from(studentChapterMastery)
    .where(
      and(
        eq(studentChapterMastery.studentId, studentId),
        inArray(studentChapterMastery.chapterId, chapterIds)
      )
    );

  const masteryMap = new Map(masteries.map((m) => [m.chapterId, m]));

  return courseChapters.map((ch) => {
    const m = masteryMap.get(ch.id);
    return {
      chapterId: ch.id,
      title: ch.title,
      orderIndex: ch.orderIndex,
      masteryScore: m ? m.masteryScore : 0,
      confidence: m ? m.confidence : 0.0,
      evidenceCount: m ? m.evidenceCount : 0,
      trend: m ? m.trend : "stable",
      lastEvidenceAt: m ? m.lastEvidenceAt : null,
    };
  });
}
