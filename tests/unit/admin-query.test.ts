import { afterEach, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
  adminAnalyticsQuery,
  adminFeatureFlagsQuery,
  adminKeyDiagnosticsQuery,
  adminOpsQuery,
  adminUsageQuery,
  featureFlagsSchema,
  keyDiagnosticsSchema,
  usageAnalyticsSchema,
} from "@/lib/admin/ops-query";
import { adminProductsQuery, adminProductsSchema, fetchAdminProducts } from "@/lib/admin/products-query";
import { adminLeaderboardQuery, adminLeaderboardSchema, fetchAdminLeaderboard } from "@/lib/admin/leaderboard-query";
import { ApiResponseError } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";

const originalFetch = globalThis.fetch;
const clients: QueryClient[] = [];
const now = "2026-11-18T10:00:00.000Z";
const emptyStats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  gatewayRequests: 0,
  directRequests: 0,
  averageLatencyMs: 0,
  gatewaySuccessRate: 0,
  directSuccessRate: 0,
  recentLogs: [],
};

function client() {
  const result = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(result);
  return result;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const instance of clients.splice(0)) instance.clear();
});

test("admin reads share valid data within an account and isolate account changes", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return Response.json(emptyStats);
  }) as unknown as typeof fetch;
  const cache = client();
  const [first, sameAccount] = await Promise.all([
    cache.query(adminAnalyticsQuery("admin-a")),
    cache.query(adminAnalyticsQuery("admin-a")),
  ]);
  expect(first).toEqual(sameAccount);
  expect(calls).toBe(1);
  await cache.query(adminAnalyticsQuery("admin-b"));
  expect(calls).toBe(2);
  cache.removeQueries({ queryKey: queryKeys.account("admin-a") });
  expect(cache.getQueryData(adminAnalyticsQuery("admin-a").queryKey)).toBeUndefined();
  expect<unknown>(cache.getQueryData(adminAnalyticsQuery("admin-b").queryKey)).toEqual(emptyStats);
});

test("malformed admin responses never become successful cached data", async () => {
  globalThis.fetch = (async () => Response.json({ ...emptyStats, totalRequests: "2" })) as unknown as typeof fetch;
  const cache = client();
  const options = adminAnalyticsQuery("admin-a");
  await expect(cache.query(options)).rejects.toBeInstanceOf(ApiResponseError);
  expect(cache.getQueryData(options.queryKey)).toBeUndefined();
  expect(cache.getQueryState(options.queryKey)?.status).toBe("error");
});

test("ops retain their polling cadence without background polling or focus refetch", () => {
  for (const [options, interval, staleTime] of [
    [adminOpsQuery("admin"), 60_000, 55_000],
    [adminAnalyticsQuery("admin"), 30_000, 25_000],
    [adminKeyDiagnosticsQuery("admin"), 30_000, 25_000],
    [adminFeatureFlagsQuery("admin"), 30_000, 20_000],
  ] as const) {
    expect(options.refetchInterval).toBe(interval);
    expect(options.staleTime).toBe(staleTime);
    expect(options.refetchIntervalInBackground).toBe(false);
    expect(options.refetchOnWindowFocus).toBe(false);
  }
  expect(adminOpsQuery("").enabled).toBe(false);
  expect(adminUsageQuery("admin", 7).queryKey).not.toEqual(adminUsageQuery("admin", 30).queryKey);
  expect(adminUsageQuery("admin", 30).staleTime).toBe(60_000);
});

test("diagnostics accept PostgreSQL integer strings but reject unsafe coercions", () => {
  const data = {
    checkedAt: now,
    rpdLimits: { model: 1500 },
    geminiKeys: [],
    usageByModel: [{ model: "model", count: "2", totalTokens: "100" }],
    totalRequestsToday: "2",
  };
  const result = keyDiagnosticsSchema.parse(data);
  expect(result.totalRequestsToday).toBe(2);
  expect(result.usageByModel[0].totalTokens).toBe(100);
  for (const invalid of [null, false, "", "1.5", "-2", "NaN"]) {
    expect(keyDiagnosticsSchema.safeParse({ ...data, totalRequestsToday: invalid }).success).toBe(false);
  }
});

test("flags and usage responses validate nested fields and success envelopes", () => {
  const flags = {
    checkedAt: now, posthogConfigured: false, total: 1, activeCount: 0, inactiveCount: 1, coveragePercent: 0,
    flags: [{ key: "FEATURE_LIVE", name: "Live", category: "quiz_live", categoryLabel: "Quiz", description: "Live class", enabled: false }],
  };
  expect(featureFlagsSchema.parse(flags).flags[0].enabled).toBe(false);
  expect(featureFlagsSchema.safeParse({ ...flags, flags: [{ ...flags.flags[0], enabled: "false" }] }).success).toBe(false);
  expect(usageAnalyticsSchema.safeParse({ success: false, data: { users: [], daily: [] } }).success).toBe(false);
  expect(usageAnalyticsSchema.safeParse({ success: true, data: { users: [], daily: [{ date: "invalid", requests: 0, inputTokens: 0, outputTokens: 0 }] } }).success).toBe(false);
});

