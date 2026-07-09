import { db } from "@/db";
import { 
  studentQuizAttempts, 
  knowledgeObjects, 
  studentFlashcardProgress, 
  flashcards, 
  aiUsageEvents,
  aiQuestionBank,
  flashcardReviews
} from "@/db/schema";
import { eq, and, inArray, sql } from "drizzle-orm";

export interface MasteryMetrics {
  masteryScore: number;     // M_mu: 0-100
  confidence: number;       // C_mu: 0.0-1.0
  isWeak: boolean;
  threshold: number;
}

export class AnalyticsService {
  /**
   * Calculates Mastery and Confidence Scores for all Mastery Units of a student in a course.
   */
  static async calculateCourseMastery(
    studentId: string, 
    courseId: string
  ): Promise<Record<string, MasteryMetrics>> {
    // 1. Fetch all active Knowledge Objects for this course
    const activeKOs = await db
      .select({
        id: knowledgeObjects.id,
        conceptId: knowledgeObjects.conceptId,
        conceptName: knowledgeObjects.conceptName,
        difficulty: knowledgeObjects.difficulty,
        type: knowledgeObjects.type,
      })
      .from(knowledgeObjects)
      .where(
        and(
          eq(knowledgeObjects.courseId, courseId),
          eq(knowledgeObjects.status, "active")
        )
      );

    if (activeKOs.length === 0) return {};

    // Group KOs by conceptName (defining the Mastery Units)
    const muGroups: Record<string, {
      conceptIds: string[];
      koIds: string[];
      difficulty: "easy" | "medium" | "hard";
    }> = {};

    for (const ko of activeKOs) {
      const key = ko.conceptName.trim();
      if (!muGroups[key]) {
        muGroups[key] = {
          conceptIds: [],
          koIds: [],
          difficulty: ko.difficulty,
        };
      }
      muGroups[key].koIds.push(ko.id);
      if (!muGroups[key].conceptIds.includes(ko.conceptId)) {
        muGroups[key].conceptIds.push(ko.conceptId);
      }
    }

    // 2. Fetch all completed quiz attempts for the student
    const quizAttempts = await db
      .select({
        questionsSnapshot: studentQuizAttempts.questionsSnapshot,
        answersSnapshot: studentQuizAttempts.answersSnapshot,
        submittedAt: studentQuizAttempts.submittedAt,
      })
      .from(studentQuizAttempts)
      .where(
        and(
          eq(studentQuizAttempts.studentId, studentId),
          eq(studentQuizAttempts.status, "completed")
        )
      );

    // Build question ID mappings to handle missing knowledgeObjectId in snapshot (legacy/tests)
    const questionIds = new Set<string>();
    for (const attempt of quizAttempts) {
      const questions = (attempt.questionsSnapshot as any[]) || [];
      for (const q of questions) {
        if (q.id) questionIds.add(q.id);
      }
    }

    const questionToKoMap: Record<string, string> = {};
    if (questionIds.size > 0) {
      const questionsFromBank = await db
        .select({
          id: aiQuestionBank.id,
          knowledgeObjectId: aiQuestionBank.knowledgeObjectId,
        })
        .from(aiQuestionBank)
        .where(inArray(aiQuestionBank.id, Array.from(questionIds)));

      for (const q of questionsFromBank) {
        if (q.knowledgeObjectId) {
          questionToKoMap[q.id] = q.knowledgeObjectId;
        }
      }
    }

    // 3. Fetch all flashcard progress and reviews count for the student
    const fcProgress = await db
      .select({
        repetitions: studentFlashcardProgress.repetitions,
        lastReviewedAt: studentFlashcardProgress.lastReviewedAt,
        flashcardId: studentFlashcardProgress.flashcardId,
        koId: flashcards.koId,
      })
      .from(studentFlashcardProgress)
      .innerJoin(flashcards, eq(studentFlashcardProgress.flashcardId, flashcards.id))
      .where(eq(studentFlashcardProgress.studentId, studentId));

    const reviewsCountList = await db
      .select({
        flashcardId: flashcardReviews.flashcardId,
        count: sql<number>`count(*)`,
      })
      .from(flashcardReviews)
      .where(eq(flashcardReviews.studentId, studentId))
      .groupBy(flashcardReviews.flashcardId);

    const reviewsCountMap = new Map(reviewsCountList.map(r => [r.flashcardId, r.count]));

    // 4. Fetch AI Tutor usage events for the student
    const tutorEvents = await db
      .select({
        createdAt: aiUsageEvents.createdAt,
      })
      .from(aiUsageEvents)
      .where(eq(aiUsageEvents.userId, studentId));

    const now = new Date().getTime();
    const result: Record<string, MasteryMetrics> = {};

    for (const [, group] of Object.entries(muGroups)) {
      // Find all supporting KOs for this MU
      const koIds = group.koIds;

      // A. Calculate S_fc (Flashcard recall score) & N_fc_rev
      const linkedFc = fcProgress.filter(p => p.koId && koIds.includes(p.koId));
      let S_fc = 0;
      let N_fc_rev = 0;
      let lastFcTime = 0;

      if (linkedFc.length > 0) {
        let repetitionsSum = 0;
        for (const p of linkedFc) {
          repetitionsSum += Math.min(5, p.repetitions);
          N_fc_rev += reviewsCountMap.get(p.flashcardId) || 0;
          if (p.lastReviewedAt) {
            lastFcTime = Math.max(lastFcTime, new Date(p.lastReviewedAt).getTime());
          }
        }
        S_fc = (repetitionsSum / (linkedFc.length * 5)) * 100;
      }

      // B. Calculate S_qz (Quiz score) & N_qz_att
      let correctQuiz = 0;
      let totalQuiz = 0;
      let lastQuizTime = 0;

      for (const attempt of quizAttempts) {
        const questions = (attempt.questionsSnapshot as any[]) || [];
        const answers = (attempt.answersSnapshot as Record<string, number[]>) || {};

        for (const q of questions) {
          const koId = q.knowledgeObjectId || questionToKoMap[q.id];
          if (koId && koIds.includes(koId)) {
            totalQuiz++;
            const submitted = answers[q.id] || [];
            const correct = q.correct_indices || q.correctIndices || [];
            const isCorrect =
              submitted.length === correct.length &&
              submitted.every((val) => correct.includes(val));

            if (isCorrect) correctQuiz++;
            if (attempt.submittedAt) {
              lastQuizTime = Math.max(lastQuizTime, new Date(attempt.submittedAt).getTime());
            }
          }
        }
      }

      const S_qz = totalQuiz > 0 ? (correctQuiz / totalQuiz) * 100 : 0;
      const N_qz_att = totalQuiz;

      // C. Calculate S_tut (Tutor signals score) & N_tut_act
      const N_tut_act = tutorEvents.length;
      const S_tut = Math.min(100, N_tut_act * 10);
      let lastTutTime = 0;
      if (tutorEvents.length > 0) {
        lastTutTime = Math.max(...tutorEvents.map(e => new Date(e.createdAt).getTime()));
      }

      // D. Unified Mastery Score (M_mu)
      let M_mu = 0;
      if (linkedFc.length > 0 || totalQuiz > 0) {
        const hasFc = linkedFc.length > 0;
        const hasQz = totalQuiz > 0;
        
        if (hasFc && hasQz) {
          M_mu = (0.25 * S_fc) + (0.65 * S_qz) + (0.10 * S_tut);
        } else if (hasQz) {
          M_mu = (0.90 * S_qz) + (0.10 * S_tut);
        } else {
          M_mu = (0.90 * S_fc) + (0.10 * S_tut);
        }
      }

      // E. Confidence Score (C_mu) with time-decay
      let C_mu = 0;
      if (linkedFc.length > 0 || totalQuiz > 0 || N_tut_act > 0) {
        const rawConfidence = Math.min(
          1.0,
          0.15 * Math.log(1 + N_fc_rev) + 
          0.40 * Math.log(1 + N_qz_att) + 
          0.10 * N_tut_act
        );

        const lastActiveTime = Math.max(lastFcTime, lastQuizTime, lastTutTime);
        if (lastActiveTime > 0) {
          const deltaDays = Math.max(0, (now - lastActiveTime) / (1000 * 60 * 60 * 24));
          const decay = Math.exp(-0.03 * deltaDays);
          C_mu = rawConfidence * decay;
        } else {
          C_mu = rawConfidence;
        }
      }

      // F. Dynamic Threshold based on difficulty
      const diff = group.difficulty;
      const threshold = diff === "easy" ? 75 : diff === "medium" ? 70 : 60;
      const isWeak = (linkedFc.length > 0 || totalQuiz > 0) && (M_mu < threshold);

      // Return metrics mapped to primary concept ID and supporting KO IDs (for compatibility and E2E verification)
      for (const conceptId of group.conceptIds) {
        result[conceptId] = {
          masteryScore: Math.round(M_mu),
          confidence: Number(C_mu.toFixed(2)),
          isWeak,
          threshold,
        };
      }
      for (const koId of group.koIds) {
        result[koId] = {
          masteryScore: Math.round(M_mu),
          confidence: Number(C_mu.toFixed(2)),
          isWeak,
          threshold,
        };
      }
    }

    return result;
  }

  /**
   * Identifies student's weak concepts using the new Mastery Unit score model.
   */
  static async getWeakConcepts(studentId: string): Promise<string[]> {
    // Find all unique courseIds that have active KOs in the database
    const activeCourses = await db
      .selectDistinct({
        courseId: knowledgeObjects.courseId,
      })
      .from(knowledgeObjects)
      .where(eq(knowledgeObjects.status, "active"));

    if (activeCourses.length === 0) return [];

    const weakConceptIds: string[] = [];

    for (const course of activeCourses) {
      const courseMastery = await this.calculateCourseMastery(studentId, course.courseId);
      for (const [conceptId, metrics] of Object.entries(courseMastery)) {
        if (metrics.isWeak) {
          weakConceptIds.push(conceptId);
        }
      }
    }

    return weakConceptIds;
  }
}
