import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { daysAgo } from "@/lib/date-utils";
import { requestJson } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";

const count = z.number().int().nonnegative();
const percentage = z.number().min(0).max(100);
const timestamp = z.iso.datetime({ offset: true });

export const opsMetricsSchema = z.object({
  gemini: z.object({ reqToday: count, cacheHitToday: count, cacheHitPct: percentage }),
  usageByFeature: z.array(z.object({ feature: z.string(), count, tokens: count })),
  jobFailures24h: count,
  syncQueueDepth: count,
  jobHealth: z.object({
    recommendationsLastAt: timestamp.nullable(),
    snapshotsLastAt: timestamp.nullable(),
    pathsLastAt: timestamp.nullable(),
  }),
  budgets: z.object({ tutorPerDay: count, feedbackPerSubmission: count, summariesPerDayPerUser: count }),
  checkedAt: timestamp,
});

const aiRequestLogSchema = z.object({
  timestamp,
  operation: z.enum(["generateContent", "interactions", "embed"]),
  model: z.string(),
  viaGateway: z.boolean(),
  latencyMs: z.number().nonnegative(),
  success: z.boolean(),
  error: z.string().optional(),
});

export const aiStatsSchema = z.object({
  totalRequests: count,
  successfulRequests: count,
  failedRequests: count,
  gatewayRequests: count,
  directRequests: count,
  averageLatencyMs: z.number().nonnegative(),
  gatewaySuccessRate: percentage,
  directSuccessRate: percentage,
  recentLogs: z.array(aiRequestLogSchema),
});

export const usageAnalyticsSchema = z.object({
  success: z.literal(true),
  data: z.object({
    users: z.array(z.object({
      userId: z.string(),
      name: z.string().nullable(),
      email: z.string().nullable(),
      requests: count,
      inputTokens: count,
      outputTokens: count,
      totalTokens: count,
    })),
    daily: z.array(z.object({
      date: z.iso.date(),
      requests: count,
      inputTokens: count,
      outputTokens: count,
    })),
  }),
});

// PostgreSQL count/sum expressions in the diagnostics route can be JSON strings.
// Accept only integer strings, then validate the converted value before caching.
const databaseCount = z.union([count, z.string().regex(/^\d+$/).transform(Number)]).pipe(count);

export const keyDiagnosticsSchema = z.object({
  checkedAt: timestamp,
  rpdLimits: z.record(z.string(), count),
  geminiKeys: z.array(z.object({
    keyId: z.string(),
    modelId: z.string(),
    requestsMinute: count,
    requestsToday: count,
    rpdLimit: count,
    successes: count,
    failures: count,
    consecutiveFailures: count,
    circuitState: z.enum(["CLOSED", "HALF_OPEN", "OPEN"]),
    cooldownRemainingMs: z.number().nonnegative(),
    estimatedRpmLimit: z.number().nonnegative(),
    utilizationPercent: percentage,
    activeRequestsCount: count,
  })),
  usageByModel: z.array(z.object({ model: z.string(), count: databaseCount, totalTokens: databaseCount })),
  totalRequestsToday: databaseCount,
});

export const featureFlagsSchema = z.object({
  checkedAt: timestamp,
  posthogConfigured: z.boolean(),
  total: count,
  activeCount: count,
  inactiveCount: count,
  coveragePercent: percentage,
  flags: z.array(z.object({
    key: z.string(),
    name: z.string(),
    category: z.enum(["academic_student", "ai_v2_architecture", "quiz_live", "platform"]),
    categoryLabel: z.string(),
    description: z.string(),
    enabled: z.boolean(),
    rawValue: z.string().optional(),
  })),
});

export type AiRequestLog = z.infer<typeof aiRequestLogSchema>;
export type UsageRangeDays = 7 | 30 | 90;

export function fetchOpsMetrics(signal?: AbortSignal) {
  return requestJson("/api/admin/ops", opsMetricsSchema, { signal });
}

export function fetchAiAnalytics(signal?: AbortSignal) {
  return requestJson("/api/admin/ai-analytics", aiStatsSchema, { signal });
}

export async function fetchUsageAnalytics(days: UsageRangeDays, signal?: AbortSignal) {
  const params = new URLSearchParams({
    startDate: daysAgo(days).toISOString(),
    endDate: new Date().toISOString(),
  });
  const response = await requestJson(`/api/admin/ai-analytics/usage?${params}`, usageAnalyticsSchema, { signal });
  return response.data;
}

export function fetchKeyDiagnostics(signal?: AbortSignal) {
  return requestJson("/api/admin/key-diagnostics", keyDiagnosticsSchema, { signal });
}

export function fetchFeatureFlags(signal?: AbortSignal) {
  return requestJson("/api/admin/feature-flags", featureFlagsSchema, { signal });
}

export function adminOpsQuery(userId: string) {
  return queryOptions({
    queryKey: queryKeys.admin.opsMetrics(userId),
    queryFn: ({ signal }) => fetchOpsMetrics(signal),
    enabled: Boolean(userId),
    refetchInterval: 60_000,
    staleTime: 55_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
}

export function adminAnalyticsQuery(userId: string) {
  return queryOptions({
    queryKey: queryKeys.admin.analytics(userId),
    queryFn: ({ signal }) => fetchAiAnalytics(signal),
    enabled: Boolean(userId),
    refetchInterval: 30_000,
    staleTime: 25_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
}

export function adminUsageQuery(userId: string, days: UsageRangeDays) {
  return queryOptions({
    queryKey: queryKeys.admin.usage(userId, days),
    queryFn: ({ signal }) => fetchUsageAnalytics(days, signal),
    enabled: Boolean(userId),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}

export function adminKeyDiagnosticsQuery(userId: string) {
  return queryOptions({
    queryKey: queryKeys.admin.keyDiagnostics(userId),
    queryFn: ({ signal }) => fetchKeyDiagnostics(signal),
    enabled: Boolean(userId),
    refetchInterval: 30_000,
    staleTime: 25_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
}

export function adminFeatureFlagsQuery(userId: string) {
  return queryOptions({
    queryKey: queryKeys.admin.featureFlags(userId),
    queryFn: ({ signal }) => fetchFeatureFlags(signal),
    enabled: Boolean(userId),
    refetchInterval: 30_000,
    staleTime: 20_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });
}
