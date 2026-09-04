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
  flashcard as canonicalFlashcard,
  setFlashcard,
  kemajuanFlashcardMurid,
  reviewFlashcard,
  pemahamanIde,
} from "@/db/schema";
import { eq, and, lte, or, inArray, isNull, gt } from "drizzle-orm";
import { calculateSM2 } from "./flashcard-scheduler";
import { randomUUID } from "crypto";
import { inngest } from "@/lib/inngest";
import { markRecommendationDone } from "@/lib/recommendation-service";
import { dualWriteFlashcardReview, dualWriteLearningEvent } from "@/lib/migrasi/repository-kompatibilitas";
import { recordLearningEvidence } from "@/lib/pemahaman/evidence";
import { isStudentEnrolled, resolveStudentCourse } from "@/lib/student/course-catalog";
import { rankFlashcardQueue, type FlashcardQueuePriorityInput } from "@/lib/flashcard-ranking";

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

function flashcardPriorityReason(item: FlashcardQueuePriorityInput): string {
  if (!item.ideaId) return "Tanpa pemetaan Idea";
  if ((item.masteryScore ?? 0) < 40) return "Perlu dikuasai";
  if (!item.seenBefore) return "Kartu baru";
  return "Waktunya mengulang";
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
  const course = await resolveStudentCourse(courseId);
  if (course?.canonicalId) {
    const canonicalCards = await db
      .select({
        id: canonicalFlashcard.id,
        setId: canonicalFlashcard.setFlashcardId,
        front: canonicalFlashcard.front,
        back: canonicalFlashcard.back,
        explanation: canonicalFlashcard.explanation,
        status: canonicalFlashcard.status,
        createdAt: canonicalFlashcard.createdAt,
      })
      .from(canonicalFlashcard)
      .innerJoin(setFlashcard, eq(canonicalFlashcard.setFlashcardId, setFlashcard.id))
      .where(
        and(
          eq(setFlashcard.mataKuliahId, course.canonicalId),
          eq(setFlashcard.status, "published"),
          eq(canonicalFlashcard.status, "published"),
        ),
      );

    if (canonicalCards.length > 0) {
      const progressRows = await db
        .select()
        .from(kemajuanFlashcardMurid)
        .where(
          and(
            eq(kemajuanFlashcardMurid.penggunaId, studentId),
            inArray(kemajuanFlashcardMurid.flashcardId, canonicalCards.map((card) => card.id)),
          ),
        );
      const progressByCard = new Map(progressRows.map((row) => [row.flashcardId, row]));
      const ideaRows = await db
        .select({
          flashcardId: flashcardIde.flashcardId,
          ideaId: flashcardIde.ideId,
          masteryScore: pemahamanIde.skor,
          confidence: pemahamanIde.keyakinan,
        })
        .from(flashcardIde)
        .leftJoin(
          pemahamanIde,
          and(eq(pemahamanIde.ideId, flashcardIde.ideId), eq(pemahamanIde.penggunaId, studentId)),
        )
        .where(inArray(flashcardIde.flashcardId, canonicalCards.map((card) => card.id)));
      const ideaByCard = new Map<string, (typeof ideaRows)[number]>();
      for (const row of ideaRows) {
        const current = ideaByCard.get(row.flashcardId);
        if (
          !current
          || (row.masteryScore ?? 0) < (current.masteryScore ?? 0)
          || ((row.masteryScore ?? 0) === (current.masteryScore ?? 0) && row.ideaId.localeCompare(current.ideaId) < 0)
        ) {
          ideaByCard.set(row.flashcardId, row);
        }
      }
      const now = Date.now();
      const eligible = canonicalCards
        .flatMap((card) => {
          const progress = progressByCard.get(card.id);
          if (progress && (progress.status !== "active" || progress.dueAt.getTime() > now)) return [];
          const idea = ideaByCard.get(card.id);
          const priority = {
            cardId: card.id,
            ideaId: idea?.ideaId ?? null,
            masteryScore: idea?.masteryScore ?? null,
            confidence: idea?.confidence ?? null,
            seenBefore: Boolean(progress?.lastReviewedAt),
            nextReviewDue: progress?.dueAt ?? new Date(0),
          };
          return [{
            ...priority,
            priorityReason: flashcardPriorityReason(priority),
            card: { ...card, koId: null, metadata: { source: "canonical", ideaId: priority.ideaId } },
            progress: progress ?? null,
            dueStatus: progress ? "review" as const : "new" as const,
          }];
        });
      return rankFlashcardQueue(eligible);
    }
  }

  // Find published flashcard sets of this course
  const publishedSets = await db
    .select()
    .from(flashcardSets)
    .where(
      and(
        eq(flashcardSets.courseId, course?.legacyId ?? courseId),
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
  return rankFlashcardQueue(queue.map((item) => {
    const priority = {
      ...item,
      cardId: item.card.id,
      ideaId: null,
      masteryScore: null,
      confidence: null,
      seenBefore: Boolean(item.progress?.lastReviewedAt),
    };
    return { ...priority, priorityReason: flashcardPriorityReason(priority) };
  }));
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

  const [canonicalCardRecord] = cardRecord
    ? []
    : await db.select().from(canonicalFlashcard).where(eq(canonicalFlashcard.id, flashcardId)).limit(1);
  if (!cardRecord && !canonicalCardRecord) throw new Error(`Flashcard not found with ID: ${flashcardId}`);
  const [reviewCourse] = cardRecord
    ? await db
        .select({ courseId: flashcardSets.courseId })
        .from(flashcardSets)
        .where(eq(flashcardSets.id, cardRecord.setId))
        .limit(1)
    : await db
        .select({ courseId: setFlashcard.mataKuliahId })
        .from(setFlashcard)
        .where(eq(setFlashcard.id, canonicalCardRecord!.setFlashcardId))
        .limit(1);
  if (!reviewCourse || !(await isStudentEnrolled(studentId, reviewCourse.courseId))) {
    throw new Error("Student is not enrolled in this flashcard course");
  }

  let examInputPassed: boolean | undefined = undefined;
  if (isExamMode && manualAnswer) {
    examInputPassed = evaluateExamAnswer(manualAnswer, cardRecord?.back ?? canonicalCardRecord!.back);
  }

  const res = await submitFlashcardReviewTx(studentId, flashcardId, grade, 0);

  return {
    nextReviewDue: res.progress.dueDate,
    nextIntervalDays: res.progress.intervalDays,
    nextBox: res.progress.repetitions,
    examInputPassed,
  };
}

async function submitCanonicalFlashcardReviewTx(
  studentId: string,
  flashcardId: string,
  grade: number,
  responseTimeMs: number,
) {
  const [card] = await db
    .select({
      id: canonicalFlashcard.id,
      status: canonicalFlashcard.status,
      setStatus: setFlashcard.status,
    })
    .from(canonicalFlashcard)
    .innerJoin(setFlashcard, eq(canonicalFlashcard.setFlashcardId, setFlashcard.id))
    .where(eq(canonicalFlashcard.id, flashcardId))
    .limit(1);
  if (!card || card.status !== "published" || card.setStatus !== "published") {
    throw new Error("Published canonical flashcard not found");
  }

  const correctnessMap: Record<number, number> = { 1: 0, 2: 0.5, 3: 0.8, 4: 1 };
  const correctness = correctnessMap[grade] ?? 0;
  const now = new Date();
  const result = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(kemajuanFlashcardMurid)
      .where(
        and(
          eq(kemajuanFlashcardMurid.penggunaId, studentId),
          eq(kemajuanFlashcardMurid.flashcardId, flashcardId),
        ),
      )
      .limit(1);
    const schedule = calculateSM2(
      {
        easeFactor: existing?.easeFactor ?? 2.5,
        intervalDays: existing?.intervalDays ?? 0,
        repetitions: existing?.repetitions ?? 0,
        lapses: existing?.lapses ?? 0,
        lastReviewedAt: existing?.lastReviewedAt ?? null,
      },
      grade,
    );
    const progressValues = {
      penggunaId: studentId,
      flashcardId,
      dueAt: schedule.dueDate,
      intervalDays: schedule.intervalDays,
      easeFactor: schedule.easeFactor,
      repetitions: schedule.repetitions,
      lapses: schedule.lapses,
      lastReviewedAt: now,
      status: "active" as const,
      updatedAt: now,
    };
    const progressId = existing?.id ?? `canonical-progress-${randomUUID()}`;
    if (existing) {
      await tx.update(kemajuanFlashcardMurid).set(progressValues).where(eq(kemajuanFlashcardMurid.id, existing.id));
    } else {
      await tx.insert(kemajuanFlashcardMurid).values({ id: progressId, ...progressValues, createdAt: now });
    }

    const reviewId = `canonical-review-${randomUUID()}`;
    await tx.insert(reviewFlashcard).values({
      id: reviewId,
      kemajuanFlashcardMuridId: progressId,
      grade,
      responseMs: Math.max(0, responseTimeMs),
      previousDueAt: existing?.dueAt ?? now,
      nextDueAt: schedule.dueDate,
      reviewedAt: now,
    });
    return {
      review: { id: reviewId, grade, reviewedAt: now },
      progress: {
        id: progressId,
        ...progressValues,
        dueDate: schedule.dueDate,
      },
    };
  });

  await recordFlashcardIdeaEvidence(studentId, flashcardId, result.review.id, correctness, now);
  return result;
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

  if (!card) return submitCanonicalFlashcardReviewTx(studentId, flashcardId, grade, responseTimeMs);

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

  // Idea evidence is recorded via recordFlashcardIdeaEvidence above (debounced via Inngest).
  // Legacy learningEvents are preserved in DB; legacy course-wide mastery is updated at session/quiz boundaries.

  {
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

  // Idea evidence is recorded via recordFlashcardIdeaEvidence above (debounced via Inngest).

  return result;
}

async function recordFlashcardIdeaEvidence(
  studentId: string,
  flashcardId: string,
  reviewId: string,
  scoreContribution: number,
  occurredAt: Date,
): Promise<void> {
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