test("product and leaderboard keys normalize equivalent filters without merging different scopes", () => {
  const products = adminProductsQuery("admin-a", { type: "all", courseId: "all", search: "  Integral  " });
  expect(products.queryKey).toEqual(adminProductsQuery("admin-a", { type: "", courseId: "", search: "integral" }).queryKey);
  expect(products.queryKey).not.toEqual(adminProductsQuery("admin-a", { type: "article", courseId: "", search: "integral" }).queryKey);
  expect(products.queryKey).not.toEqual(adminProductsQuery("admin-b", { type: "", courseId: "", search: "integral" }).queryKey);
  const leaderboard = adminLeaderboardQuery("admin-a", { courseId: "course-a", type: "all", search: " ALYA " });
  expect(leaderboard.queryKey).toEqual(adminLeaderboardQuery("admin-a", { courseId: "course-a", type: "", search: "alya" }).queryKey);
  expect(leaderboard.queryKey).not.toEqual(adminLeaderboardQuery("admin-a", { courseId: "course-b", type: "all", search: "alya" }).queryKey);
  expect(leaderboard.queryKey).not.toEqual(adminLeaderboardQuery("admin-a", { courseId: "course-a", type: "simulation", search: "alya" }).queryKey);
});

test("typed fetchers encode course and search filters and pass cancellation to fetch", async () => {
  const calls: Array<{ path: string; signal: AbortSignal | null | undefined }> = [];
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    calls.push({ path: String(input), signal: init?.signal });
    return String(input).includes("/products")
      ? Response.json({ items: [], total: 0 })
      : Response.json({ mode: "course", courses: [], students: [], summary: { totalStudents: 0, totalAttempts: 0, avgOverallScore: 0, highestScore: 0 } });
  }) as unknown as typeof fetch;
  const controller = new AbortController();
  await fetchAdminProducts({ type: "question", courseId: "course & one", search: "  X + Y  " }, controller.signal);
  await fetchAdminLeaderboard({ type: "quiz", courseId: "course & one", search: " ALYA " }, controller.signal);
  const productsUrl = new URL(calls[0].path, "https://example.test");
  expect(productsUrl.searchParams.get("courseId")).toBe("course & one");
  expect(productsUrl.searchParams.get("q")).toBe("x + y");
  expect(productsUrl.searchParams.get("type")).toBe("question");
  const leaderboardUrl = new URL(calls[1].path, "https://example.test");
  expect(leaderboardUrl.searchParams.get("courseId")).toBe("course & one");
  expect(leaderboardUrl.searchParams.get("search")).toBe("alya");
  expect(calls.every((call) => call.signal === controller.signal)).toBe(true);
});

test("a canceled old product filter cannot replace the current filter cache", async () => {
  let oldSignal: AbortSignal | null | undefined;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    if (String(input).includes("q=old")) {
      oldSignal = init?.signal;
      return new Promise<Response>((_, reject) => {
        oldSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
      });
    }
    return Response.json({ items: [], total: 0 });
  }) as unknown as typeof fetch;
  const cache = client();
  const old = adminProductsQuery("admin", { type: "all", courseId: "all", search: "old" });
  const current = adminProductsQuery("admin", { type: "all", courseId: "all", search: "current" });
  const oldResult = cache.query(old).catch(() => undefined);
  await cache.query(current);
  await cache.cancelQueries({ queryKey: old.queryKey, exact: true });
  await oldResult;
  expect(oldSignal?.aborted).toBe(true);
  expect(cache.getQueryData(old.queryKey)).toBeUndefined();
  expect<unknown>(cache.getQueryData(current.queryKey)).toEqual({ items: [], total: 0 });
});

test("product validation covers preview data, not only list metadata", () => {
  const base = { id: "product", title: "Integral", courseId: "math", status: "published", createdAt: now, updatedAt: now };
  const question = {
    ...base,
    productType: "question",
    extra: {
      questionType: "multiple_choice", difficulty: "medium", cognitiveLevel: "apply", reasoningPattern: "deduction",
      options: [{ id: "a", text: "One", isCorrect: true }],
    },
  };
  expect(adminProductsSchema.parse({ items: [question], total: 1 }).items).toHaveLength(1);
  expect(adminProductsSchema.safeParse({ items: [{ ...question, extra: { ...question.extra, options: [{ id: "a", text: "One", isCorrect: "true" }] } }], total: 1 }).success).toBe(false);
  expect(adminProductsSchema.safeParse({ items: [{ ...base, productType: "flashcard", extra: { cards: [{ id: "card", front: "Question", back: 2, explanation: null }] } }], total: 1 }).success).toBe(false);
  expect(adminProductsSchema.safeParse({ items: [], total: "0" }).success).toBe(false);
});

test("leaderboard validation preserves distinct overview and course response contracts", () => {
  const common = { courses: [{ id: "course", title: "Course" }], summary: { totalStudents: 0, totalAttempts: 0, avgOverallScore: 0, highestScore: 0 } };
  expect(adminLeaderboardSchema.parse({ ...common, mode: "overview", courseInsights: [] }).mode).toBe("overview");
  expect(adminLeaderboardSchema.parse({ ...common, mode: "course", students: [] }).mode).toBe("course");
  expect(adminLeaderboardSchema.safeParse({ ...common, mode: "course", courseInsights: [] }).success).toBe(false);
  expect(adminLeaderboardSchema.safeParse({ ...common, mode: "overview", students: [] }).success).toBe(false);
});
