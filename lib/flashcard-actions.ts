import { db } from "@/db";
import {
  flashcards,
  flashcardSets,
  studentFlashcardProgress,
  knowledgeObjects,
  enrollments,
  flashcardReviews,
  learningEvents,
  flashcardIde,
} from "@/db/schema";
import { eq, and, lte, or, inArray, isNull, gt } from "drizzle-orm";
import { calculateSM2 } from "./flashcard-scheduler";
import { randomUUID } from "crypto";
import { inngest } from "@/lib/inngest";
import { markRecommendationDone } from "@/lib/recommendation-service";
import { env } from "@/lib/env";
import { dualWriteFlashcardReview, dualWriteLearningEvent } from "@/lib/migrasi/repository-kompatibilitas";
import { recordLearningEvidence } from "@/lib/pemahaman/evidence";

export interface FlashcardHistoryItem {
  reviewedAt: string;
  grade: number; // 1-4
  easeFactorBefore: number;
  easeFactorAfter: number;
  intervalBeforeDays: number;
  intervalAfterDays: number;
  boxBefore: number;
  boxAfter: number;
  wasCorrect: boolean;
  isExamMode: boolean;
  examInputAnswer?: string;
  examInputPassed?: boolean;
}

// ==========================================
// STRING NORMALIZATION FOR EXAM GRADERS
// ==========================================

function normalizeAnswer(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, " ") // Replace punctuation/special chars with space
    .replace(/\s+/g, " ") // Normalize multiple spaces
    .trim();
}

/**
 * Validates if the typed answer is conceptually correct compared to the answer key.
 */
export function evaluateExamAnswer(userAnswer: string, correctAnswer: string): boolean {
  const normUser = normalizeAnswer(userAnswer);
  const normCorrect = normalizeAnswer(correctAnswer);
  if (!normUser || !normCorrect) return false;
  return normCorrect.includes(normUser) || normUser.includes(normCorrect);
}

// ==========================================
// ACTION: FETCH ACTIVE REVIEW QUEUE
// ==========================================

export async function getReviewQueue(studentId: string, courseId: string) {
  // Find published flashcard sets of this course
  const publishedSets = await db
    .select()
    .from(flashcardSets)
    .where(
      and(
        eq(flashcardSets.courseId, courseId),
        eq(flashcardSets.status, "published")
      )
    );

  if (publishedSets.length === 0) return [];

  const setIds = publishedSets.map(s => s.id);

  // Fetch all active flashcards in these sets
  const allCards = await db
    .select()
    .from(flashcards)
    .where(
      and(
        inArray(flashcards.setId, setIds),
        eq(flashcards.status, "active")
      )
    );

  if (allCards.length === 0) return [];

  const cardIds = allCards.map(c => c.id);

  // Fetch progress records
  const progressRows = await db
    .select()
    .from(studentFlashcardProgress)
    .where(
      and(
        eq(studentFlashcardProgress.studentId, studentId),
        inArray(studentFlashcardProgress.flashcardId, cardIds)
      )
    );

  const progressMap = new Map(progressRows.map(r => [r.flashcardId, r]));

  const queue: any[] = [];

  allCards.forEach(card => {
    const progress = progressMap.get(card.id);

    if (!progress) {
      // New Card (repetition count = 0, due immediately)
      queue.push({
        card,
        progress: null,
        dueStatus: "new",
        nextReviewDue: new Date(0), // Outdated timestamp ensures priority
      });
    } else {
      // Review Card: check if due date has passed
      const isDue = progress.dueDate.getTime() <= Date.now();
      if (isDue) {
        queue.push({
          card,
          progress,
          dueStatus: "review",
          nextReviewDue: progress.dueDate,
        });
      }
    }
  });

  // Sort queue: New cards and overdue cards first
  return queue.sort((a, b) => a.nextReviewDue.getTime() - b.nextReviewDue.getTime());
}

