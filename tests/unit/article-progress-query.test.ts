import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import { articleProgressQuery, updateArticleProgress } from "../../lib/articles/progress-query";
import { createArticleVisit, mergeArticleSectionProgress } from "../../lib/articles/progress-contract";
import { ApiResponseError } from "../../lib/query/http";

const originalFetch = globalThis.fetch;
const clients: QueryClient[] = [];
const makeClient = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  return client;
};
afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const client of clients.splice(0)) client.clear();
});

describe("article progress cache", () => {
  test("shares reads for one article revision and separates learner and revision keys", async () => {
    const requests: Array<{ url: string; userId: string | null }> = [];
    globalThis.fetch = (async (url, init) => {
      requests.push({ url: String(url), userId: new Headers(init?.headers).get("x-student-id") });
      return Response.json({ articleId: "article:v2", articleVersion: Number(new URL(String(url), "http://local.test").searchParams.get("version")), sectionProgress: {} });
    }) as unknown as typeof fetch;
    const client = makeClient();
    const first = articleProgressQuery("student-a", "article:v2", 2);
    await Promise.all([client.query(first), client.query(first)]);
    expect(requests).toEqual([{ url: "/api/student/articles/article%3Av2/progress?version=2", userId: "student-a" }]);
    await client.query(articleProgressQuery("student-b", "article:v2", 2));
    await client.query(articleProgressQuery("student-a", "article:v2", 3));
    expect(requests.length).toBe(3);
    expect(client.getQueryData(first.queryKey)?.articleVersion).toBe(2);
  });

  test("rejects a wrong revision or malformed response without replacing confirmed progress", async () => {
    const client = makeClient();
    const options = articleProgressQuery("student", "article", 2);
    const confirmed = { articleId: "article", articleVersion: 2, sectionProgress: { section: { maxReadPercent: 70, completed: false, timeSpentSeconds: 10 } } };
    client.setQueryData(options.queryKey, confirmed);
    globalThis.fetch = (async () => Response.json({ ...confirmed, articleVersion: 1 })) as unknown as typeof fetch;
    await expect(client.query({ ...options, staleTime: 0 })).rejects.toBeInstanceOf(ApiResponseError);
    expect<unknown>(client.getQueryData(options.queryKey)).toEqual(confirmed);
    globalThis.fetch = (async () => Response.json({ ...confirmed, sectionProgress: { section: { completed: "yes", maxReadPercent: 100, timeSpentSeconds: 12 } } })) as unknown as typeof fetch;
    await expect(client.query({ ...options, staleTime: 0 })).rejects.toBeInstanceOf(ApiResponseError);
    expect<unknown>(client.getQueryData(options.queryKey)).toEqual(confirmed);
  });

  test("passes cancellation to the progress read", async () => {
    let capturedSignal: AbortSignal | null | undefined;
    globalThis.fetch = ((_, init) => {
      capturedSignal = init?.signal;
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
    }) as unknown as typeof fetch;
    const client = makeClient();
    const options = articleProgressQuery("student", "article", 1);
    const read = client.query(options).catch(() => undefined);
    await client.cancelQueries({ queryKey: options.queryKey, exact: true });
    await read;
    expect(capturedSignal?.aborted).toBe(true);
    expect(client.getQueryData(options.queryKey)).toBeUndefined();
  });

  test("sends a small actor-bound keepalive write and rejects a receipt for another section", async () => {
    let request: RequestInit | undefined;
    globalThis.fetch = (async (_, init) => {
      request = init;
      return Response.json({ success: true, articleId: "article", articleVersion: 4, sectionId: "other", maxReadPercent: 100, completed: true, timeSpentSeconds: 9, completedAt: null });
    }) as unknown as typeof fetch;
    await expect(updateArticleProgress("student", "article", 4, { sectionId: "section", percent: 100, timeSpentSeconds: 9, completed: true })).rejects.toBeInstanceOf(ApiResponseError);
    expect(request?.method).toBe("PUT");
    expect(request?.keepalive).toBe(true);
    expect(new Headers(request?.headers).get("x-student-id")).toBe("student");
    expect(JSON.parse(String(request?.body))).toEqual({ sectionId: "section", articleVersion: 4, percent: 100, timeSpentSeconds: 9, completed: true });
  });
});

describe("article progress races", () => {
  test("completion then visibility, section exit and unmount consume each elapsed second once", () => {
    const visit = createArticleVisit("section");
    for (let i = 0; i < 12; i++) visit.tick();
    visit.observe(70);
    visit.observe(30);
    expect(visit.maxReadPercent).toBe(70);
    const atCompletion = visit.takeTime();
    for (let i = 0; i < 4; i++) visit.tick();
    const atHidden = visit.takeTime();
    const atCleanup = visit.takeTime();
    expect([atCompletion, atHidden, atCleanup]).toEqual([12, 4, 0]);
    expect(atCompletion + atHidden + atCleanup).toBe(16);
  });

  test("a late earlier response cannot clear completion, depth or elapsed time", () => {
    expect(mergeArticleSectionProgress(
      { maxReadPercent: 100, completed: true, timeSpentSeconds: 16 },
      { maxReadPercent: 70, completed: false, timeSpentSeconds: 12 },
    )).toEqual({ maxReadPercent: 100, completed: true, timeSpentSeconds: 16 });
  });
});
