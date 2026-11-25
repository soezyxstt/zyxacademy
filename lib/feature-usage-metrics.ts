import { db } from "@/db";
import {
  bookings,
  chatSessions,
  discussionMessages,
  discussionThreads,
  flashcardReviews,
  kemajuanBacaArtikel,
  kemajuanFlashcardMurid,
  liveQuizResults,
  reviewFlashcard,
  studentMaterialProgress,
  studentQuizAttempts,
  submissions,
  tutorChatMessages,
} from "@/db/schema";
import { and, eq, isNotNull, isNull, ne, sql, type AnyColumn } from "drizzle-orm";
import { elapsedDaysAgo, formatIsoDateUtc } from "@/lib/date-utils";

export const FEATURE_USAGE_RANGES = [7, 30, 90] as const;
export type FeatureUsageRange = (typeof FEATURE_USAGE_RANGES)[number];
export const DEFAULT_FEATURE_USAGE_RANGE: FeatureUsageRange = 30;

export const FEATURE_USAGE_KEYS = [
  "materi",
  "flashcard",
  "kuis",
  "tryout",
  "kuisLive",
  "zyra",
  "diskusi",
  "tutorial",
] as const;
export type FeatureUsageKey = (typeof FEATURE_USAGE_KEYS)[number];

export const FEATURE_USAGE_LABELS: Record<FeatureUsageKey, string> = {
  materi: "Materi & Dokumen",
  flashcard: "Flashcard",
  kuis: "Kuis Mandiri",
  tryout: "Tryout",
  kuisLive: "Kuis Live Kelas",
  zyra: "Zyra Chat",
  diskusi: "Diskusi",
  tutorial: "Sesi Tutorial",
};

export function resolveFeatureUsageRange(value: string | undefined): FeatureUsageRange {
  const parsed = Number(value);
  return (FEATURE_USAGE_RANGES as readonly number[]).includes(parsed)
    ? (parsed as FeatureUsageRange)
    : DEFAULT_FEATURE_USAGE_RANGE;
}

export type FeatureUsageRow = {
  key: FeatureUsageKey;
  label: string;
  events: number;
  previousEvents: number;
  trendPercent: number | null;
  users: number;
  adoptionPercent: number;
  eventsPerUser: number;
  lastUsedAt: string | null;
  detailCount?: number;
};

export type FeatureUsageDailyPoint = {
  date: string;
} & Record<FeatureUsageKey, number>;

export type FeatureUsageMetrics = {
  rangeDays: FeatureUsageRange;
  windowStartIso: string;
  rows: FeatureUsageRow[];
  daily: FeatureUsageDailyPoint[];
  totals: {
    events: number;
    previousEvents: number;
    trendPercent: number | null;
    activeUsers: number;
    topFeatureKey: FeatureUsageKey | null;
    topFeatureLabel: string | null;
    topFeatureSharePercent: number | null;
  };
  insights: {
    fastestGrowing: { key: FeatureUsageKey; trendPercent: number } | null;
    highestAdoption: { key: FeatureUsageKey; adoptionPercent: number } | null;
    needsAttention: { key: FeatureUsageKey; adoptionPercent: number; events: number } | null;
  };
};

export type FeatureSourceSnapshot = {
  events: number;
  previousEvents: number;
  userIds: string[];
  lastUsedEpochSeconds: number;
  daily: Array<{ date: string; count: number }>;
  detailCount?: number;
};

const num = (value: unknown): number => Number(value ?? 0);

const isoFromEpochSeconds = (value: unknown): string | null => {
  const seconds = Number(value ?? 0);
  return seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
};

const calcTrendPercent = (current: number, previous: number): number | null => {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
};

const withinWindow = (column: AnyColumn, startEpochSeconds: number, endEpochSeconds: number) =>
  sql`${column} >= to_timestamp(${startEpochSeconds}) and ${column} <= to_timestamp(${endEpochSeconds})`;

const maxEpochSeconds = (column: AnyColumn) =>
  sql<number>`extract(epoch from max(${column}))`;