// ==========================================
// ACTION: SUBMIT STUDENT RECALL GRADE
// ==========================================

interface ReviewSubmissionResult {
  nextReviewDue: Date;
  nextIntervalDays: number;
  nextBox: number;
  examInputPassed?: boolean;
}

export async function submitReview(
  studentId: string,
  flashcardId: string,
  grade: number, // 1: Again, 2: Hard, 3: Good, 4: Easy
  manualAnswer?: string,
  isExamMode: boolean = false
): Promise<ReviewSubmissionResult> {
  const [cardRecord] = await db
    .select()
    .from(flashcards)
    .where(eq(flashcards.id, flashcardId))
    .limit(1);

  if (!cardRecord) {
    throw new Error(`Flashcard not found with ID: ${flashcardId}`);
  }

  let examInputPassed: boolean | undefined = undefined;
  if (isExamMode && manualAnswer) {
    examInputPassed = evaluateExamAnswer(manualAnswer, cardRecord.back);
  }

  const res = await submitFlashcardReviewTx(studentId, flashcardId, grade, 0);

  return {
    nextReviewDue: res.progress.dueDate,
    nextIntervalDays: res.progress.intervalDays,
    nextBox: res.progress.repetitions,
    examInputPassed,
  };
}

export async function submitFlashcardReviewTx(
  studentId: string,
  flashcardId: string,
  grade: number,
  responseTimeMs: number
) {
  // Fetch flashcard and course
  const [card] = await db
    .select({
      id: flashcards.id,
      koId: flashcards.koId,
      setId: flashcards.setId,
    })
    .from(flashcards)
    .where(eq(flashcards.id, flashcardId))
    .limit(1);

  if (!card) throw new Error("Flashcard not found");

  const [set] = await db
    .select({
      courseId: flashcardSets.courseId,
    })
    .from(flashcardSets)
    .where(eq(flashcardSets.id, card.setId))
    .limit(1);

  if (!set) throw new Error("Flashcard set not found");

  let conceptName: string | null = null;
  if (card.koId) {
    const [ko] = await db
      .select({ conceptName: knowledgeObjects.conceptName })
      .from(knowledgeObjects)
      .where(eq(knowledgeObjects.id, card.koId))
      .limit(1);
    conceptName = ko?.conceptName || null;
  }

  const correctnessMap: Record<number, number> = {
    1: 0.0,
    2: 0.5,
    3: 0.8,
    4: 1.0,
  };
  const correctness = correctnessMap[grade] ?? 0.0;

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(studentFlashcardProgress)
      .where(
        and(
          eq(studentFlashcardProgress.studentId, studentId),
          eq(studentFlashcardProgress.flashcardId, flashcardId)
        )
      )
      .limit(1);

    const prevProgress = existing || {
      easeFactor: 2.5,
      intervalDays: 0,
      repetitions: 0,
      lapses: 0,
      lastReviewedAt: null,
    };

    const schedule = calculateSM2(
      {
        easeFactor: Number(prevProgress.easeFactor),
        intervalDays: prevProgress.intervalDays,
        repetitions: prevProgress.repetitions,
        lapses: prevProgress.lapses,
        lastReviewedAt: prevProgress.lastReviewedAt ? new Date(prevProgress.lastReviewedAt) : null,
      },
      grade
    );

    const now = new Date();
    const dataToSave = {
      studentId,
      flashcardId,
      easeFactor: schedule.easeFactor,
      intervalDays: schedule.intervalDays,
      repetitions: schedule.repetitions,
      lapses: schedule.lapses,
      dueDate: schedule.dueDate,
      lastReviewedAt: now,
      updatedAt: now,
    };

    let progressResult;
    if (existing) {
      await tx
        .update(studentFlashcardProgress)
        .set(dataToSave)
        .where(eq(studentFlashcardProgress.id, existing.id));
      progressResult = { ...existing, ...dataToSave };
    } else {
      const newId = `progress-${randomUUID()}`;
      progressResult = {
        id: newId,
        createdAt: now,
        ...dataToSave,
      };
      await tx.insert(studentFlashcardProgress).values(progressResult);
    }

    const reviewId = `review-${randomUUID()}`;
    const reviewRow = {
      id: reviewId,
      studentId,
      flashcardId,
      grade,
      responseTimeMs,
      reviewedAt: now,
    };
    await tx.insert(flashcardReviews).values(reviewRow);

    const eventId = randomUUID();
    const eventRow = {
      id: eventId,
      studentId,
      courseId: set.courseId,
      conceptName,
      koId: card.koId,
      eventType: "flashcard_review" as const,
      correctness,
      weight: 1.0,
      createdAt: now,
    };
    await tx.insert(learningEvents).values(eventRow);
    await dualWriteFlashcardReview(tx, {
      id: reviewRow.id,
      studentId,
      flashcardId,
      grade,
      responseTimeMs,
      reviewedAt: now,
      progress: {
        dueDate: progressResult.dueDate,
        intervalDays: progressResult.intervalDays,
        easeFactor: Number(progressResult.easeFactor),
        repetitions: progressResult.repetitions,
        lapses: progressResult.lapses,
        lastReviewedAt: progressResult.lastReviewedAt,
      },
    }, studentId);
    await dualWriteLearningEvent(tx, eventRow, studentId);

    return {
      progress: progressResult,
      review: reviewRow,
      learningEvent: eventRow,
    };
  });

  await recordFlashcardIdeaEvidence(studentId, flashcardId, result.review.id, correctness, new Date());

  // Post-transaction tasks (Inngest, Recommendations)
  try {
    await inngest.send({
      name: "mastery/recompute.requested",
      data: { studentId, courseId: set.courseId },
    });
  } catch (err) {
    console.error("Failed to trigger recompute:", err);
  }

  if (env.FEATURE_TODAY === "1") {
    Promise.resolve().then(async () => {
      const now = new Date();
      const remaining = await db
        .selectDistinct({ id: flashcards.id })
        .from(flashcards)
        .innerJoin(flashcardSets, eq(flashcards.setId, flashcardSets.id))
        .innerJoin(
          enrollments,
          and(
            eq(flashcardSets.courseId, enrollments.courseId),
            eq(enrollments.userId, studentId),
            gt(enrollments.expiresAt, now)
          )
        )
        .leftJoin(
          studentFlashcardProgress,
          and(
            eq(studentFlashcardProgress.flashcardId, flashcards.id),
            eq(studentFlashcardProgress.studentId, studentId)
          )
        )
        .where(
          and(
            eq(flashcards.status, "active"),
            eq(flashcardSets.status, "published"),
            or(
              isNull(studentFlashcardProgress.id),
              lte(studentFlashcardProgress.dueDate, now)
            )
          )
        )
        .limit(1);
      if (remaining.length === 0) {
        await markRecommendationDone("flashcards", studentId);
      }
    }).catch(() => {});
  }

  return result;
}

