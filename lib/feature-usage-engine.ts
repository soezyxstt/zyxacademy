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
