import { afterEach, expect, test } from "bun:test";
import { z } from "zod";
import { QueryClient, MutationObserver, QueryObserver } from "@tanstack/react-query";
import { ApiError, ApiResponseError, requestJson, retryQuery } from "@/lib/query/http";
import { createQueryClient, isQueryAccountCurrent, subscribeQueryAccount, syncQueryAccount } from "@/lib/query/client";
import { invalidateLearningQueries } from "@/lib/query/invalidation";
import { queryAccountId, queryKeys } from "@/lib/query/keys";
import { todayCompletionMutation } from "@/lib/student/today-mutation";
import { studentTodayQuery, type TodayData } from "@/lib/student/today-query";

const originalFetch = globalThis.fetch;
const clients: QueryClient[] = [];
afterEach(() => { globalThis.fetch = originalFetch; clients.splice(0).forEach(client => client.clear()); });
function client() { const value = createQueryClient(); clients.push(value); return value; }

test("fetchers validate success bodies and preserve cancellation and HTTP errors", async () => {
  const controller = new AbortController();
  let request: RequestInit | undefined;
  globalThis.fetch = (async (_path: unknown, init?: RequestInit) => {
    request = init;
    return Response.json({ value: 3 });
  }) as typeof fetch;
  expect(await requestJson("/api/test", z.object({ value: z.number() }), { signal: controller.signal })).toEqual({ value: 3 });
  expect(request?.signal).toBe(controller.signal);
  expect(request?.cache).toBe("no-store");
  expect(request?.credentials).toBe("same-origin");
  expect(new Headers(request?.headers).get("Accept")).toBe("application/json");
  await expect(requestJson("/api/test", z.object({ value: z.string() }))).rejects.toBeInstanceOf(ApiResponseError);
  globalThis.fetch = (async () => new Response("upstream unavailable", { status: 503 })) as typeof fetch;
  await expect(requestJson("/api/test", z.object({ value: z.number() }))).rejects.toMatchObject({ status: 503 });
  globalThis.fetch = (async () => new Response("not json")) as typeof fetch;
  await expect(requestJson("/api/test", z.object({ value: z.number() }))).rejects.toBeInstanceOf(ApiResponseError);
});

test("read retries are bounded and exclude auth, validation, cancellation and rate limits", () => {
  expect(retryQuery(0, new ApiError(503, "unavailable"))).toBe(true);
  expect(retryQuery(1, new ApiError(503, "unavailable"))).toBe(false);
  expect(retryQuery(0, new TypeError("network failure"))).toBe(true);
  for (const status of [400, 401, 403, 404, 409, 429]) expect(retryQuery(0, new ApiError(status, "failed"))).toBe(false);
  expect(retryQuery(0, new ApiResponseError("bad data"))).toBe(false);
  expect(retryQuery(0, new DOMException("cancelled", "AbortError"))).toBe(false);
});

test("keys separate accounts, article versions, courses and filtered responses", () => {
  expect(queryKeys.student.today("a")).not.toEqual(queryKeys.student.today("b"));
  expect(queryKeys.articles.progress("a", "article", 1)).not.toEqual(queryKeys.articles.progress("a", "article", 2));
  expect(queryKeys.discussions.counts("a")).not.toEqual(queryKeys.discussions.counts("a", "all"));
  expect(queryKeys.student.studyPath("a", "math", 7)).not.toEqual(queryKeys.student.studyPath("a", "math", 30));
  expect(queryKeys.admin.products("a", { search: "one" })).not.toEqual(queryKeys.admin.products("a", { search: "two" }));
  expect(queryAccountId(queryKeys.public.pricing())).toBeUndefined();
  expect(queryAccountId(queryKeys.quizzes.attempt("a", "attempt"))).toBe("a");
});

test("switching accounts cancels private reads, rejects late cache writes, and keeps public data", async () => {
  const cache = client();
  syncQueryAccount(cache, "a");
  cache.setQueryData(queryKeys.public.pricing(), { public: true });
  let resolveRead!: (value: TodayData) => void;
  const read = cache.query({
    ...studentTodayQuery("a"),
    queryFn: ({ signal }) => new Promise<TodayData>(resolve => { resolveRead = resolve; signal.addEventListener("abort", () => {}); }),
  }).catch(() => undefined);
  await Promise.resolve();
  syncQueryAccount(cache, "b");
  resolveRead({ streak: { current: 1, longest: 1 }, items: [] });
  await read;
  expect(cache.getQueryData(queryKeys.student.today("a"))).toBeUndefined();
  expect(cache.getQueryData(queryKeys.public.pricing())).toEqual({ public: true });
  expect(isQueryAccountCurrent(cache, "a")).toBe(false);
  expect(isQueryAccountCurrent(cache, "b")).toBe(true);
  cache.setQueryData(queryKeys.student.today("b"), { streak: { current: 2, longest: 2 }, items: [] });
  syncQueryAccount(cache, null);
  expect(cache.getQueryData(queryKeys.student.today("b"))).toBeUndefined();
  expect(cache.getQueryData(queryKeys.public.pricing())).toEqual({ public: true });
});

