import { db } from "@/db";
import {
  aiUsageEvents,
  vectorSyncQueue,
  aiGenerationJobs,
  dailyRecommendations,
  courseAnalyticsSnapshots,
  studyPaths,
} from "@/db/schema";
import { sql, eq, gte, and, ne } from "drizzle-orm";
import { kvGet } from "@/lib/kv-cache";
import { BUDGETS } from "@/lib/usage-budget-service";
import { toIsoTimestamp, startOfDay, todayUtc } from "@/lib/date-utils";

export { BUDGETS };

export interface FeatureRollup {
  feature: string;
  count: number;
  tokens: number;
}

export interface JobHealth {
  recommendationsLastAt: string | null;
  snapshotsLastAt: string | null;
  pathsLastAt: string | null;
}

export interface OpsMetrics {
  gemini: {
    reqToday: number;
    cacheHitToday: number;
    cacheHitPct: number;
  };
  kv: {
    writesToday: number;
    limit: number;
  };
  usageByFeature: FeatureRollup[];
  jobFailures24h: number;
  syncQueueDepth: number;
  jobHealth: JobHealth;
  budgets: typeof BUDGETS;
  checkedAt: string;
}

export async function getOpsMetrics(): Promise<OpsMetrics> {
  const now = new Date();
  const dayStart = startOfDay(now);
  const h24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const todayKey = `meta:writes:${todayUtc()}`;

  const [usageRows, syncDepthRows, failureRows, latestRecRows, latestSnapshotRows, latestPathRows, kvWriteRaw] =
    await Promise.all([
      db
        .select({
          feature: aiUsageEvents.feature,
          requestType: aiUsageEvents.requestType,
          count: sql<number>`count(*)`,
          tokens: sql<number>`coalesce(sum(${aiUsageEvents.tokens}), 0)`,
        })
        .from(aiUsageEvents)
        .where(gte(aiUsageEvents.createdAt, dayStart))
        .groupBy(aiUsageEvents.feature, aiUsageEvents.requestType),

      db
        .select({ count: sql<number>`count(*)` })
        .from(vectorSyncQueue)
        .where(
          and(
            ne(vectorSyncQueue.status, "completed"),
            ne(vectorSyncQueue.status, "failed"),
          ),
        ),

      db
        .select({ count: sql<number>`count(*)` })
        .from(aiGenerationJobs)
        .where(
          and(
            eq(aiGenerationJobs.status, "failed"),
            gte(aiGenerationJobs.updatedAt, h24Ago),
          ),
        ),

      db
        .select({ at: sql<number | null>`max(${dailyRecommendations.generatedAt})` })
        .from(dailyRecommendations),

      db
        .select({ at: sql<number | null>`max(${courseAnalyticsSnapshots.createdAt})` })
        .from(courseAnalyticsSnapshots),

      db
        .select({ at: sql<number | null>`max(${studyPaths.computedAt})` })
        .from(studyPaths),

      kvGet<number>(todayKey),
    ]);

  // Aggregate usage rows: split cache hits from real AI requests
  const byFeature = new Map<string, { count: number; tokens: number }>();
  let reqToday = 0;
  let cacheHitToday = 0;

  for (const row of usageRows) {
    if (row.requestType === "cache:hit") {
      cacheHitToday += Number(row.count);
    } else {
      reqToday += Number(row.count);
      const existing = byFeature.get(row.feature) ?? { count: 0, tokens: 0 };
      byFeature.set(row.feature, {
        count: existing.count + Number(row.count),
        tokens: existing.tokens + Number(row.tokens),
      });
    }
  }

  const usageByFeature: FeatureRollup[] = Array.from(byFeature.entries()).map(
    ([feature, v]) => ({ feature, count: v.count, tokens: v.tokens }),
  );

  const total = reqToday + cacheHitToday;
  const cacheHitPct = total > 0 ? Math.round((cacheHitToday / total) * 100) : 0;

  const rawCount = typeof kvWriteRaw === "number" ? kvWriteRaw : Number(kvWriteRaw ?? 0);
  const writesToday = isNaN(rawCount) ? 0 : rawCount;

  return {
    gemini: { reqToday, cacheHitToday, cacheHitPct },
    kv: { writesToday, limit: 1000 },
    usageByFeature,
    jobFailures24h: Number(failureRows[0]?.count ?? 0),
    syncQueueDepth: Number(syncDepthRows[0]?.count ?? 0),
    jobHealth: {
      recommendationsLastAt: toIsoTimestamp(latestRecRows[0]?.at),
      snapshotsLastAt: toIsoTimestamp(latestSnapshotRows[0]?.at),
      pathsLastAt: toIsoTimestamp(latestPathRows[0]?.at),
    },
    budgets: BUDGETS,
    checkedAt: now.toISOString(),
  };
}
