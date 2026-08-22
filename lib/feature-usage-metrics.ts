import { db } from "@/db";
import {
  chatSessions,
  flashcardReviews,
  liveQuizResults,
  percobaanAsesmen,
  studentMaterialProgress,
  studentQuizAttempts,
  tutorChatMessages,
} from "@/db/schema";
import { and, eq, sql, type AnyColumn } from "drizzle-orm";
import { daysAgo, formatIsoDateUtc } from "@/lib/date-utils";

export const FEATURE_USAGE_RANGES = [7, 30, 90] as const;
export type FeatureUsageRange = (typeof FEATURE_USAGE_RANGES)[number];
export const DEFAULT_FEATURE_USAGE_RANGE: FeatureUsageRange = 30;

export function resolveFeatureUsageRange(value: string | undefined): FeatureUsageRange {
  const parsed = Number(value);
  return (FEATURE_USAGE_RANGES as readonly number[]).includes(parsed)
    ? (parsed as FeatureUsageRange)
    : DEFAULT_FEATURE_USAGE_RANGE;
}

export type FeatureUsageRow = {
  key: string;
  label: string;
  events: number;
  users: number;
  lastUsedAt: string | null;
  detail: string | null;
};

export type FeatureUsageDailyPoint = {
  date: string;
  materi: number;
  flashcard: number;
  kuis: number;
  asesmen: number;
  kuisLive: number;
  zyra: number;
};

export type FeatureUsageMetrics = {
  rangeDays: FeatureUsageRange;
  windowStartIso: string;
  rows: FeatureUsageRow[];
  daily: FeatureUsageDailyPoint[];
  totals: {
    events: number;
    activeUsers: number;
    topFeatureLabel: string | null;
    topFeatureSharePercent: number | null;
  };
};

const num = (value: unknown): number => Number(value ?? 0);
const isoFromEpochSeconds = (value: unknown): string | null => {
  const seconds = Number(value ?? 0);
  return seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
};

/**
 * Some legacy rows store epoch milliseconds instead of epoch seconds
 * (see app/api/admin/ai-analytics/usage/route.ts for the same guard).
 * Normalize to seconds before comparing or grouping.
 */
const EPOCH_MS_THRESHOLD = 9_999_999_999;

const epochSecondsExpr = (column: AnyColumn) =>
  sql<number>`(case when ${column} > ${EPOCH_MS_THRESHOLD} then ${column} / 1000 else ${column} end)`;

const withinWindow = (column: AnyColumn, startEpochSeconds: number) =>
  sql`${epochSecondsExpr(column)} >= ${startEpochSeconds}`;

const maxEpochSeconds = (column: AnyColumn) =>
  sql<number>`max(${epochSecondsExpr(column)})`;

const dayExpr = (column: AnyColumn) =>
  sql<string>`strftime('%Y-%m-%d', datetime(${epochSecondsExpr(column)}, 'unixepoch'))`;

/**
 * Cross-feature student usage read model. Aggregates existing per-domain
 * tables into one ranked view; it does not introduce new event writes.
 */