test("invalid today payload never becomes successful cached data", async () => {
  const cache = client();
  globalThis.fetch = (async () => Response.json({ streak: { current: "3", longest: 3 }, items: [] })) as typeof fetch;
  await expect(cache.query(studentTodayQuery("a"))).rejects.toBeInstanceOf(ApiResponseError);
  expect(cache.getQueryData(queryKeys.student.today("a"))).toBeUndefined();
});

test("confirmed account changes notify server snapshot guards only when the owner changes", () => {
  const cache = client();
  const owners: boolean[] = [];
  const unsubscribe = subscribeQueryAccount(cache, () => owners.push(isQueryAccountCurrent(cache, "a")));
  syncQueryAccount(cache, "a");
  syncQueryAccount(cache, "a");
  syncQueryAccount(cache, "b");
  unsubscribe();
  syncQueryAccount(cache, null);
  expect(owners).toEqual([true, false]);
});

test("learning invalidation preserves a pending optimistic completion until its final refresh", async () => {
  const cache = client();
  syncQueryAccount(cache, "a");
  const options = studentTodayQuery("a");
  const data: TodayData = { streak: { current: 1, longest: 1 }, items: [{ id: "one", kind: "quiz", title: "Quiz", href: "/", done: false }] };
  cache.setQueryData(options.queryKey, data);
  let reads = 0;
  const observer = new QueryObserver(cache, { ...options, queryFn: async () => { reads++; return { ...data, items: data.items.map(item => ({ ...item, done: true })) }; } });
  const unsubscribe = observer.subscribe(() => {});
  let finish!: (response: Response) => void;
  let didStart!: () => void;
  const started = new Promise<void>(resolve => { didStart = resolve; });
  globalThis.fetch = (async () => new Promise<Response>(resolve => { finish = resolve; didStart(); })) as typeof fetch;
  const controller = new AbortController();
  const completion = new MutationObserver(cache, todayCompletionMutation(cache, "a")).mutate({ itemId: "one", controller });
  await started;
  await invalidateLearningQueries(cache, "a", { attemptId: "attempt" });
  expect(reads).toBe(0);
  expect(cache.getQueryData(options.queryKey)?.items[0].done).toBe(true);
  expect(cache.getQueryState(options.queryKey)?.isInvalidated).toBe(true);
  finish(Response.json({ ok: true }));
  await completion;
  expect(reads).toBe(1);
  expect(cache.getQueryState(options.queryKey)?.isInvalidated).toBe(false);
  unsubscribe();
});

test("one failed optimistic completion does not undo another successful item", async () => {
  const cache = client();
  syncQueryAccount(cache, "a");
  const key = studentTodayQuery("a").queryKey;
  cache.setQueryData(key, {
    streak: { current: 1, longest: 1 },
    items: ["one", "two"].map(id => ({ id, kind: "quiz" as const, title: id, href: "/", done: false })),
  });
  const finish = new Map<string, (response: Response) => void>();
  let allStarted!: () => void;
  const started = new Promise<void>(resolve => { allStarted = resolve; });
  globalThis.fetch = (async (_path: unknown, init?: RequestInit) => {
    const { itemId } = JSON.parse(String(init?.body));
    return new Promise<Response>(resolve => { finish.set(itemId, resolve); if (finish.size === 2) allStarted(); });
  }) as typeof fetch;
  const one = new AbortController(); const two = new AbortController();
  const options = todayCompletionMutation(cache, "a");
  const first = new MutationObserver(cache, options).mutate({ itemId: "one", controller: one }).catch(() => undefined);
  const second = new MutationObserver(cache, options).mutate({ itemId: "two", controller: two });
  await started;
  expect(cache.getQueryData(key)?.items.map(item => item.done)).toEqual([true, true]);
  finish.get("two")!(Response.json({ ok: true })); await second;
  expect(cache.getQueryState(key)?.isInvalidated).toBe(false);
  finish.get("one")!(Response.json({ error: "failed" }, { status: 500 })); await first;
  expect(cache.getQueryData(key)?.items.map(item => item.done)).toEqual([false, true]);
  expect(cache.getQueryState(key)?.isInvalidated).toBe(true);
  expect(cache.isMutating({ mutationKey: queryKeys.student.completeToday("a"), exact: true })).toBe(0);
});
