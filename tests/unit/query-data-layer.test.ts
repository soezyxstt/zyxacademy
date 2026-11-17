import { afterEach, describe, expect, test } from "bun:test";
import { MutationObserver, QueryObserver, onlineManager } from "@tanstack/react-query";
import { z } from "zod";
import { makeQueryClient, getQueryClient, removeOtherAccounts } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";
import { ApiError, ResponseValidationError, requestJson } from "@/lib/query/http";
import { studentTodayQuery } from "@/lib/student/today-query";
import { DEFAULT_PRICING_DISCOUNTS } from "@/lib/pricing-discounts";
import { pricingQuery, cachePricingResponse } from "@/lib/query/pricing";
import { opsQuery, opsSchema, analyticsSchema, flagsSchema, diagnosticsSchema } from "@/lib/query/admin";
import { studyPathQuery, planDemoStudyDays } from "@/lib/query/study-path";
import { allowanceSchema } from "@/lib/query/allowance";
import { discussionCountsSchema } from "@/lib/query/discussions";
import { articleProgressMutation, mergeSectionProgress } from "@/lib/articles/progress-client";
import { quizSubmissionMutation, formatQuizAnswers, quizUploadSchema } from "@/lib/quiz/client";
import { attemptReviewQuery, attemptReviewSchema, feedbackPollInterval, hasPendingFeedback } from "@/lib/quiz/review-query";

