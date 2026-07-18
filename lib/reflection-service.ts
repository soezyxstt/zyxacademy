import { db } from "@/db";
import {
  learningEvents,
  studentQuizAttempts,
  submissions,
  exams,
  studentConceptMasteryHistory,
  studentStreaks,
  weeklyReflections,
} from "@/db/schema";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { formatIsoDate, previousWeekRange } from "@/lib/date-utils";

export function getPreviousWeekRange(now: Date) {
  return previousWeekRange(now);
}

export function formatDateStr(date: Date): string {
  return formatIsoDate(date);
}

export async function computeWeeklyReflection(studentId: string, now: Date) {
  const { monday, sunday } = getPreviousWeekRange(now);
  const weekStartStr = formatDateStr(monday);
  const sundayStr = formatDateStr(sunday);
  
  const dayBeforeMonday = new Date(monday);
  dayBeforeMonday.setDate(monday.getDate() - 1);
  const dayBeforeMondayStr = formatDateStr(dayBeforeMonday);

  // 1. Fetch learning events within the previous Monday to Sunday window
  const events = await db
    .select()
    .from(learningEvents)
    .where(
      and(
        eq(learningEvents.studentId, studentId),
        gte(learningEvents.createdAt, monday),
        lte(learningEvents.createdAt, sunday)
      )
    );

  if (events.length === 0) {
    // Inactive students get NO row, no guilt content
    return null;
  }

  // 2. Count completed activities
  const flashcardCount = events.filter((e) => e.eventType === "flashcard_review").length;
  const moduleCount = events.filter((e) => e.eventType === "material_completed").length;

  // Quizzes count:
  // - Completed studentQuizAttempts in this week
  const quizAttempts = await db
    .select()
    .from(studentQuizAttempts)
    .where(
      and(
        eq(studentQuizAttempts.studentId, studentId),
        eq(studentQuizAttempts.status, "completed"),
        gte(studentQuizAttempts.submittedAt, monday),
        lte(studentQuizAttempts.submittedAt, sunday)
      )
    );
    
  // - Exam submissions of type 'quiz' in this week
  const examSubmissions = await db
    .select()
    .from(submissions)
    .innerJoin(exams, eq(submissions.examId, exams.id))
    .where(
      and(
        eq(submissions.userId, studentId),
        eq(exams.type, "quiz"),
        gte(submissions.submittedAt, monday),
        lte(submissions.submittedAt, sunday)
      )
    );

  const quizzesCount = quizAttempts.length + examSubmissions.length;

  // 3. Find unique concepts evidenced this week
  const evidencedConcepts = Array.from(
    new Set(events.map((e) => e.conceptName).filter((c): c is string => !!c))
  );

  // 4. Fetch history snapshots for the student up to Sunday
  const historyRows = await db
    .select()
    .from(studentConceptMasteryHistory)
    .where(
      and(
        eq(studentConceptMasteryHistory.studentId, studentId),
        lte(studentConceptMasteryHistory.snapshotDate, sundayStr)
      )
    )
    .orderBy(desc(studentConceptMasteryHistory.snapshotDate));

  // 5. Compute deltas and find the most improved concept
  let totalMasteryGrowth = 0;
  let mostImprovedConcept: string | null = null;
  let maxDelta = 0;
  let maxEvidence = -1;

  for (const concept of evidencedConcepts) {
    // Latest snapshot up to Sunday (first match due to DESC order)
    const latestRow = historyRows.find((r) => r.conceptName === concept);
    const latestScore = latestRow?.masteryScore ?? 0;

    // Snapshot up to Day Before Monday
    const prevRow = historyRows.find(
      (r) => r.conceptName === concept && r.snapshotDate <= dayBeforeMondayStr
    );
    const prevScore = prevRow?.masteryScore ?? 0;

    const delta = latestScore - prevScore;
    totalMasteryGrowth += delta;

    if (delta > 0) {
      const evidence = events.filter((e) => e.conceptName === concept).length;
      if (delta > maxDelta) {
        maxDelta = delta;
        maxEvidence = evidence;
        mostImprovedConcept = concept;
      } else if (delta === maxDelta) {
        if (evidence > maxEvidence) {
          maxEvidence = evidence;
          mostImprovedConcept = concept;
        }
      }
    }
  }

  // 6. Fetch current and longest streak
  const [streakRow] = await db
    .select()
    .from(studentStreaks)
    .where(eq(studentStreaks.studentId, studentId))
    .limit(1);

  const currentStreak = streakRow?.currentStreak ?? 0;
  const longestStreak = streakRow?.longestStreak ?? 0;

  // 7. Save weekly reflection (idempotent unique insert-or-ignore)
  const payload = {
    completed: {
      quizzes: quizzesCount,
      flashcards: flashcardCount,
      modules: moduleCount,
    },
    masteryGrowth: totalMasteryGrowth,
    mostImproved: mostImprovedConcept,
    streak: {
      currentStreak,
      longestStreak,
    },
  };

  await db
    .insert(weeklyReflections)
    .values({
      id: randomUUID(),
      studentId,
      weekStart: weekStartStr,
      payload,
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  const [reflectionRow] = await db
    .select()
    .from(weeklyReflections)
    .where(
      and(
        eq(weeklyReflections.studentId, studentId),
        eq(weeklyReflections.weekStart, weekStartStr)
      )
    )
    .limit(1);

  return reflectionRow ?? null;
}
