import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { queryKeys } from "./keys";
import { requestJson, requireAccount } from "./http";
import { daysAgo } from "@/lib/date-utils";

export const opsSchema = z.object({
  gemini: z.object({ reqToday: z.number(), cacheHitToday: z.number(), cacheHitPct: z.number() }),
  usageByFeature: z.array(z.object({ feature: z.string(), count: z.number(), tokens: z.number() })),
  jobFailures24h: z.number(), syncQueueDepth: z.number(),
  jobHealth: z.object({ recommendationsLastAt: z.string().nullable(), snapshotsLastAt: z.string().nullable(), pathsLastAt: z.string().nullable() }),
  budgets: z.object({ tutorPerDay: z.number(), feedbackPerSubmission: z.number(), summariesPerDayPerUser: z.number() }),
  checkedAt: z.string(),
});
export const diagnosticsSchema = z.object({
  checkedAt: z.string(), rpdLimits: z.record(z.string(), z.number()), totalRequestsToday: z.number(),
  geminiKeys: z.array(z.object({
    keyId: z.string(), modelId: z.string(), requestsMinute: z.number(), requestsToday: z.number(),
    rpdLimit: z.number(), successes: z.number(), failures: z.number(), consecutiveFailures: z.number(),
    circuitState: z.enum(["CLOSED", "HALF_OPEN", "OPEN"]), cooldownRemainingMs: z.number(),
    estimatedRpmLimit: z.number(), utilizationPercent: z.number(), activeRequestsCount: z.number(),
  })),
  usageByModel: z.array(z.object({ model: z.string(), count: z.number(), totalTokens: z.number() })),
});
export const flagsSchema = z.object({
  checkedAt: z.string(), posthogConfigured: z.boolean().optional(), total: z.number(),
  activeCount: z.number(), inactiveCount: z.number(), coveragePercent: z.number(),
  flags: z.array(z.object({
    key: z.string(), name: z.string(), description: z.string(), categoryLabel: z.string(),
    category: z.enum(["academic_student", "ai_v2_architecture", "quiz_live", "platform"]),
    enabled: z.boolean(), rawValue: z.string().optional(),
  })),
});
export const analyticsSchema = z.object({
  totalRequests: z.number(), successfulRequests: z.number(), failedRequests: z.number(),
  gatewayRequests: z.number(), directRequests: z.number(), averageLatencyMs: z.number(),
  gatewaySuccessRate: z.number(), directSuccessRate: z.number(),
  recentLogs: z.array(z.object({
    timestamp: z.string(), operation: z.enum(["generateContent", "interactions", "embed"]),
    model: z.string(), viaGateway: z.boolean(), latencyMs: z.number(), success: z.boolean(), error: z.string().optional(),
  })),
});
export const usageSchema = z.object({
  success: z.literal(true),
  data: z.object({
    users: z.array(z.object({
      userId: z.string(), name: z.string().nullable(), email: z.string().nullable(), requests: z.number(),
      inputTokens: z.number(), outputTokens: z.number(), totalTokens: z.number(),
    })),
    daily: z.array(z.object({ date: z.string(), requests: z.number(), inputTokens: z.number(), outputTokens: z.number() })),
  }),
});

export const opsQuery = (userId: string | null) => queryOptions({
  queryKey: queryKeys.ops(userId), enabled: Boolean(userId),
  queryFn: ({ signal }) => { requireAccount(userId); return requestJson("/api/admin/ops", opsSchema, { signal }); },
  staleTime: 55_000, refetchInterval: 60_000,
});
export const diagnosticsQuery = (userId: string | null) => queryOptions({
  queryKey: queryKeys.diagnostics(userId), enabled: Boolean(userId),
  queryFn: ({ signal }) => { requireAccount(userId); return requestJson("/api/admin/key-diagnostics", diagnosticsSchema, { signal }); },
  staleTime: 25_000, refetchInterval: 30_000,
});
export const flagsQuery = (userId: string | null) => queryOptions({
  queryKey: queryKeys.flags(userId), enabled: Boolean(userId),
  queryFn: ({ signal }) => { requireAccount(userId); return requestJson("/api/admin/feature-flags", flagsSchema, { signal }); },
  staleTime: 20_000, refetchInterval: 30_000,
});
export const analyticsQuery = (userId: string | null) => queryOptions({
  queryKey: queryKeys.analytics(userId), enabled: Boolean(userId),
  queryFn: ({ signal }) => { requireAccount(userId); return requestJson("/api/admin/ai-analytics", analyticsSchema, { signal }); },
  staleTime: 25_000, refetchInterval: 30_000,
});
export const usageQuery = (userId: string | null, days: "7" | "30" | "90") => queryOptions({
  queryKey: queryKeys.usage(userId, days), enabled: Boolean(userId),
  queryFn: async ({ signal }) => {
    requireAccount(userId);
    // A relative window is resolved at fetch time; a timestamp in the key would grow the cache each render.
    const params = new URLSearchParams({ startDate: daysAgo(Number(days)).toISOString(), endDate: new Date().toISOString() });
    return (await requestJson(`/api/admin/ai-analytics/usage?${params}`, usageSchema, { signal })).data;
  },
  staleTime: 60_000,
});