const originalFetch = globalThis.fetch;
const clients: ReturnType<typeof makeQueryClient>[] = [];
const client = () => { const value = makeQueryClient(); clients.push(value); return value; };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const mockFetch = (fn: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => { globalThis.fetch = fn as typeof fetch; };
const today = { streak: { current: 2, longest: 5 }, items: [{ id: "one", kind: "quiz", title: "Quiz", href: "/quiz", done: false }] };
const pricing = DEFAULT_PRICING_DISCOUNTS;
const attempt = {
  id: "attempt-a", studentId: "alice", templateId: "quiz-a", score: 0, durationSeconds: 20, status: "graded", submittedAt: "2026-11-17T12:00:00Z",
  questionsSnapshot: [{ id: "q", prompt: "Question", options: ["A", "B"], type: "multiple_choice", correct_indices: [0] }],
  answersSnapshot: { q: [1] }, strongAreas: null, weakAreas: null, recommendedNextSteps: null, feedback: [], remediation: null,
};
afterEach(() => { globalThis.fetch = originalFetch; clients.splice(0).forEach((item) => item.clear()); onlineManager.setOnline(true); });

describe("cache identity and lifetime", () => {
  test("server requests receive separate clients", () => {
    const first = getQueryClient(), second = getQueryClient();
    expect(first).not.toBe(second); first.clear(); second.clear();
  });
  test("owners, resources, filters and null scopes never collide", () => {
    const keys = [queryKeys.today("alice"), queryKeys.today("bob"), queryKeys.attempt("alice", "one"), queryKeys.attempt("alice", "two"),
      queryKeys.studyPath("alice", "one", null), queryKeys.studyPath("alice", "one", 7), queryKeys.studyPath("alice", "two", 7),
      queryKeys.discussionCounts("alice"), queryKeys.discussionCounts("alice", "all"), queryKeys.usage("alice", "7"), queryKeys.usage("alice", "30")];
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(keys.length);
  });
  test("two consumers share one request and fresh cached data", async () => {
    let calls = 0; mockFetch(async () => { calls++; await tick(); return json(today); });
    const qc = client(); const options = studentTodayQuery("alice");
    await Promise.all([qc.fetchQuery(options), qc.fetchQuery(options)]);
    await qc.fetchQuery(options);
    expect(calls).toBe(1); expect(qc.getQueryData(options.queryKey)).toEqual(today);
  });
  test("invalidation is targeted, not a global cache reset", async () => {
    const qc = client(); const a = studentTodayQuery("alice"), b = studentTodayQuery("bob");
    qc.setQueryData(a.queryKey, today); qc.setQueryData(b.queryKey, today); qc.setQueryData(queryKeys.pricing(), pricing);
    await qc.invalidateQueries({ queryKey: a.queryKey, exact: true, refetchType: "none" });
    expect(qc.getQueryState(a.queryKey)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(b.queryKey)?.isInvalidated).toBe(false);
    expect(qc.getQueryState(queryKeys.pricing())?.isInvalidated).toBe(false);
  });
  test("account eviction preserves public and current account caches", () => {
    const qc = client(); qc.setQueryData(queryKeys.today("alice"), today); qc.setQueryData(queryKeys.today("bob"), today); qc.setQueryData(queryKeys.pricing(), pricing);
    removeOtherAccounts(qc, "bob");
    expect(qc.getQueryData(queryKeys.today("alice"))).toBeUndefined(); expect(qc.getQueryData(queryKeys.today("bob"))).toEqual(today);
    removeOtherAccounts(qc, null);
    expect(qc.getQueryData(queryKeys.today("bob"))).toBeUndefined(); expect(qc.getQueryData(queryKeys.pricing())).toEqual(pricing);
  });
});

describe("validated HTTP and cancellation", () => {
  test("rejects malformed success payloads before cache admission", async () => {
    mockFetch(async () => json({ ...today, streak: { current: "2", longest: 5 } }));
    const qc = client(); const options = studentTodayQuery("alice");
    await expect(qc.fetchQuery(options)).rejects.toBeInstanceOf(ResponseValidationError);
    expect(qc.getQueryData(options.queryKey)).toBeUndefined();
  });
  test("keeps the last valid cache entry when a new payload fails validation", async () => {
    const qc = client(); const options = studentTodayQuery("alice"); qc.setQueryData(options.queryKey, today);
    mockFetch(async () => json({ broken: true }));
    await expect(qc.fetchQuery({ ...options, staleTime: 0 })).rejects.toBeInstanceOf(ResponseValidationError);
    expect(qc.getQueryData(options.queryKey)).toEqual(today);
  });
  test("rejects HTML responses and conceals server error bodies", async () => {
    mockFetch(async () => new Response("<html>login</html>"));
    await expect(requestJson("/api/test", z.object({ ok: z.boolean() }))).rejects.toBeInstanceOf(ResponseValidationError);
    mockFetch(async () => json({ error: "private-key-value" }, 403));
    try { await requestJson("/api/test", z.unknown()); throw new Error("Expected failure"); }
    catch (error) { expect(error).toBeInstanceOf(ApiError); expect((error as ApiError).status).toBe(403); expect(String(error)).not.toContain("private-key-value"); }
  });
  test("does not send unauthenticated imperative reads", async () => {
    let calls = 0; mockFetch(async () => { calls++; return json({}); });
    await expect(client().fetchQuery(opsQuery(null))).rejects.toBeInstanceOf(ApiError);
    expect(calls).toBe(0);
  });
  test("query cancellation aborts the actual fetch and does not cache late data", async () => {
    let observedSignal: AbortSignal | undefined;
    mockFetch(async (_url, init) => new Promise((_resolve, reject) => {
      observedSignal = init?.signal ?? undefined;
      observedSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const qc = client(), options = studentTodayQuery("alice");
    const pending = qc.fetchQuery(options).catch((error: unknown) => error);
    await tick(); await qc.cancelQueries({ queryKey: options.queryKey }); await pending;
    expect(observedSignal?.aborted).toBe(true); expect(qc.getQueryData(options.queryKey)).toBeUndefined();
  });
  test("rejects external transports", async () => {
    let calls = 0; mockFetch(async () => { calls++; return json({}); });
    await expect(requestJson("https://example.test/private", z.unknown())).rejects.toThrow("same-origin"); expect(calls).toBe(0);
  });
});

describe("write contracts", () => {
  test("validated pricing writes cannot be overwritten by an older read", async () => {
    const qc = client(); let resolveRead: ((value: Response) => void) | undefined;
    mockFetch(async () => new Promise((resolve) => { resolveRead = resolve; }));
    const pending = qc.fetchQuery(pricingQuery()).catch(() => undefined);
    await tick(); await cachePricingResponse(qc, pricing); resolveRead?.(json({ invalid: true })); await pending; await tick();
    expect(qc.getQueryData(pricingQuery().queryKey)).toEqual(pricing);
    await expect(cachePricingResponse(qc, { invalid: true })).rejects.toThrow();
    expect(qc.getQueryData(pricingQuery().queryKey)).toEqual(pricing);
  });
  test("article progress never regresses on an out-of-order response", () => {
    expect(mergeSectionProgress({ maxReadPercent: 100, completed: true, timeSpentSeconds: 90 }, { maxReadPercent: 30, completed: false, timeSpentSeconds: 20 }))
      .toEqual({ maxReadPercent: 100, completed: true, timeSpentSeconds: 90 });
  });
  test("article writes validate the target section and never auto-retry additive time", async () => {
    let calls = 0; mockFetch(async () => { calls++; return json({ success: true, sectionId: "wrong", maxReadPercent: 100, completed: true, timeSpentSeconds: 4, completedAt: null }); });
    const mutation = new MutationObserver(client(), articleProgressMutation("a", 1, "alice"));
    await expect(mutation.mutate({ sectionId: "s", percent: 100, timeSpentSeconds: 4 })).rejects.toBeInstanceOf(ResponseValidationError);
    expect(calls).toBe(1);
  });
  test("quiz writes fail immediately offline instead of queuing a later grade", async () => {
    onlineManager.setOnline(false); let calls = 0;
    mockFetch(async () => { calls++; throw new TypeError("Network unavailable"); });
    const mutation = new MutationObserver(client(), quizSubmissionMutation("attempt"));
    await expect(mutation.mutate({ answers: { q: [1] }, durationSeconds: 12 })).rejects.toThrow();
    onlineManager.setOnline(true); await tick();
    expect(calls).toBe(1); expect(mutation.getCurrentResult().isPaused).toBe(false);
  });
  test("demo quiz transport never calls an authenticated endpoint", async () => {
    let calls = 0, submitted: unknown;
    mockFetch(async () => { calls++; return json({}); });
    const mutation = new MutationObserver(client(), quizSubmissionMutation("demo", { submit: async (answers) => { submitted = answers; } }));
    await mutation.mutate({ answers: { q: [0] }, durationSeconds: 2 });
    expect(calls).toBe(0); expect(submitted).toEqual({ q: [0] });
  });
  test("submission snapshots include only the attempt's questions", () => {
    const questions = ["q", "short", "essay", "empty"].map((id, order) => ({ id, order, type: id === "short" ? "short_answer" : id === "essay" ? "essay" : "multiple_choice", prompt: id, options: [] }));
    expect(formatQuizAnswers({ q: 1, unrelated: "discard" }, questions)).toEqual({ q: [1], short: "", essay: { text: "", fileName: null, fileKey: null }, empty: [] });
    expect(quizUploadSchema.safeParse({ success: true, fileName: "x.pdf", key: "key" }).success).toBe(false);
  });
});

describe("review and product scopes", () => {
  test("fast feedback responses cannot reset the polling budget", () => {
    const parsed = attemptReviewSchema.parse(attempt);
    expect(feedbackPollInterval(parsed, null, 0, 1)).toBe(3_000);
    expect(feedbackPollInterval(parsed, null, 0, 29_999)).toBe(3_000);
    expect(feedbackPollInterval(parsed, null, 0, 30_000)).toBe(false);
    expect(feedbackPollInterval(undefined, new ApiError(403), 0, 1)).toBe(false);
  });
  test("released feedback completes polling and hidden keys do not trigger polling", () => {
    const hidden = attemptReviewSchema.parse({ ...attempt, questionsSnapshot: [{ id: "q", prompt: "Q", options: [] }] });
    expect(hasPendingFeedback(hidden)).toBe(false);
    const complete = attemptReviewSchema.parse({ ...attempt, feedback: [{ questionIndex: 0, payload: { whyWrong: "Review", correctApproach: ["Step"], reviewHref: "/article" } }] });
    expect(hasPendingFeedback(complete)).toBe(false);
  });
  test("attempt responses must belong to the requested account and attempt", async () => {
    mockFetch(async () => json(attempt));
    await expect(client().fetchQuery(attemptReviewQuery("bob", "attempt-a"))).rejects.toBeInstanceOf(ResponseValidationError);
    await expect(client().fetchQuery(attemptReviewQuery("alice", "attempt-b"))).rejects.toBeInstanceOf(ResponseValidationError);
    expect((await client().fetchQuery(attemptReviewQuery("alice", "attempt-a"))).id).toBe("attempt-a");
  });
  test("study path placeholders never cross an account or course boundary", async () => {
    const qc = client(), data = { steps: [], dayPlan: null };
    qc.setQueryData(studyPathQuery("alice", "math", null).queryKey, data);
    mockFetch(async () => new Promise(() => {}));
    const observer = new QueryObserver(qc, studyPathQuery("alice", "math", null));
    const unsubscribe = observer.subscribe(() => {});
    observer.setOptions(studyPathQuery("alice", "math", 7)); expect(observer.getCurrentResult().isPlaceholderData).toBe(true);
    observer.setOptions(studyPathQuery("bob", "math", 7)); expect(observer.getCurrentResult().data).toBeUndefined();
    observer.setOptions(studyPathQuery("alice", "physics", 7)); expect(observer.getCurrentResult().data).toBeUndefined();
    unsubscribe();
  });
  test("demo day planning is local and handles an empty course", () => {
    expect(planDemoStudyDays([], 7)).toEqual([]); expect(planDemoStudyDays([], null)).toBeNull();
  });
  test("allowance accepts the existing optional access tier without trusting arbitrary fields", () => {
    const summary = { peran: "murid", appDay: "2026-11-17", providerTurnsUsed: 1, providerTurnsRemaining: 4, totalInteractionsUsed: 1, totalInteractionsRemaining: 4, premiumTurnsUsed: 0, premiumTurnsRemaining: 0, cacheSaves: 0, nextResetAt: "2026-11-18T00:00:00Z" };
    expect(allowanceSchema.parse({ summary }).summary.accessTier).toBe("standard");
    expect(allowanceSchema.parse({ summary: { ...summary, accessTier: "free" } }).summary.accessTier).toBe("free");
    expect(allowanceSchema.safeParse({ summary: { ...summary, providerTurnsRemaining: "4" } }).success).toBe(false);
    expect(discussionCountsSchema.safeParse({ total: { unreadThreads: -1, activeThreads: 2 }, course: null }).success).toBe(false);
  });
  test("admin contracts fail closed instead of casting arbitrary JSON", () => {
    for (const schema of [opsSchema, analyticsSchema, flagsSchema, diagnosticsSchema]) expect(schema.safeParse({}).success).toBe(false);
  });
});
