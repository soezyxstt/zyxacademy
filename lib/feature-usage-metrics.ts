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
import { elapsedDaysAgo } from "@/lib/date-utils";
import {
  aggregateFeatureUsage,
  type FeatureSourceSnapshot,
  type FeatureUsageMetrics,
  type FeatureUsageRange,
} from "@/lib/feature-usage-engine";

export {
  aggregateFeatureUsage,
  DEFAULT_FEATURE_USAGE_RANGE,
  FEATURE_USAGE_KEYS,
  FEATURE_USAGE_LABELS,
  FEATURE_USAGE_RANGES,
  featureUsageDailyDates,
  resolveFeatureUsageRange,
  type FeatureSourceSnapshot,
  type FeatureUsageDailyPoint,
  type FeatureUsageKey,
  type FeatureUsageMetrics,
  type FeatureUsageRange,
  type FeatureUsageRow,
} from "@/lib/feature-usage-engine";

const num = (value: unknown): number => Number(value ?? 0);

const withinWindow = (column: AnyColumn, startEpochSeconds: number, endEpochSeconds: number) =>
  sql`${column} >= to_timestamp(${startEpochSeconds}) and ${column} < to_timestamp(${endEpochSeconds})`;

const maxEpochSeconds = (column: AnyColumn) =>
  sql<number>`extract(epoch from max(${column}))`;

const dayExpr = (column: AnyColumn) =>
  sql<string>`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;

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
    prevEndEpochSeconds: windowStart.getTime() / 1000,
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
