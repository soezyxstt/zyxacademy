import { randomUUID } from "node:crypto";
import { db } from "@/db";
import {
  studentConceptMastery,
  studentConceptMasteryHistory,
  learningEvents,
  enrollments,
  interventions,
  courses,
  tutorCourses,
  courseAnalyticsSnapshots,
  studentQuizAttempts,
  quizTemplates,
  aiQuestionBank,
  knowledgeObjects,
  questionOptionStats,
  user,
} from "@/db/schema";
import { and, desc, eq, gt, gte, inArray, sql, count, avg } from "drizzle-orm";
import { QUESTION_TOTAL_INDEX } from "@/lib/option-stats";

const MIN_STUDENTS = 5;
const MIN_QUESTION_ATTEMPTS = 5;

// ─── Base types (P6A) ────────────────────────────────────────────────────────

export interface WeakConcept {
  conceptName: string;
  avgMastery: number;
  studentCount: number;
  bucketLow: number;
  bucketMid: number;
  bucketHigh: number;
}

export interface TutorCourseRow {
  courseId: string;
  title: string;
  enrolledCount: number;
}

export interface CohortAnalytics {
  courseTitle: string;
  enrolledCount: number;
  activeCount: number;
  weakConcepts: WeakConcept[];
  allConcepts: WeakConcept[];
  interventionCounts: { conceptName: string; count: number }[];
}

// ─── Snapshot types (P6B) ────────────────────────────────────────────────────

export interface ConceptTrend {
  week: string;       // "W1" … "W4" (oldest first)
  avgMastery: number;
}

export interface MostMissedQuestion {
  id: string;
  prompt: string;
  correctRate: number;
  attemptCount: number;
}

export interface WatchlistStudent {
  studentId: string;
  name: string;
  decliningConcepts: string[];
  activeInterventionCount: number;
  lastActiveAt: string | null; // ISO string
}

/** Cohort-wide misconception prevalence: closes the audit's "aggregate, not just per-attempt" gap. */
export interface MisconceptionStat {
  misconceptionKoId: string;
  label: string;
  conceptName: string;
  pctSelected: number; // % of attempts at questions tagging this misconception that picked it
  sampleSize: number;  // total attempts across those questions
}

export interface SnapshotPayload extends CohortAnalytics {
  conceptTrends: Record<string, ConceptTrend[]>;
  mostMissed: Record<string, MostMissedQuestion[]>;
  topMisconceptions: MisconceptionStat[];
  watchlist: WatchlistStudent[];
  engagement: {
    quizParticipationPct: number;
    flashcardAdherencePct: number;
  };
}

export interface SnapshotRow {
  payload: SnapshotPayload;
  updatedAt: Date;
}

// ─── P6A: Live query ─────────────────────────────────────────────────────────

