import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { articleProgressMutation } from "@/lib/articles/progress-mutation";
import { articleProgressQuery } from "@/lib/articles/progress-query";
import { createArticleCompletions, createArticleVisit, type ArticleCompletionIntent, type ArticleProgress, type ArticleProgressUpdate } from "@/lib/articles/progress-contract";
import { syncQueryAccount } from "@/lib/query/client";
import { queryKeys } from "@/lib/query/keys";

const originalFetch = globalThis.fetch;
const clients: QueryClient[] = [];
const restore: Array<() => void> = [];
afterEach(() => {
  globalThis.fetch = originalFetch;
  restore.splice(0).forEach((reset) => reset());
  clients.splice(0).forEach((client) => client.clear());
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function receipt(sectionId = "section", timeSpentSeconds = 12) {
  return { success: true, articleId: "article", articleVersion: 3, sectionId, maxReadPercent: 100, completed: true, timeSpentSeconds, completedAt: "2026-11-18T00:00:00.000Z" };
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  syncQueryAccount(client, "student");
  const query = articleProgressQuery("student", "article", 3);
  const initial: ArticleProgress = { articleId: "article", articleVersion: 3, sectionProgress: { section: { completed: false, maxReadPercent: 20, timeSpentSeconds: 3 } } };
  client.setQueryData(query.queryKey, initial);
  const mutation = () => articleProgressMutation(client, "student", "article", 3, "course");
  const mutate = (update: ArticleProgressUpdate = { sectionId: "section", percent: 100, completed: true, timeSpentSeconds: 9 }) => new MutationObserver(client, mutation()).mutate(update);
  const summaryCounts: number[] = [];
  const invalidate = client.invalidateQueries.bind(client);
  const invalidationSpy = spyOn(client, "invalidateQueries").mockImplementation((filters, options) => {
    if (JSON.stringify(filters?.queryKey) === JSON.stringify(queryKeys.student.today("student"))) {
      summaryCounts.push(client.isMutating({ mutationKey: mutation().mutationKey, exact: true }));
    }
    return invalidate(filters, options);
  });
  restore.push(() => invalidationSpy.mockRestore());
  return { client, query, initial, mutate, summaryCounts };
}

describe("article mutation lifecycle", () => {
  test("pending and rejected completions cannot complete through fresh time flushes before explicit retry", async () => {
    const state = setup();
    const completions = createArticleCompletions(state.initial.sectionProgress);
    const visit = createArticleVisit("section");
    for (let i = 0; i < 12; i++) visit.tick();
    const firstResponse = deferred<Response>();
    const started = deferred<void>();
    const requests: ArticleProgressUpdate[] = [];
    let savedPercent = state.initial.sectionProgress.section.maxReadPercent;
    let savedTime = state.initial.sectionProgress.section.timeSpentSeconds;
    globalThis.fetch = ((_path: unknown, init?: RequestInit) => {
      const input: ArticleProgressUpdate = JSON.parse(String(init?.body));
      requests.push(input);
      if (requests.length === 1) { started.resolve(); return firstResponse.promise; }
      // Mirror the API's monotonic percent and >=90 completion rule. The first
      // write has no valid receipt for this revision, so it remains uncertain.
      savedPercent = Math.max(savedPercent, input.percent);
      savedTime += input.timeSpentSeconds;
      const completed = savedPercent >= 90 || input.completed === true;
      return Promise.resolve(Response.json({ ...receipt("section", savedTime), maxReadPercent: savedPercent, completed, completedAt: completed ? "2026-11-18T00:00:00.000Z" : null }));
    }) as unknown as typeof fetch;

    const complete = async (intent: ArticleCompletionIntent) => {
      const update = completions.request("section", intent, visit);
      if (!update) return;
      let accepted = false;
      try { await state.mutate(update); accepted = true; }
      catch { /* Keep the uncertain elapsed delta consumed. */ }
      finally { completions.settle("section", accepted); }
    };
    const first = complete("scroll");
    await started.promise;
    await complete("explicit");
    expect(requests).toHaveLength(1);
    const flush = async () => {
      const update = completions.flush(visit);
      if (update) await state.mutate(update);
    };
    for (let i = 0; i < 4; i++) visit.tick();
    await flush();
    await flush();
    expect(requests).toHaveLength(2);
    expect(requests[1]).toMatchObject({ percent: 89, timeSpentSeconds: 4 });
    expect(requests[1].completed).toBeUndefined();
    expect(state.client.getQueryData(state.query.queryKey)?.sectionProgress.section).toMatchObject({ completed: false, maxReadPercent: 89, timeSpentSeconds: 7 });
    firstResponse.resolve(Response.json({ ...receipt("section", 15), articleVersion: 2 }));
    await first;
    for (let i = 0; i < 4; i++) visit.tick();
    await flush();
    await flush();
    await complete("scroll");
    await complete("scroll");
    expect(requests).toHaveLength(3);
    expect(requests[2]).toMatchObject({ percent: 89, timeSpentSeconds: 4 });
    expect(requests[2].completed).toBeUndefined();
    expect(state.client.getQueryData(state.query.queryKey)?.sectionProgress.section).toMatchObject({ completed: false, maxReadPercent: 89, timeSpentSeconds: 11 });
    expect(state.summaryCounts).toHaveLength(0);

    await complete("explicit");
    expect(requests.map((request) => request.timeSpentSeconds)).toEqual([12, 4, 4, 0]);
    expect(requests[3]).toMatchObject({ percent: 100, completed: true });
    expect(state.client.getQueryData(state.query.queryKey)?.sectionProgress.section).toMatchObject({ completed: true, maxReadPercent: 100, timeSpentSeconds: 11 });
    await complete("scroll");
    await complete("explicit");
    expect(requests).toHaveLength(4);
    expect(state.summaryCounts).toHaveLength(1);
    for (let i = 0; i < 4; i++) visit.tick();
    await flush();
    await flush();
    expect(requests.map((request) => request.timeSpentSeconds)).toEqual([12, 4, 4, 0, 4]);
    expect(requests[4].percent).toBe(100);
    expect(state.client.getQueryData(state.query.queryKey)?.sectionProgress.section).toMatchObject({ completed: true, maxReadPercent: 100, timeSpentSeconds: 15 });
  });

  test("a read started during a PUT cannot erase its receipt or another completed section", async () => {
    const state = setup();
    const put = deferred<Response>();
    const putStarted = deferred<void>();
    const get = deferred<Response>();
    const getStarted = deferred<void>();
    const getFinished = deferred<void>();
    let readSignal: AbortSignal | null | undefined;
    globalThis.fetch = ((_path: unknown, init?: RequestInit) => {
      if (init?.method === "PUT") { putStarted.resolve(); return put.promise; }
      readSignal = init?.signal;
      getStarted.resolve();
      // Let this transport deliver an old response even after cancellation.
      return get.promise;
    }) as unknown as typeof fetch;

    const write = state.mutate();
    await putStarted.promise;
    const queryFn = state.query.queryFn;
    if (typeof queryFn !== "function") throw new Error("Missing article query function");
    const staleRead = state.client.query({
      ...state.query,
      staleTime: 0,
      queryFn: async (context) => {
        try { return await queryFn(context); }
        finally { getFinished.resolve(); }
      },
    }).catch(() => undefined);
    await getStarted.promise;
    state.client.setQueryData(state.query.queryKey, (current) => current ? {
      ...current,
      sectionProgress: { ...current.sectionProgress, other: { completed: true, maxReadPercent: 100, timeSpentSeconds: 7 } },
    } : current);
    put.resolve(Response.json(receipt()));
    await write;
    expect(readSignal?.aborted).toBe(true);
    expect(state.client.getQueryData(state.query.queryKey)?.sectionProgress.other).toMatchObject({ completed: true, timeSpentSeconds: 7 });
    get.resolve(Response.json(state.initial));
    await getFinished.promise;
    await staleRead;
    expect(state.client.getQueryData(state.query.queryKey)?.sectionProgress.section).toMatchObject({ completed: true, maxReadPercent: 100, timeSpentSeconds: 12 });
    expect(state.client.getQueryData(state.query.queryKey)?.sectionProgress.other).toMatchObject({ completed: true, timeSpentSeconds: 7 });
    expect(state.summaryCounts).toHaveLength(1);
  });

  test("setup cancellation also preserves a receipt newer than the read's starting snapshot", async () => {
    const state = setup();
    const get = deferred<Response>();
    const getStarted = deferred<void>();
    globalThis.fetch = ((_path: unknown, init?: RequestInit) => {
      if (init?.method === "PUT") return Promise.resolve(Response.json(receipt()));
      getStarted.resolve();
      return get.promise;
    }) as unknown as typeof fetch;
    const staleRead = state.client.query({ ...state.query, staleTime: 0 }).catch(() => undefined);
    await getStarted.promise;
    state.client.setQueryData(state.query.queryKey, (current) => current ? {
      ...current,
      sectionProgress: { ...current.sectionProgress, other: { completed: true, maxReadPercent: 100, timeSpentSeconds: 7 } },
    } : current);
    await state.mutate();
    expect(state.client.getQueryData(state.query.queryKey)?.sectionProgress.other).toMatchObject({ completed: true, timeSpentSeconds: 7 });
    get.resolve(Response.json(state.initial));
    await staleRead;
  });

  test("simultaneous completions refresh summaries once even while Query still counts both as pending", async () => {
    const state = setup();
    const requests = new Map<string, ReturnType<typeof deferred<Response>>>();
    const started = deferred<void>();
    globalThis.fetch = ((_path: unknown, init?: RequestInit) => {
      const { sectionId } = JSON.parse(String(init?.body));
      const request = deferred<Response>();
      requests.set(sectionId, request);
      if (requests.size === 2) started.resolve();
      return request.promise;
    }) as unknown as typeof fetch;
    const first = state.mutate({ sectionId: "one", percent: 100, completed: true, timeSpentSeconds: 4 });
    const second = state.mutate({ sectionId: "two", percent: 100, completed: true, timeSpentSeconds: 5 });
    await started.promise;
    requests.get("one")!.resolve(Response.json(receipt("one", 4)));
    requests.get("two")!.resolve(Response.json(receipt("two", 5)));
    await Promise.all([first, second]);
    expect(state.summaryCounts).toEqual([2]);
    const progress = state.client.getQueryData(state.query.queryKey)?.sectionProgress;
    expect(progress?.one).toMatchObject({ completed: true, timeSpentSeconds: 4 });
    expect(progress?.two).toMatchObject({ completed: true, timeSpentSeconds: 5 });
  });

  test("a final failed write releases the batch without replaying its elapsed delta", async () => {
    const state = setup();
    const requests = new Map<string, ReturnType<typeof deferred<Response>>>();
    const started = deferred<void>();
    globalThis.fetch = ((_path: unknown, init?: RequestInit) => {
      const { sectionId } = JSON.parse(String(init?.body));
      const request = deferred<Response>();
      requests.set(sectionId, request);
      if (requests.size === 2) started.resolve();
      return request.promise;
    }) as unknown as typeof fetch;
    const first = state.mutate({ sectionId: "one", percent: 100, completed: true, timeSpentSeconds: 4 });
    const failed = state.mutate({ sectionId: "two", percent: 100, completed: true, timeSpentSeconds: 5 }).catch(() => undefined);
    await started.promise;
    requests.get("one")!.resolve(Response.json(receipt("one", 4)));
    await first;
    expect(state.summaryCounts).toHaveLength(0);
    requests.get("two")!.resolve(Response.json({ unexpected: true }));
    await failed;
    expect(state.summaryCounts).toHaveLength(1);
    expect(requests.size).toBe(2);
    expect(state.client.getQueryData(state.query.queryKey)?.sectionProgress.two).toBeUndefined();
  });

  test("a failed onMutate releases its registration before a later completion", async () => {
    const state = setup();
    const cancellation = spyOn(state.client, "cancelQueries").mockRejectedValueOnce(new Error("Cancellation failed"));
    restore.push(() => cancellation.mockRestore());
    let writes = 0;
    globalThis.fetch = ((_path: unknown, _init?: RequestInit) => { writes += 1; return Promise.resolve(Response.json(receipt())); }) as unknown as typeof fetch;
    await expect(state.mutate()).rejects.toThrow("Cancellation failed");
    expect(writes).toBe(0);
    await state.mutate();
    expect(writes).toBe(1);
    expect(state.summaryCounts).toHaveLength(1);
  });

  test.each(["account", "cache"] as const)("%s changes during receipt cancellation cannot recreate progress or retain a pending registration", async (change) => {
    const state = setup();
    const entered = deferred<void>();
    const release = deferred<void>();
    const cancel = state.client.cancelQueries.bind(state.client);
    let cancellations = 0;
    const cancellation = spyOn(state.client, "cancelQueries").mockImplementation(async (...args) => {
      const count = ++cancellations;
      await cancel(...args);
      if (count === 2) { entered.resolve(); await release.promise; }
    });
    restore.push(() => cancellation.mockRestore());
    globalThis.fetch = ((_path: unknown, _init?: RequestInit) => Promise.resolve(Response.json(receipt()))) as unknown as typeof fetch;
    const write = state.mutate();
    await entered.promise;
    if (change === "account") syncQueryAccount(state.client, "other-student");
    else state.client.removeQueries({ queryKey: state.query.queryKey, exact: true });
    release.resolve();
    await write;
    expect(state.client.getQueryState(state.query.queryKey)).toBeUndefined();
    expect(state.summaryCounts).toHaveLength(0);
    syncQueryAccount(state.client, "student");
    state.client.setQueryData(state.query.queryKey, state.initial);
    await state.mutate();
    expect(state.summaryCounts).toHaveLength(1);
  });
});
