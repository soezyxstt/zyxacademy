import { afterEach, expect, test } from "bun:test";
import { createQueryClient } from "@/lib/query/client";
import { ApiResponseError } from "@/lib/query/http";
import { studentCourseQuery, studentEnrollmentsQuery } from "@/lib/student/navigation-query";
import { studyPathQuery } from "@/lib/student/study-path-query";
import { discussionCountsQuery } from "@/lib/discussions/counts-query";
import { zyraAllowanceQuery } from "@/lib/zyra/allowance-query";
import { pricingDiscountsQuery } from "@/lib/query/pricing";

const originalFetch = globalThis.fetch;
const clients: ReturnType<typeof createQueryClient>[] = [];
afterEach(() => { globalThis.fetch = originalFetch; clients.splice(0).forEach(client => client.clear()); });
function client() { const value = createQueryClient(); clients.push(value); return value; }

test("navigation keeps response ownership, URL scope, and cancellation in its fetch contract", async () => {
  const cache = client();
  const requests: { url: string; owner: string | null; signal: AbortSignal | null | undefined }[] = [];
  globalThis.fetch = (async (path: unknown, init?: RequestInit) => {
    requests.push({ url: String(path), owner: new Headers(init?.headers).get("x-student-id"), signal: init?.signal });
    return Response.json(String(path).includes("?") ? { id: "course/one", title: "One" } : [{ id: "course/one", title: "One" }]);
  }) as unknown as typeof fetch;
  expect(await cache.query(studentEnrollmentsQuery("learner"))).toEqual([{ id: "course/one", title: "One" }]);
  expect(await cache.query(studentCourseQuery("learner", "course/one"))).toEqual({ id: "course/one", title: "One" });
  expect(requests.map(request => request.owner)).toEqual(["learner", "learner"]);
  expect(new URL(requests[1].url, "https://example.test").searchParams.get("courseId")).toBe("course/one");
  expect(requests.every(request => request.signal instanceof AbortSignal)).toBe(true);
});

test("study paths separate plan length and reject malformed steps before caching", async () => {
  const cache = client();
  const options = studyPathQuery("learner", "course", 7);
  let requested = "";
  globalThis.fetch = (async (path: unknown) => { requested = String(path); return Response.json({ steps: [], dayPlan: [] }); }) as unknown as typeof fetch;
  expect(await cache.query(options)).toEqual({ steps: [], dayPlan: [] });
  expect(new URL(requested, "https://example.test").searchParams.get("days")).toBe("7");
  expect(options.queryKey).not.toEqual(studyPathQuery("learner", "course", 14).queryKey);
  expect(options.retry).toBe(false);
  globalThis.fetch = (async () => Response.json({ steps: [{ stepId: "missing-fields" }], dayPlan: null })) as unknown as typeof fetch;
  const invalid = studyPathQuery("learner", "other-course");
  await expect(cache.query(invalid)).rejects.toBeInstanceOf(ApiResponseError);
  expect(cache.getQueryData(invalid.queryKey)).toBeUndefined();
});

test("discussion counts reject negative and string counts instead of showing false badges", async () => {
  const cache = client();
  globalThis.fetch = (async () => Response.json({ total: { unreadThreads: -1, activeThreads: "2" }, course: null })) as unknown as typeof fetch;
  const options = discussionCountsQuery("learner", "course");
  await expect(cache.query(options)).rejects.toBeInstanceOf(ApiResponseError);
  expect(cache.getQueryData(options.queryKey)).toBeUndefined();
  expect(options.refetchIntervalInBackground).toBe(false);
});

test("allowance reads stay disabled without a course and reject unrecognized access tiers", async () => {
  expect(zyraAllowanceQuery("learner").enabled).toBe(false);
  expect(zyraAllowanceQuery("learner", "unknown").enabled).toBe(false);
  const cache = client();
  const options = zyraAllowanceQuery("learner", "course");
  globalThis.fetch = (async () => Response.json({ summary: { accessTier: "admin" } })) as unknown as typeof fetch;
  await expect(cache.query(options)).rejects.toBeInstanceOf(ApiResponseError);
  expect(cache.getQueryData(options.queryKey)).toBeUndefined();
  expect(options.retry).toBe(false);
});

test("pricing accepts valid campaigns and fails closed on invalid dates and percentages", async () => {
  const cache = client();
  const campaign = { percent: 20, startsOn: "2026-11-01", endsOn: "2026-11-30" };
  globalThis.fetch = (async () => Response.json({ platform: campaign, tutorial: campaign })) as unknown as typeof fetch;
  expect(await cache.query(pricingDiscountsQuery())).toEqual({ platform: campaign, tutorial: campaign });
  cache.clear();
  globalThis.fetch = (async () => Response.json({ platform: { ...campaign, percent: 120 }, tutorial: { ...campaign, endsOn: "2026-02-30" } })) as unknown as typeof fetch;
  await expect(cache.query(pricingDiscountsQuery())).rejects.toBeInstanceOf(ApiResponseError);
  expect(cache.getQueryData(pricingDiscountsQuery().queryKey)).toBeUndefined();
});