export async function getCohortAnalytics(courseId: string): Promise<CohortAnalytics> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const now = new Date();

  const [courseRow, enrolledRows, activeRows, conceptRows, interventionRows] = await Promise.all([
    db.select({ title: courses.title }).from(courses).where(eq(courses.id, courseId)).limit(1),

    db
      .select({ n: count() })
      .from(enrollments)
      .where(and(eq(enrollments.courseId, courseId), gt(enrollments.expiresAt, now))),

    db
      .select({ activeCount: sql<number>`COUNT(DISTINCT ${learningEvents.studentId})` })
      .from(learningEvents)
      .where(
        and(eq(learningEvents.courseId, courseId), gt(learningEvents.createdAt, sevenDaysAgo))
      ),

    db
      .select({
        conceptName: studentConceptMastery.conceptName,
        avgMastery: avg(studentConceptMastery.masteryScore),
        studentCount: count(),
        bucketLow: sql<number>`SUM(CASE WHEN ${studentConceptMastery.masteryScore} < 30 THEN 1 ELSE 0 END)`,
        bucketMid: sql<number>`SUM(CASE WHEN ${studentConceptMastery.masteryScore} >= 30 AND ${studentConceptMastery.masteryScore} < 60 THEN 1 ELSE 0 END)`,
        bucketHigh: sql<number>`SUM(CASE WHEN ${studentConceptMastery.masteryScore} >= 60 THEN 1 ELSE 0 END)`,
      })
      .from(studentConceptMastery)
      .where(
        and(
          eq(studentConceptMastery.courseId, courseId),
          gt(studentConceptMastery.evidenceCount, 0)
        )
      )
      .groupBy(studentConceptMastery.conceptName)
      .having(sql`COUNT(*) >= ${MIN_STUDENTS}`),

    db
      .select({ conceptName: interventions.conceptName, n: count() })
      .from(interventions)
      .where(and(eq(interventions.courseId, courseId), eq(interventions.status, "active")))
      .groupBy(interventions.conceptName),
  ]);

  const concepts: WeakConcept[] = conceptRows.map((r) => ({
    conceptName: r.conceptName,
    avgMastery: Math.round(Number(r.avgMastery) || 0),
    studentCount: r.studentCount,
    bucketLow: Number(r.bucketLow) || 0,
    bucketMid: Number(r.bucketMid) || 0,
    bucketHigh: Number(r.bucketHigh) || 0,
  }));

  const sorted = [...concepts].sort((a, b) => a.avgMastery - b.avgMastery);

  return {
    courseTitle: courseRow[0]?.title ?? "",
    enrolledCount: enrolledRows[0]?.n ?? 0,
    activeCount: Number(activeRows[0]?.activeCount) || 0,
    weakConcepts: sorted.slice(0, 10),
    allConcepts: sorted,
    interventionCounts: interventionRows.map((r) => ({ conceptName: r.conceptName, count: r.n })),
  };
}

// ─── P6B: Snapshot read ───────────────────────────────────────────────────────

export async function readCourseSnapshot(courseId: string): Promise<SnapshotRow | null> {
  const [row] = await db
    .select()
    .from(courseAnalyticsSnapshots)
    .where(eq(courseAnalyticsSnapshots.courseId, courseId))
    .orderBy(desc(courseAnalyticsSnapshots.createdAt))
    .limit(1);

  if (!row) return null;
  return { payload: row.payload as SnapshotPayload, updatedAt: row.createdAt };
}

// ─── P6B: Snapshot compute + upsert ──────────────────────────────────────────