export async function skipFlashcardTx(
  studentId: string,
  flashcardId: string
) {
  // Fetch flashcard and course
  const [card] = await db
    .select({
      id: flashcards.id,
      koId: flashcards.koId,
      setId: flashcards.setId,
    })
    .from(flashcards)
    .where(eq(flashcards.id, flashcardId))
    .limit(1);

  if (!card) throw new Error("Flashcard not found");

  const [set] = await db
    .select({
      courseId: flashcardSets.courseId,
    })
    .from(flashcardSets)
    .where(eq(flashcardSets.id, card.setId))
    .limit(1);

  if (!set) throw new Error("Flashcard set not found");

  let conceptName: string | null = null;
  if (card.koId) {
    const [ko] = await db
      .select({ conceptName: knowledgeObjects.conceptName })
      .from(knowledgeObjects)
      .where(eq(knowledgeObjects.id, card.koId))
      .limit(1);
    conceptName = ko?.conceptName || null;
  }

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(studentFlashcardProgress)
      .where(
        and(
          eq(studentFlashcardProgress.studentId, studentId),
          eq(studentFlashcardProgress.flashcardId, flashcardId)
        )
      )
      .limit(1);

    const now = new Date();
    // For skip: easeFactor, repetitions, lapses remain same, but intervalDays = 0, dueDate = now
    const dataToSave = {
      studentId,
      flashcardId,
      easeFactor: existing ? Number(existing.easeFactor) : 2.5,
      intervalDays: 0,
      repetitions: existing ? existing.repetitions : 0,
      lapses: existing ? existing.lapses : 0,
      dueDate: now,
      lastReviewedAt: now,
      updatedAt: now,
    };

    let progressResult;
    if (existing) {
      await tx
        .update(studentFlashcardProgress)
        .set(dataToSave)
        .where(eq(studentFlashcardProgress.id, existing.id));
      progressResult = { ...existing, ...dataToSave };
    } else {
      const newId = `progress-${randomUUID()}`;
      progressResult = {
        id: newId,
        createdAt: now,
        ...dataToSave,
      };
      await tx.insert(studentFlashcardProgress).values(progressResult);
    }

    const reviewId = `review-${randomUUID()}`;
    const reviewRow = {
      id: reviewId,
      studentId,
      flashcardId,
      grade: 1, // Again
      responseTimeMs: 0,
      reviewedAt: now,
    };
    await tx.insert(flashcardReviews).values(reviewRow);

    const eventId = randomUUID();
    const eventRow = {
      id: eventId,
      studentId,
      courseId: set.courseId,
      conceptName,
      koId: card.koId,
      eventType: "flashcard_review" as const,
      correctness: 0.0,
      weight: 1.0,
      createdAt: now,
    };
    await tx.insert(learningEvents).values(eventRow);
    await dualWriteFlashcardReview(tx, {
      id: reviewRow.id,
      studentId,
      flashcardId,
      grade: 1,
      responseTimeMs: 0,
      reviewedAt: now,
      progress: {
        dueDate: progressResult.dueDate,
        intervalDays: progressResult.intervalDays,
        easeFactor: Number(progressResult.easeFactor),
        repetitions: progressResult.repetitions,
        lapses: progressResult.lapses,
        lastReviewedAt: progressResult.lastReviewedAt,
      },
    }, studentId);
    await dualWriteLearningEvent(tx, eventRow, studentId);

    return {
      progress: progressResult,
      review: reviewRow,
      learningEvent: eventRow,
    };
  });

  await recordFlashcardIdeaEvidence(studentId, flashcardId, result.review.id, 0, new Date());

  try {
    await inngest.send({
      name: "mastery/recompute.requested",
      data: { studentId, courseId: set.courseId },
    });
  } catch (err) {
    console.error("Failed to trigger recompute:", err);
  }

  return result;
}

async function recordFlashcardIdeaEvidence(
  studentId: string,
  flashcardId: string,
  reviewId: string,
  scoreContribution: number,
  occurredAt: Date,
): Promise<void> {
  if (env.FEATURE_PEMAHAMAN_IDE_V1 !== "1") return;

  const links = await db
    .select({ ideId: flashcardIde.ideId, weight: flashcardIde.weight })
    .from(flashcardIde)
    .where(eq(flashcardIde.flashcardId, flashcardId));

  for (const link of links) {
    await recordLearningEvidence({
      penggunaId: studentId,
      ideId: link.ideId,
      evidenceSource: "flashcard_review",
      sourceId: reviewId,
      scoreContribution: Math.max(0, Math.min(1, scoreContribution * link.weight)),
      confidence: scoreContribution >= 0.8 ? 85 : 75,
      derivationStatus: "deterministic",
      affectsMastery: true,
      occurredAt,
    });
  }
}