export async function getFeatureUsageMetrics(
  rangeDays: FeatureUsageRange
): Promise<FeatureUsageMetrics> {
  const windowStart = daysAgo(rangeDays);
  const startEpochSeconds = Math.floor(windowStart.getTime() / 1000);

  const [
    materiStats,
    flashcardStats,
    quizStats,
    assessmentStats,
    liveQuizStats,
    zyraMessageStats,
    zyraSessionStats,
    materiDaily,
    flashcardDaily,
    quizDaily,
    assessmentDaily,
    liveQuizDaily,
    zyraDaily,
    activeUserIds,
  ] = await Promise.all([
    db
      .select({
        events: sql<number>`count(*)`,
        users: sql<number>`count(distinct ${studentMaterialProgress.studentId})`,
        lastUsedAt: maxEpochSeconds(studentMaterialProgress.lastOpenedAt),
      })
      .from(studentMaterialProgress)
      .where(withinWindow(studentMaterialProgress.lastOpenedAt, startEpochSeconds)),

    db
      .select({
        events: sql<number>`count(*)`,
        users: sql<number>`count(distinct ${flashcardReviews.studentId})`,
        lastUsedAt: maxEpochSeconds(flashcardReviews.reviewedAt),
      })
      .from(flashcardReviews)
      .where(withinWindow(flashcardReviews.reviewedAt, startEpochSeconds)),

    db
      .select({
        events: sql<number>`count(*)`,
        completed: sql<number>`sum(case when ${studentQuizAttempts.status} = 'completed' then 1 else 0 end)`,
        users: sql<number>`count(distinct ${studentQuizAttempts.studentId})`,
        lastUsedAt: maxEpochSeconds(studentQuizAttempts.startedAt),
      })
      .from(studentQuizAttempts)
      .where(withinWindow(studentQuizAttempts.startedAt, startEpochSeconds)),

    db
      .select({
        events: sql<number>`count(*)`,
        submitted: sql<number>`sum(case when ${percobaanAsesmen.submittedAt} is not null then 1 else 0 end)`,
        users: sql<number>`count(distinct ${percobaanAsesmen.penggunaId})`,
        lastUsedAt: maxEpochSeconds(percobaanAsesmen.createdAt),
      })
      .from(percobaanAsesmen)
      .where(withinWindow(percobaanAsesmen.createdAt, startEpochSeconds)),

    db
      .select({
        events: sql<number>`count(*)`,
        users: sql<number>`count(distinct ${liveQuizResults.studentId})`,
        lastUsedAt: maxEpochSeconds(liveQuizResults.completedAt),
      })
      .from(liveQuizResults)
      .where(withinWindow(liveQuizResults.completedAt, startEpochSeconds)),

    db
      .select({
        events: sql<number>`count(*)`,
        users: sql<number>`count(distinct ${tutorChatMessages.studentId})`,
        lastUsedAt: maxEpochSeconds(tutorChatMessages.createdAt),
      })
      .from(tutorChatMessages)
      .where(
        and(
          eq(tutorChatMessages.role, "student"),
          withinWindow(tutorChatMessages.createdAt, startEpochSeconds)
        )
      ),

    db
      .select({ count: sql<number>`count(*)` })
      .from(chatSessions)
      .where(withinWindow(chatSessions.startedAt, startEpochSeconds)),

    db
      .select({ date: dayExpr(studentMaterialProgress.lastOpenedAt), count: sql<number>`count(*)` })
      .from(studentMaterialProgress)
      .where(withinWindow(studentMaterialProgress.lastOpenedAt, startEpochSeconds))
      .groupBy(dayExpr(studentMaterialProgress.lastOpenedAt)),

    db
      .select({ date: dayExpr(flashcardReviews.reviewedAt), count: sql<number>`count(*)` })
      .from(flashcardReviews)
      .where(withinWindow(flashcardReviews.reviewedAt, startEpochSeconds))
      .groupBy(dayExpr(flashcardReviews.reviewedAt)),

    db
      .select({ date: dayExpr(studentQuizAttempts.startedAt), count: sql<number>`count(*)` })
      .from(studentQuizAttempts)
      .where(withinWindow(studentQuizAttempts.startedAt, startEpochSeconds))
      .groupBy(dayExpr(studentQuizAttempts.startedAt)),

    db
      .select({ date: dayExpr(percobaanAsesmen.createdAt), count: sql<number>`count(*)` })
      .from(percobaanAsesmen)
      .where(withinWindow(percobaanAsesmen.createdAt, startEpochSeconds))
      .groupBy(dayExpr(percobaanAsesmen.createdAt)),

    db
      .select({ date: dayExpr(liveQuizResults.completedAt), count: sql<number>`count(*)` })
      .from(liveQuizResults)
      .where(withinWindow(liveQuizResults.completedAt, startEpochSeconds))
      .groupBy(dayExpr(liveQuizResults.completedAt)),

    db
      .select({ date: dayExpr(tutorChatMessages.createdAt), count: sql<number>`count(*)` })
      .from(tutorChatMessages)
      .where(
        and(
          eq(tutorChatMessages.role, "student"),
          withinWindow(tutorChatMessages.createdAt, startEpochSeconds)
        )
      )
      .groupBy(dayExpr(tutorChatMessages.createdAt)),

    Promise.all([
      db
        .selectDistinct({ id: studentMaterialProgress.studentId })
        .from(studentMaterialProgress)
        .where(withinWindow(studentMaterialProgress.lastOpenedAt, startEpochSeconds)),
      db
        .selectDistinct({ id: flashcardReviews.studentId })
        .from(flashcardReviews)
        .where(withinWindow(flashcardReviews.reviewedAt, startEpochSeconds)),
      db
        .selectDistinct({ id: studentQuizAttempts.studentId })
        .from(studentQuizAttempts)
        .where(withinWindow(studentQuizAttempts.startedAt, startEpochSeconds)),
      db
        .selectDistinct({ id: percobaanAsesmen.penggunaId })
        .from(percobaanAsesmen)
        .where(withinWindow(percobaanAsesmen.createdAt, startEpochSeconds)),
      db
        .selectDistinct({ id: liveQuizResults.studentId })
        .from(liveQuizResults)
        .where(withinWindow(liveQuizResults.completedAt, startEpochSeconds)),
      db
        .selectDistinct({ id: tutorChatMessages.studentId })
        .from(tutorChatMessages)
        .where(
          and(
          eq(tutorChatMessages.role, "student"),
          withinWindow(tutorChatMessages.createdAt, startEpochSeconds)
        )
        ),
    ]),
  ]);

  const newZyraSessions = num(zyraSessionStats[0]?.count);

  const rows: FeatureUsageRow[] = [
    {
      key: "materi",
      label: "Materi & Dokumen",
      events: num(materiStats[0]?.events),
      users: num(materiStats[0]?.users),
      lastUsedAt: isoFromEpochSeconds(materiStats[0]?.lastUsedAt),
      detail: "Dibuka berdasarkan progres baca terakhir",
    },
    {
      key: "flashcard",
      label: "Flashcard",
      events: num(flashcardStats[0]?.events),
      users: num(flashcardStats[0]?.users),
      lastUsedAt: isoFromEpochSeconds(flashcardStats[0]?.lastUsedAt),
      detail: "Kartulir direview (SM-2)",
    },
    {
      key: "kuis",
      label: "Kuis Mandiri",
      events: num(quizStats[0]?.events),
      users: num(quizStats[0]?.users),
      lastUsedAt: isoFromEpochSeconds(quizStats[0]?.lastUsedAt),
      detail: `${num(quizStats[0]?.completed)} percobaan selesai`,
    },
    {
      key: "asesmen",
      label: "Asesmen v2",
      events: num(assessmentStats[0]?.events),
      users: num(assessmentStats[0]?.users),
      lastUsedAt: isoFromEpochSeconds(assessmentStats[0]?.lastUsedAt),
      detail: `${num(assessmentStats[0]?.submitted)} disubmit`,
    },
    {
      key: "kuisLive",
      label: "Kuis Live Kelas",
      events: num(liveQuizStats[0]?.events),
      users: num(liveQuizStats[0]?.users),
      lastUsedAt: isoFromEpochSeconds(liveQuizStats[0]?.lastUsedAt),
      detail: "Hasil kuis live yang diselesaikan",
    },
    {
      key: "zyra",
      label: "Zyra Chat",
      events: num(zyraMessageStats[0]?.events),
      users: num(zyraMessageStats[0]?.users),
      lastUsedAt: isoFromEpochSeconds(zyraMessageStats[0]?.lastUsedAt),
      detail: `${newZyraSessions} sesi baru dimulai`,
    },
  ].sort((a, b) => b.events - a.events || a.label.localeCompare(b.label));

  const dailyByDate = new Map<string, FeatureUsageDailyPoint>();
  for (let i = rangeDays - 1; i >= 0; i -= 1) {
    const date = formatIsoDateUtc(daysAgo(i));
    dailyByDate.set(date, {
      date,
      materi: 0,
      flashcard: 0,
      kuis: 0,
      asesmen: 0,
      kuisLive: 0,
      zyra: 0,
    });
  }

  const applyDaily = (
    series: Array<{ date: string; count: number }>,
    key: keyof Omit<FeatureUsageDailyPoint, "date">
  ) => {
    for (const point of series) {
      const bucket = dailyByDate.get(point.date);
      if (bucket) bucket[key] = num(point.count);
    }
  };

  applyDaily(materiDaily, "materi");
  applyDaily(flashcardDaily, "flashcard");
  applyDaily(quizDaily, "kuis");
  applyDaily(assessmentDaily, "asesmen");
  applyDaily(liveQuizDaily, "kuisLive");
  applyDaily(zyraDaily, "zyra");

  const uniqueActiveUsers = new Set<string>();
  for (const source of activeUserIds) {
    for (const row of source) uniqueActiveUsers.add(row.id);
  }

  const totalEvents = rows.reduce((sum, row) => sum + row.events, 0);
  const topRow = rows[0];

  return {
    rangeDays,
    windowStartIso: windowStart.toISOString(),
    rows,
    daily: Array.from(dailyByDate.values()),
    totals: {
      events: totalEvents,
      activeUsers: uniqueActiveUsers.size,
      topFeatureLabel: topRow && topRow.events > 0 ? topRow.label : null,
      topFeatureSharePercent:
        topRow && topRow.events > 0 && totalEvents > 0
          ? Math.round((topRow.events / totalEvents) * 100)
          : null,
    },
  };
}