export async function computeSnapshotPayload(courseId: string): Promise<SnapshotPayload> {
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();
  const twentyEightDaysAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const historyWeek = sql<string>`to_char(${studentConceptMasteryHistory.snapshotDate}::date, 'YYYY') || '-W' || lpad(floor((extract(doy from ${studentConceptMasteryHistory.snapshotDate}::date) + 6 - (extract(isodow from ${studentConceptMasteryHistory.snapshotDate}::date) - 1)) / 7)::text, 2, '0')`;

  // Run base analytics and all P6B queries in parallel
  const [
    base,
    historyRows,
    completedAttempts,
    interventionStudentRows,
    decliningRows,
    enrolledRows,
    activeAttemptStudents,
  ] = await Promise.all([
    getCohortAnalytics(courseId),

    // 4-week trend from mastery history
    db
      .select({
        conceptName: studentConceptMasteryHistory.conceptName,
        week: historyWeek,
        avgMastery: avg(studentConceptMasteryHistory.masteryScore),
      })
      .from(studentConceptMasteryHistory)
      .where(
        and(
          eq(studentConceptMasteryHistory.courseId, courseId),
          gte(studentConceptMasteryHistory.snapshotDate, twentyEightDaysAgo.toISOString().slice(0, 10))
        )
      )
      .groupBy(
        studentConceptMasteryHistory.conceptName,
        historyWeek
      )
      .orderBy(
        studentConceptMasteryHistory.conceptName,
        historyWeek
      ),

    // Completed attempts for most-missed computation (last 28 days)
    db
      .select({
        questionsSnapshot: studentQuizAttempts.questionsSnapshot,
        answersSnapshot: studentQuizAttempts.answersSnapshot,
      })
      .from(studentQuizAttempts)
      .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
      .where(
        and(
          eq(quizTemplates.courseId, courseId),
          eq(studentQuizAttempts.status, "completed"),
          gte(studentQuizAttempts.startedAt, twentyEightDaysAgo)
        )
      ),

    // Students with >= 2 active interventions
    db
      .select({
        studentId: interventions.studentId,
        interventionCount: count(),
      })
      .from(interventions)
      .where(and(eq(interventions.courseId, courseId), eq(interventions.status, "active")))
      .groupBy(interventions.studentId)
      .having(sql`COUNT(*) >= 2`),

    // Students declining on >= 3 concepts
    db
      .select({
        studentId: studentConceptMastery.studentId,
        concepts: sql<string>`string_agg(${studentConceptMastery.conceptName}, ',')`,
      })
      .from(studentConceptMastery)
      .where(
        and(
          eq(studentConceptMastery.courseId, courseId),
          eq(studentConceptMastery.trend, "declining")
        )
      )
      .groupBy(studentConceptMastery.studentId)
      .having(sql`COUNT(*) >= 3`),

    // Enrolled count for engagement %
    db
      .select({ n: count() })
      .from(enrollments)
      .where(and(eq(enrollments.courseId, courseId), gt(enrollments.expiresAt, now))),

    // Distinct students with completed attempt in last 7 days (quiz participation)
    db
      .select({ activeCount: sql<number>`COUNT(DISTINCT ${studentQuizAttempts.studentId})` })
      .from(studentQuizAttempts)
      .innerJoin(quizTemplates, eq(studentQuizAttempts.templateId, quizTemplates.id))
      .where(
        and(
          eq(quizTemplates.courseId, courseId),
          eq(studentQuizAttempts.status, "completed"),
          gte(studentQuizAttempts.startedAt, sevenDaysAgo)
        )
      ),
  ]);

  // ── Trend series ─────────────────────────────────────────────────────────

  const conceptTrends: Record<string, ConceptTrend[]> = {};
  for (const row of historyRows) {
    if (!conceptTrends[row.conceptName]) conceptTrends[row.conceptName] = [];
    conceptTrends[row.conceptName].push({
      week: row.week,
      avgMastery: Math.round(Number(row.avgMastery) || 0),
    });
  }
  // Label weeks W1..W4 (oldest first, already sorted by query)
  for (const conceptName of Object.keys(conceptTrends)) {
    conceptTrends[conceptName] = conceptTrends[conceptName].map((pt, i) => ({
      week: `W${i + 1}`,
      avgMastery: pt.avgMastery,
    }));
  }

  // ── Most-missed questions (in-memory from attempt snapshots) ─────────────

  type QSnap = { id: string; correct_indices: number[] };
  type ASnap = Record<string, number[]>;

  const qStats: Map<string, { total: number; correct: number }> = new Map();

  for (const attempt of completedAttempts) {
    const qs = (attempt.questionsSnapshot ?? []) as QSnap[];
    const as_ = (attempt.answersSnapshot ?? {}) as ASnap;
    for (const q of qs) {
      const existing = qStats.get(q.id) ?? { total: 0, correct: 0 };
      const submitted: number[] = as_[q.id] ?? [];
      const isCorrect =
        submitted.length === q.correct_indices.length &&
        submitted.every((i) => q.correct_indices.includes(i));
      qStats.set(q.id, { total: existing.total + 1, correct: existing.correct + (isCorrect ? 1 : 0) });
    }
  }

  const eligibleQIds = [...qStats.entries()]
    .filter(([, s]) => s.total >= MIN_QUESTION_ATTEMPTS)
    .map(([id]) => id);

  const mostMissed: Record<string, MostMissedQuestion[]> = {};

  if (eligibleQIds.length > 0) {
    const bankRows = await db
      .select({
        id: aiQuestionBank.id,
        prompt: aiQuestionBank.prompt,
        koId: aiQuestionBank.knowledgeObjectId,
        conceptName: knowledgeObjects.conceptName,
      })
      .from(aiQuestionBank)
      .leftJoin(knowledgeObjects, eq(aiQuestionBank.knowledgeObjectId, knowledgeObjects.id))
      .where(inArray(aiQuestionBank.id, eligibleQIds));

    for (const row of bankRows) {
      const concept = row.conceptName ?? "_unknown";
      const stats = qStats.get(row.id)!;
      const correctRate = stats.total > 0 ? stats.correct / stats.total : 0;
      if (!mostMissed[concept]) mostMissed[concept] = [];
      mostMissed[concept].push({
        id: row.id,
        prompt: row.prompt,
        correctRate: Math.round(correctRate * 100) / 100,
        attemptCount: stats.total,
      });
    }

    // Sort each concept's list by correctRate ascending (most missed first), keep top 5
    for (const concept of Object.keys(mostMissed)) {
      mostMissed[concept] = mostMissed[concept]
        .sort((a, b) => a.correctRate - b.correctRate)
        .slice(0, 5);
    }
  }

  // ── Top misconceptions (cohort-wide aggregation over tagged distractors) ──
  // distractorMap tags individual wrong options on a question with a
  // misconceptionKoId at generation time (lib/distractor-mapper.ts); this
  // aggregates real selection data across every published question in the
  // course that tags a given misconception, answering "what % of students
  // hold this specific wrong belief," not just "did this one student."

  const topMisconceptions: MisconceptionStat[] = [];

  const taggedQuestions = await db
    .select({
      id: aiQuestionBank.id,
      distractorMap: aiQuestionBank.distractorMap,
      conceptName: knowledgeObjects.conceptName,
    })
    .from(aiQuestionBank)
    .leftJoin(knowledgeObjects, eq(aiQuestionBank.knowledgeObjectId, knowledgeObjects.id))
    .where(and(eq(aiQuestionBank.courseId, courseId), eq(aiQuestionBank.reviewStatus, "published")));

  const misconceptionQuestionIds = taggedQuestions
    .filter((q) => (q.distractorMap ?? []).some((d) => d.kind === "misconception" && d.misconceptionKoId))
    .map((q) => q.id);

  if (misconceptionQuestionIds.length > 0) {
    const optionStatRows = await db
      .select()
      .from(questionOptionStats)
      .where(inArray(questionOptionStats.questionId, misconceptionQuestionIds));

    const statsByQuestion = new Map<string, typeof optionStatRows>();
    for (const row of optionStatRows) {
      const arr = statsByQuestion.get(row.questionId) ?? [];
      arr.push(row);
      statsByQuestion.set(row.questionId, arr);
    }

    const agg = new Map<string, { label: string; conceptName: string; selected: number; totalAttempts: number }>();

    for (const q of taggedQuestions) {
      const map = q.distractorMap ?? [];
      const stats = statsByQuestion.get(q.id) ?? [];
      const totalAttempts = stats.find((s) => s.optionIndex === QUESTION_TOTAL_INDEX)?.totalAttempts ?? 0;
      if (totalAttempts < MIN_QUESTION_ATTEMPTS) continue;

      for (const d of map) {
        if (d.kind !== "misconception" || !d.misconceptionKoId) continue;
        const selected = stats.find((s) => s.optionIndex === d.optionIndex)?.selectedCount ?? 0;
        const existing = agg.get(d.misconceptionKoId) ?? {
          label: d.label,
          conceptName: q.conceptName ?? "_unknown",
          selected: 0,
          totalAttempts: 0,
        };
        existing.selected += selected;
        existing.totalAttempts += totalAttempts;
        agg.set(d.misconceptionKoId, existing);
      }
    }

    for (const [misconceptionKoId, v] of agg.entries()) {
      topMisconceptions.push({
        misconceptionKoId,
        label: v.label,
        conceptName: v.conceptName,
        pctSelected: v.totalAttempts > 0 ? Math.round((v.selected / v.totalAttempts) * 100) : 0,
        sampleSize: v.totalAttempts,
      });
    }
    topMisconceptions.sort((a, b) => b.pctSelected - a.pctSelected);
  }

  // ── Watchlist ─────────────────────────────────────────────────────────────

  const watchlistStudentIds = new Set<string>();
  const interventionCountMap: Map<string, number> = new Map();
  for (const row of interventionStudentRows) {
    watchlistStudentIds.add(row.studentId);
    interventionCountMap.set(row.studentId, row.interventionCount);
  }

  const decliningConceptsMap: Map<string, string[]> = new Map();
  for (const row of decliningRows) {
    watchlistStudentIds.add(row.studentId);
    decliningConceptsMap.set(row.studentId, (row.concepts ?? "").split(",").filter(Boolean));
  }

  const watchlist: WatchlistStudent[] = [];

  if (watchlistStudentIds.size > 0) {
    const studentRows = await db
      .select({ id: user.id, name: user.name, lastActivityAt: user.lastActivityAt })
      .from(user)
      .where(inArray(user.id, [...watchlistStudentIds]));

    for (const s of studentRows) {
      watchlist.push({
        studentId: s.id,
        name: s.name,
        decliningConcepts: decliningConceptsMap.get(s.id) ?? [],
        activeInterventionCount: interventionCountMap.get(s.id) ?? 0,
        lastActiveAt: s.lastActivityAt?.toISOString() ?? null,
      });
    }
  }

  // ── Engagement ────────────────────────────────────────────────────────────

  const enrolled = enrolledRows[0]?.n ?? 0;
  const activeQuizStudents = Number(activeAttemptStudents[0]?.activeCount) || 0;
  const quizParticipationPct =
    enrolled > 0 ? Math.round((activeQuizStudents / enrolled) * 100) : 0;

  // ── Assemble payload ──────────────────────────────────────────────────────

  const payload: SnapshotPayload = {
    ...base,
    conceptTrends,
    mostMissed,
    topMisconceptions,
    watchlist,
    engagement: { quizParticipationPct, flashcardAdherencePct: 0 },
  };

  // Upsert snapshot row
  await db
    .insert(courseAnalyticsSnapshots)
    .values({
      id: randomUUID(),
      courseId,
      date: today,
      payload: payload as unknown as Record<string, unknown>,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: [courseAnalyticsSnapshots.courseId, courseAnalyticsSnapshots.date],
      set: { payload: payload as unknown as Record<string, unknown>, createdAt: now },
    });

  return payload;
}

// ─── P6A: Course list ─────────────────────────────────────────────────────────

export async function getTutorCourseList(
  tutorId: string,
  isAdmin: boolean
): Promise<TutorCourseRow[]> {
  const now = new Date();

  let courseList: { courseId: string; title: string }[];

  if (isAdmin) {
    courseList = await db
      .select({ courseId: courses.id, title: courses.title })
      .from(courses);
  } else {
    courseList = await db
      .select({ courseId: tutorCourses.courseId, title: courses.title })
      .from(tutorCourses)
      .innerJoin(courses, eq(tutorCourses.courseId, courses.id))
      .where(eq(tutorCourses.tutorId, tutorId));
  }

  const result: TutorCourseRow[] = [];
  for (const r of courseList) {
    const [ec] = await db
      .select({ n: count() })
      .from(enrollments)
      .where(and(eq(enrollments.courseId, r.courseId), gt(enrollments.expiresAt, now)));
    result.push({ courseId: r.courseId, title: r.title, enrolledCount: ec?.n ?? 0 });
  }
  return result;
}
