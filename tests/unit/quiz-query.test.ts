import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { fetchQuizAttempt, quizAttemptQuery, quizAttemptSchema, submitQuizAttempt } from "@/lib/quiz/client";
import { fetchQuizAnalytics, quizAnalyticsQuery, recomputeQuizAnalytics } from "@/lib/quiz/analytics-client";
import { needsQuizFeedback } from "@/lib/quiz/review";

const originalFetch = globalThis.fetch;
let client: QueryClient;
beforeEach(() => { client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }); });
afterEach(() => { client.clear(); globalThis.fetch = originalFetch; });

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "attempt-1", studentId: "student-a", templateId: "quiz-1", score: 0, durationSeconds: 60,
    status: "completed", submittedAt: "2026-11-18T00:00:00.000Z", strongAreas: [], weakAreas: [],
    questionsSnapshot: [{ id: "q1", prompt: "Question", options: ["a", "b"], correct_indices: [0] }],
    answersSnapshot: { q1: [1] }, recommendedNextSteps: [], feedback: [], remediation: null,
    ...overrides,
  };
}

describe("quiz query cache", () => {
  test("deduplicates the same private attempt and reuses fresh validated data", async () => {
    const fetch = mock(async () => Response.json(attempt()));
    globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
    const options = quizAttemptQuery("student-a", "attempt-1");
    const [first, second] = await Promise.all([client.query(options), client.query(options)]);
    expect(first).toEqual(second);
    await client.query(options);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(quizAttemptQuery("student-b", "attempt-1").queryKey).not.toEqual(options.queryKey);
  });

  test("rejects a mismatched account or attempt before caching the response", async () => {
    globalThis.fetch = mock(async () => Response.json(attempt({ studentId: "student-b" }))) as unknown as typeof globalThis.fetch;
    const options = quizAttemptQuery("student-a", "attempt-1");
    await expect(client.query(options)).rejects.toThrow("Quiz attempt identity changed");
    expect(client.getQueryData(options.queryKey)).toBeUndefined();
    globalThis.fetch = mock(async () => Response.json(attempt({ id: "attempt-2" }))) as unknown as typeof globalThis.fetch;
    await expect(fetchQuizAttempt("student-a", "attempt-1")).rejects.toThrow("Quiz attempt identity changed");
  });

  test("an invalid refresh cannot replace an already validated cache entry", async () => {
    const options = quizAttemptQuery("student-a", "attempt-1");
    globalThis.fetch = mock(async () => Response.json(attempt())) as unknown as typeof globalThis.fetch;
    const saved = await client.query(options);
    globalThis.fetch = mock(async () => Response.json(attempt({ questionsSnapshot: "broken" }))) as unknown as typeof globalThis.fetch;
    await expect(client.query({ ...options, staleTime: 0 })).rejects.toThrow("invalid response");
    expect<unknown>(client.getQueryData(options.queryKey)).toEqual(saved);
  });

  test("consumes Query's abort signal so removed account requests stop", async () => {
    let signal: AbortSignal | null | undefined;
    let started!: () => void;
    const start = new Promise<void>((resolve) => { started = resolve; });
    globalThis.fetch = mock((_path: unknown, init?: RequestInit) => {
      signal = init?.signal;
      started();
      return new Promise<Response>((_resolve, reject) => signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
    }) as unknown as typeof globalThis.fetch;
    const options = quizAttemptQuery("student-a", "attempt-1");
    const request = client.query(options).catch(() => undefined);
    await start;
    await client.cancelQueries({ queryKey: options.queryKey });
    await request;
    expect(signal?.aborted).toBe(true);
    expect(client.getQueryData(options.queryKey)).toBeUndefined();
  });
});

describe("quiz mutation contracts", () => {
  test("accepts the real acknowledgement, including pending essay grading", async () => {
    globalThis.fetch = mock(async () => Response.json({ score: null, correct: 0, total: 1, gradingStatus: "pending" })) as unknown as typeof globalThis.fetch;
    const result = await submitQuizAttempt("attempt:1", { answers: { q1: { text: "work" } }, durationSeconds: 60 });
    expect(result.gradingStatus).toBe("pending");
    expect(globalThis.fetch).toHaveBeenCalledWith("/api/quiz/attempts/attempt%3A1", expect.objectContaining({ method: "POST" }));
    globalThis.fetch = mock(async () => Response.json({ success: true })) as unknown as typeof globalThis.fetch;
    await expect(submitQuizAttempt("attempt-1", { answers: {}, durationSeconds: 60 })).rejects.toThrow("invalid response");
  });

  test("stops polling when feedback is complete or the answer keys are hidden", () => {
    expect(needsQuizFeedback(quizAttemptSchema.parse(attempt()))).toBe(true);
    expect(needsQuizFeedback(quizAttemptSchema.parse(attempt({ status: "in_progress" })))).toBe(false);
    expect(needsQuizFeedback(quizAttemptSchema.parse(attempt({ questionsSnapshot: [{ id: "q1", prompt: "Hidden", options: ["a", "b"] }] })))).toBe(false);
    expect(needsQuizFeedback(quizAttemptSchema.parse(attempt({ feedback: [{ questionIndex: 0, payload: { whyWrong: "Reason", correctApproach: [], reviewHref: "/courses/1" } }] })))).toBe(false);
  });

  test("analytics validates pending payloads and scope, and disables automatic request retries", async () => {
    globalThis.fetch = mock(async () => Response.json({ attemptId: "attempt-1", status: "processing", computedMetrics: null, aiDiagnosis: null })) as unknown as typeof globalThis.fetch;
    expect((await fetchQuizAnalytics("attempt-1")).status).toBe("processing");
    await expect(fetchQuizAnalytics("attempt-2")).rejects.toThrow("Quiz analytics identity changed");
    expect(quizAnalyticsQuery("student-a", "attempt-1").retry).toBe(false);
    globalThis.fetch = mock(async () => Response.json({ attemptId: "attempt-1", status: "processing", message: "Queued" })) as unknown as typeof globalThis.fetch;
    expect((await recomputeQuizAnalytics("attempt-1")).status).toBe("processing");
    globalThis.fetch = mock(async () => Response.json({ status: "completed", computedMetrics: { quizTitle: "Invalid" } })) as unknown as typeof globalThis.fetch;
    await expect(fetchQuizAnalytics("attempt-1")).rejects.toThrow("invalid response");
  });
});