const dayExpr = (column: AnyColumn) =>
  sql<string>`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

export function featureUsageDailyDates(rangeDays: FeatureUsageRange, now: Date): string[] {
  return Array.from({ length: rangeDays + 1 }, (_, i) =>
    formatIsoDateUtc(elapsedDaysAgo(rangeDays - i, now))
  );
}

/**
 * Pure aggregation engine for cross-feature telemetry.
 * Merges multiple canonical + legacy source snapshots per feature, deduplicates
 * unique active students across all features, builds stacked UTC daily series,
 * and computes period-over-period trends and adoption insights.
 */
export function aggregateFeatureUsage(input: {
  rangeDays: FeatureUsageRange;
  now: Date;
  windowStart: Date;
  sourcesByFeature: Record<FeatureUsageKey, FeatureSourceSnapshot[]>;
}): FeatureUsageMetrics {
  const { rangeDays, now, windowStart, sourcesByFeature } = input;

  const uniqueActiveUsers = new Set<string>();
  const mergedByFeature = {} as Record<
    FeatureUsageKey,
    {
      events: number;
      previousEvents: number;
      users: Set<string>;
      lastUsedEpochSeconds: number;
      detailCount: number;
      hasDetail: boolean;
      daily: Array<{ date: string; count: number }>;
    }
  >;

  for (const key of FEATURE_USAGE_KEYS) {
    const snapshots = sourcesByFeature[key] ?? [];
    const users = new Set<string>();
    let events = 0;
    let previousEvents = 0;
    let lastUsedEpochSeconds = 0;
    let detailCount = 0;
    let hasDetail = false;
    const daily: Array<{ date: string; count: number }> = [];

    for (const snap of snapshots) {
      events += num(snap.events);
      previousEvents += num(snap.previousEvents);
      lastUsedEpochSeconds = Math.max(lastUsedEpochSeconds, num(snap.lastUsedEpochSeconds));
      if (snap.detailCount !== undefined) {
        hasDetail = true;
        detailCount += num(snap.detailCount);
      }
      for (const userId of snap.userIds) {
        if (userId) {
          users.add(userId);
          uniqueActiveUsers.add(userId);
        }
      }
      for (const point of snap.daily) {
        daily.push(point);
      }
    }

    mergedByFeature[key] = {
      events,
      previousEvents,
      users,
      lastUsedEpochSeconds,
      detailCount,
      hasDetail,
      daily,
    };
  }

  const activeUsersCount = uniqueActiveUsers.size;

  const rows: FeatureUsageRow[] = FEATURE_USAGE_KEYS.map((key) => {
    const agg = mergedByFeature[key];
    const usersCount = agg.users.size;
    return {
      key,
      label: FEATURE_USAGE_LABELS[key],
      events: agg.events,
      previousEvents: agg.previousEvents,
      trendPercent: calcTrendPercent(agg.events, agg.previousEvents),
      users: usersCount,
      adoptionPercent: activeUsersCount > 0 ? Math.round((usersCount / activeUsersCount) * 100) : 0,
      eventsPerUser: usersCount > 0 ? Number((agg.events / usersCount).toFixed(1)) : 0,
      lastUsedAt: isoFromEpochSeconds(agg.lastUsedEpochSeconds),
      ...(agg.hasDetail ? { detailCount: agg.detailCount } : {}),
    };
  }).sort((a, b) => b.events - a.events || a.label.localeCompare(b.label));

  const dailyByDate = new Map<string, FeatureUsageDailyPoint>();
  for (const date of featureUsageDailyDates(rangeDays, now)) {
    dailyByDate.set(date, {
      date,
      materi: 0,
      flashcard: 0,
      kuis: 0,
      tryout: 0,
      kuisLive: 0,
      zyra: 0,
      diskusi: 0,
      tutorial: 0,
    });
  }

  for (const key of FEATURE_USAGE_KEYS) {
    for (const point of mergedByFeature[key].daily) {
      const bucket = dailyByDate.get(point.date);
      if (bucket) bucket[key] += num(point.count);
    }
  }

  const totalEvents = rows.reduce((sum, row) => sum + row.events, 0);
  const totalPreviousEvents = rows.reduce((sum, row) => sum + row.previousEvents, 0);
  const topRow = rows[0];

  const growingRows = rows
    .filter((r) => r.events > 0 && r.trendPercent !== null && r.trendPercent > 0)
    .sort((a, b) => (b.trendPercent ?? 0) - (a.trendPercent ?? 0));
  const fastestGrowing = growingRows[0]
    ? { key: growingRows[0].key, trendPercent: growingRows[0].trendPercent! }
    : null;

  const byAdoptionDesc = [...rows].sort((a, b) => b.adoptionPercent - a.adoptionPercent || b.events - a.events);
  const highestAdoption =
    byAdoptionDesc[0] && byAdoptionDesc[0].adoptionPercent > 0
      ? { key: byAdoptionDesc[0].key, adoptionPercent: byAdoptionDesc[0].adoptionPercent }
      : null;

  const byAdoptionAsc = [...rows].sort((a, b) => a.adoptionPercent - b.adoptionPercent || a.events - b.events);
  const needsAttention =
    activeUsersCount > 0 && byAdoptionAsc[0]
      ? {
          key: byAdoptionAsc[0].key,
          adoptionPercent: byAdoptionAsc[0].adoptionPercent,
          events: byAdoptionAsc[0].events,
        }
      : null;

  return {
    rangeDays,
    windowStartIso: windowStart.toISOString(),
    rows,
    daily: Array.from(dailyByDate.values()),
    totals: {
      events: totalEvents,
      previousEvents: totalPreviousEvents,
      trendPercent: calcTrendPercent(totalEvents, totalPreviousEvents),
      activeUsers: activeUsersCount,
      topFeatureKey: topRow && topRow.events > 0 ? topRow.key : null,
      topFeatureLabel: topRow && topRow.events > 0 ? topRow.label : null,
      topFeatureSharePercent:
        topRow && topRow.events > 0 && totalEvents > 0
          ? Math.round((topRow.events / totalEvents) * 100)
          : null,
    },
    insights: {
      fastestGrowing,
      highestAdoption,
      needsAttention,
    },
  };
}

type QueryWindow = {
  startEpochSeconds: number;
  endEpochSeconds: number;
  prevStartEpochSeconds: number;
  prevEndEpochSeconds: number;
};

async function collectMateriLegacy(w: QueryWindow): Promise<FeatureSourceSnapshot> {
  const [curr, prev, daily, users] = await Promise.all([
    db
      .select({
        events: sql<number>`count(*)`,
        completed: sql<number>`sum(case when ${studentMaterialProgress.completionPercent} >= 100 then 1 else 0 end)`,
        lastUsedAt: maxEpochSeconds(studentMaterialProgress.lastOpenedAt),
      })
      .from(studentMaterialProgress)
      .where(withinWindow(studentMaterialProgress.lastOpenedAt, w.startEpochSeconds, w.endEpochSeconds)),
    db
      .select({ events: sql<number>`count(*)` })
      .from(studentMaterialProgress)
      .where(withinWindow(studentMaterialProgress.lastOpenedAt, w.prevStartEpochSeconds, w.prevEndEpochSeconds)),
    db
      .select({ date: dayExpr(studentMaterialProgress.lastOpenedAt), count: sql<number>`count(*)` })
      .from(studentMaterialProgress)
      .where(withinWindow(studentMaterialProgress.lastOpenedAt, w.startEpochSeconds, w.endEpochSeconds))
      .groupBy(dayExpr(studentMaterialProgress.lastOpenedAt)),
    db
      .selectDistinct({ id: studentMaterialProgress.studentId })
      .from(studentMaterialProgress)
      .where(withinWindow(studentMaterialProgress.lastOpenedAt, w.startEpochSeconds, w.endEpochSeconds)),
  ]);
  return {
    events: num(curr[0]?.events),
    previousEvents: num(prev[0]?.events),
    userIds: users.map((u) => u.id),
    lastUsedEpochSeconds: num(curr[0]?.lastUsedAt),
    daily: daily.map((d) => ({ date: d.date, count: num(d.count) })),
    detailCount: num(curr[0]?.completed),
  };
}

async function collectMateriCanonical(w: QueryWindow): Promise<FeatureSourceSnapshot> {
  const [curr, prev, daily, users] = await Promise.all([
    db
      .select({
        events: sql<number>`count(*)`,
        completed: sql<number>`sum(case when ${kemajuanBacaArtikel.completedAt} is not null then 1 else 0 end)`,
        lastUsedAt: maxEpochSeconds(kemajuanBacaArtikel.lastReadAt),
      })
      .from(kemajuanBacaArtikel)
      .where(withinWindow(kemajuanBacaArtikel.lastReadAt, w.startEpochSeconds, w.endEpochSeconds)),
    db
      .select({ events: sql<number>`count(*)` })
      .from(kemajuanBacaArtikel)
      .where(withinWindow(kemajuanBacaArtikel.lastReadAt, w.prevStartEpochSeconds, w.prevEndEpochSeconds)),
    db
      .select({ date: dayExpr(kemajuanBacaArtikel.lastReadAt), count: sql<number>`count(*)` })
      .from(kemajuanBacaArtikel)
      .where(withinWindow(kemajuanBacaArtikel.lastReadAt, w.startEpochSeconds, w.endEpochSeconds))
      .groupBy(dayExpr(kemajuanBacaArtikel.lastReadAt)),
    db
      .selectDistinct({ id: kemajuanBacaArtikel.penggunaId })
      .from(kemajuanBacaArtikel)
      .where(withinWindow(kemajuanBacaArtikel.lastReadAt, w.startEpochSeconds, w.endEpochSeconds)),
  ]);
  return {
    events: num(curr[0]?.events),
    previousEvents: num(prev[0]?.events),
    userIds: users.map((u) => u.id),
    lastUsedEpochSeconds: num(curr[0]?.lastUsedAt),
    daily: daily.map((d) => ({ date: d.date, count: num(d.count) })),
    detailCount: num(curr[0]?.completed),
  };
}

async function collectFlashcardLegacy(w: QueryWindow): Promise<FeatureSourceSnapshot> {
  const [curr, prev, daily, users] = await Promise.all([
    db
      .select({
        events: sql<number>`count(*)`,
        lastUsedAt: maxEpochSeconds(flashcardReviews.reviewedAt),
      })
      .from(flashcardReviews)
      .where(withinWindow(flashcardReviews.reviewedAt, w.startEpochSeconds, w.endEpochSeconds)),
    db
      .select({ events: sql<number>`count(*)` })
      .from(flashcardReviews)
      .where(withinWindow(flashcardReviews.reviewedAt, w.prevStartEpochSeconds, w.prevEndEpochSeconds)),
    db
      .select({ date: dayExpr(flashcardReviews.reviewedAt), count: sql<number>`count(*)` })
      .from(flashcardReviews)
      .where(withinWindow(flashcardReviews.reviewedAt, w.startEpochSeconds, w.endEpochSeconds))
      .groupBy(dayExpr(flashcardReviews.reviewedAt)),
    db
      .selectDistinct({ id: flashcardReviews.studentId })
      .from(flashcardReviews)
      .where(withinWindow(flashcardReviews.reviewedAt, w.startEpochSeconds, w.endEpochSeconds)),
  ]);
  return {
    events: num(curr[0]?.events),
    previousEvents: num(prev[0]?.events),
    userIds: users.map((u) => u.id),
    lastUsedEpochSeconds: num(curr[0]?.lastUsedAt),
    daily: daily.map((d) => ({ date: d.date, count: num(d.count) })),
  };
}

async function collectFlashcardCanonical(w: QueryWindow): Promise<FeatureSourceSnapshot> {
  const [curr, prev, daily, users] = await Promise.all([
    db
      .select({
        events: sql<number>`count(*)`,
        lastUsedAt: maxEpochSeconds(reviewFlashcard.reviewedAt),
      })
      .from(reviewFlashcard)
      .where(withinWindow(reviewFlashcard.reviewedAt, w.startEpochSeconds, w.endEpochSeconds)),
    db
      .select({ events: sql<number>`count(*)` })
      .from(reviewFlashcard)
      .where(withinWindow(reviewFlashcard.reviewedAt, w.prevStartEpochSeconds, w.prevEndEpochSeconds)),
    db
      .select({ date: dayExpr(reviewFlashcard.reviewedAt), count: sql<number>`count(*)` })
      .from(reviewFlashcard)
      .where(withinWindow(reviewFlashcard.reviewedAt, w.startEpochSeconds, w.endEpochSeconds))
      .groupBy(dayExpr(reviewFlashcard.reviewedAt)),
    db
      .selectDistinct({ id: kemajuanFlashcardMurid.penggunaId })
      .from(reviewFlashcard)
      .innerJoin(
        kemajuanFlashcardMurid,
        eq(reviewFlashcard.kemajuanFlashcardMuridId, kemajuanFlashcardMurid.id)
      )
      .where(withinWindow(reviewFlashcard.reviewedAt, w.startEpochSeconds, w.endEpochSeconds)),
  ]);
  return {
    events: num(curr[0]?.events),
    previousEvents: num(prev[0]?.events),
    userIds: users.map((u) => u.id),
    lastUsedEpochSeconds: num(curr[0]?.lastUsedAt),
    daily: daily.map((d) => ({ date: d.date, count: num(d.count) })),
  };
}

async function collectQuiz(w: QueryWindow): Promise<FeatureSourceSnapshot> {
  const [curr, prev, daily, users] = await Promise.all([
    db
      .select({
        events: sql<number>`count(*)`,
        completed: sql<number>`sum(case when ${studentQuizAttempts.status} = 'completed' then 1 else 0 end)`,
        lastUsedAt: maxEpochSeconds(studentQuizAttempts.startedAt),
      })
      .from(studentQuizAttempts)
      .where(withinWindow(studentQuizAttempts.startedAt, w.startEpochSeconds, w.endEpochSeconds)),
    db
      .select({ events: sql<number>`count(*)` })
      .from(studentQuizAttempts)
      .where(withinWindow(studentQuizAttempts.startedAt, w.prevStartEpochSeconds, w.prevEndEpochSeconds)),
    db
      .select({ date: dayExpr(studentQuizAttempts.startedAt), count: sql<number>`count(*)` })
      .from(studentQuizAttempts)
      .where(withinWindow(studentQuizAttempts.startedAt, w.startEpochSeconds, w.endEpochSeconds))
      .groupBy(dayExpr(studentQuizAttempts.startedAt)),
    db
      .selectDistinct({ id: studentQuizAttempts.studentId })
      .from(studentQuizAttempts)
      .where(withinWindow(studentQuizAttempts.startedAt, w.startEpochSeconds, w.endEpochSeconds)),
  ]);
  return {
    events: num(curr[0]?.events),
    previousEvents: num(prev[0]?.events),
    userIds: users.map((u) => u.id),
    lastUsedEpochSeconds: num(curr[0]?.lastUsedAt),
    daily: daily.map((d) => ({ date: d.date, count: num(d.count) })),
    detailCount: num(curr[0]?.completed),
  };
}

async function collectTryout(w: QueryWindow): Promise<FeatureSourceSnapshot> {
  const [curr, prev, daily, users] = await Promise.all([
    db
      .select({
        events: sql<number>`count(*)`,
        graded: sql<number>`sum(case when ${submissions.status} in ('completed', 'graded') then 1 else 0 end)`,
        lastUsedAt: maxEpochSeconds(submissions.submittedAt),
      })
      .from(submissions)
      .where(and(isNotNull(submissions.submittedAt), withinWindow(submissions.submittedAt, w.startEpochSeconds, w.endEpochSeconds))),
    db
      .select({ events: sql<number>`count(*)` })
      .from(submissions)
      .where(and(isNotNull(submissions.submittedAt), withinWindow(submissions.submittedAt, w.prevStartEpochSeconds, w.prevEndEpochSeconds))),
    db
      .select({ date: dayExpr(submissions.submittedAt), count: sql<number>`count(*)` })
      .from(submissions)
      .where(and(isNotNull(submissions.submittedAt), withinWindow(submissions.submittedAt, w.startEpochSeconds, w.endEpochSeconds)))
      .groupBy(dayExpr(submissions.submittedAt)),
    db
      .selectDistinct({ id: submissions.userId })
      .from(submissions)
      .where(and(isNotNull(submissions.submittedAt), withinWindow(submissions.submittedAt, w.startEpochSeconds, w.endEpochSeconds))),
  ]);
  return {
    events: num(curr[0]?.events),
    previousEvents: num(prev[0]?.events),
    userIds: users.map((u) => u.id),
    lastUsedEpochSeconds: num(curr[0]?.lastUsedAt),
    daily: daily.map((d) => ({ date: d.date, count: num(d.count) })),
    detailCount: num(curr[0]?.graded),
  };
}

async function collectLiveQuiz(w: QueryWindow): Promise<FeatureSourceSnapshot> {
  const [curr, prev, daily, users] = await Promise.all([
    db
      .select({
        events: sql<number>`count(*)`,
        lastUsedAt: maxEpochSeconds(liveQuizResults.completedAt),
      })
      .from(liveQuizResults)
      .where(withinWindow(liveQuizResults.completedAt, w.startEpochSeconds, w.endEpochSeconds)),
    db
      .select({ events: sql<number>`count(*)` })
      .from(liveQuizResults)
      .where(withinWindow(liveQuizResults.completedAt, w.prevStartEpochSeconds, w.prevEndEpochSeconds)),
    db
      .select({ date: dayExpr(liveQuizResults.completedAt), count: sql<number>`count(*)` })
      .from(liveQuizResults)
      .where(withinWindow(liveQuizResults.completedAt, w.startEpochSeconds, w.endEpochSeconds))
      .groupBy(dayExpr(liveQuizResults.completedAt)),
    db
      .selectDistinct({ id: liveQuizResults.studentId })
      .from(liveQuizResults)
      .where(withinWindow(liveQuizResults.completedAt, w.startEpochSeconds, w.endEpochSeconds)),
  ]);
  return {
    events: num(curr[0]?.events),
    previousEvents: num(prev[0]?.events),
    userIds: users.map((u) => u.id),
    lastUsedEpochSeconds: num(curr[0]?.lastUsedAt),
    daily: daily.map((d) => ({ date: d.date, count: num(d.count) })),
  };
}

async function collectZyraChat(w: QueryWindow): Promise<FeatureSourceSnapshot> {
  const [curr, sessions, prev, daily, users] = await Promise.all([
    db
      .select({
        events: sql<number>`count(*)`,
        lastUsedAt: maxEpochSeconds(tutorChatMessages.createdAt),
      })
      .from(tutorChatMessages)
      .where(
        and(
          eq(tutorChatMessages.role, "student"),
          withinWindow(tutorChatMessages.createdAt, w.startEpochSeconds, w.endEpochSeconds)
        )
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(chatSessions)
      .where(withinWindow(chatSessions.startedAt, w.startEpochSeconds, w.endEpochSeconds)),
    db
      .select({ events: sql<number>`count(*)` })
      .from(tutorChatMessages)
      .where(
        and(
          eq(tutorChatMessages.role, "student"),
          withinWindow(tutorChatMessages.createdAt, w.prevStartEpochSeconds, w.prevEndEpochSeconds)
        )
      ),
    db
      .select({ date: dayExpr(tutorChatMessages.createdAt), count: sql<number>`count(*)` })
      .from(tutorChatMessages)
      .where(
        and(
          eq(tutorChatMessages.role, "student"),
          withinWindow(tutorChatMessages.createdAt, w.startEpochSeconds, w.endEpochSeconds)
        )
      )
      .groupBy(dayExpr(tutorChatMessages.createdAt)),
    db
      .selectDistinct({ id: tutorChatMessages.studentId })
      .from(tutorChatMessages)
      .where(
        and(
          eq(tutorChatMessages.role, "student"),
          withinWindow(tutorChatMessages.createdAt, w.startEpochSeconds, w.endEpochSeconds)
        )
      ),
  ]);
  return {
    events: num(curr[0]?.events),
    previousEvents: num(prev[0]?.events),
    userIds: users.map((u) => u.id),
    lastUsedEpochSeconds: num(curr[0]?.lastUsedAt),
    daily: daily.map((d) => ({ date: d.date, count: num(d.count) })),
    detailCount: num(sessions[0]?.count),
  };
}

async function collectDiscussions(w: QueryWindow): Promise<FeatureSourceSnapshot> {
  const activeFilter = (start: number, end: number) =>
    and(
      eq(discussionMessages.kind, "human"),
      isNull(discussionMessages.deletedAt),
      isNotNull(discussionMessages.authorId),
      withinWindow(discussionMessages.createdAt, start, end)
    );

  const [curr, threads, prev, daily, users] = await Promise.all([
    db
      .select({
        events: sql<number>`count(*)`,
        lastUsedAt: maxEpochSeconds(discussionMessages.createdAt),
      })
      .from(discussionMessages)
      .where(activeFilter(w.startEpochSeconds, w.endEpochSeconds)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(discussionThreads)
      .where(withinWindow(discussionThreads.createdAt, w.startEpochSeconds, w.endEpochSeconds)),
    db
      .select({ events: sql<number>`count(*)` })
      .from(discussionMessages)
      .where(activeFilter(w.prevStartEpochSeconds, w.prevEndEpochSeconds)),
    db
      .select({ date: dayExpr(discussionMessages.createdAt), count: sql<number>`count(*)` })
      .from(discussionMessages)
      .where(activeFilter(w.startEpochSeconds, w.endEpochSeconds))
      .groupBy(dayExpr(discussionMessages.createdAt)),
    db
      .selectDistinct({ id: discussionMessages.authorId })
      .from(discussionMessages)
      .where(activeFilter(w.startEpochSeconds, w.endEpochSeconds)),
  ]);
  return {
    events: num(curr[0]?.events),
    previousEvents: num(prev[0]?.events),
    userIds: users.flatMap((u) => (u.id ? [u.id] : [])),
    lastUsedEpochSeconds: num(curr[0]?.lastUsedAt),
    daily: daily.map((d) => ({ date: d.date, count: num(d.count) })),
    detailCount: num(threads[0]?.count),
  };
}

async function collectTutorials(w: QueryWindow): Promise<FeatureSourceSnapshot> {
  const activeFilter = (start: number, end: number) =>
    and(ne(bookings.status, "cancelled"), withinWindow(bookings.bookedAt, start, end));

  const [curr, prev, daily, users] = await Promise.all([
    db
      .select({
        events: sql<number>`count(*)`,
        completed: sql<number>`sum(case when ${bookings.status} = 'completed' then 1 else 0 end)`,
        lastUsedAt: maxEpochSeconds(bookings.bookedAt),
      })
      .from(bookings)
      .where(activeFilter(w.startEpochSeconds, w.endEpochSeconds)),
    db
      .select({ events: sql<number>`count(*)` })
      .from(bookings)
      .where(activeFilter(w.prevStartEpochSeconds, w.prevEndEpochSeconds)),
    db
      .select({ date: dayExpr(bookings.bookedAt), count: sql<number>`count(*)` })
      .from(bookings)
      .where(activeFilter(w.startEpochSeconds, w.endEpochSeconds))
      .groupBy(dayExpr(bookings.bookedAt)),
    db
      .selectDistinct({ id: bookings.studentId })
      .from(bookings)
      .where(activeFilter(w.startEpochSeconds, w.endEpochSeconds)),
  ]);
  return {
    events: num(curr[0]?.events),
    previousEvents: num(prev[0]?.events),
    userIds: users.map((u) => u.id),
    lastUsedEpochSeconds: num(curr[0]?.lastUsedAt),
    daily: daily.map((d) => ({ date: d.date, count: num(d.count) })),
    detailCount: num(curr[0]?.completed),
  };
}

/**
 * Cross-feature student usage read model. Aggregates active learning domain
 * tables across canonical and legacy schemas (excluding retired V1/V2/V3
 * assessments) with period-over-period trends, adoption rate, and per-user depth.
 */
export async function getFeatureUsageMetrics(
  rangeDays: FeatureUsageRange
): Promise<FeatureUsageMetrics> {
  const now = new Date();
  const windowStart = elapsedDaysAgo(rangeDays, now);
  const prevWindowStart = elapsedDaysAgo(rangeDays * 2, now);
  const w: QueryWindow = {
    startEpochSeconds: windowStart.getTime() / 1000,
    endEpochSeconds: now.getTime() / 1000,
    prevStartEpochSeconds: prevWindowStart.getTime() / 1000,
    prevEndEpochSeconds: windowStart.getTime() / 1000 - 0.001,
  };

  const [
    materiLegacy,
    materiCanonical,
    flashcardLegacy,
    flashcardCanonical,
    kuis,
    tryout,
    kuisLive,
    zyra,
    diskusi,
    tutorial,
  ] = await Promise.all([
    collectMateriLegacy(w),
    collectMateriCanonical(w),
    collectFlashcardLegacy(w),
    collectFlashcardCanonical(w),
    collectQuiz(w),
    collectTryout(w),
    collectLiveQuiz(w),
    collectZyraChat(w),
    collectDiscussions(w),
    collectTutorials(w),
  ]);

  return aggregateFeatureUsage({
    rangeDays,
    now,
    windowStart,
    sourcesByFeature: {
      materi: [materiLegacy, materiCanonical],
      flashcard: [flashcardLegacy, flashcardCanonical],
      kuis: [kuis],
      tryout: [tryout],
      kuisLive: [kuisLive],
      zyra: [zyra],
      diskusi: [diskusi],
      tutorial: [tutorial],
    },
  });
}
