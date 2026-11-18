import { afterEach, expect, test } from "bun:test";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { syncQueryAccount } from "@/lib/query/client";
import { ApiError, ApiResponseError } from "@/lib/query/http";
import { queryKeys } from "@/lib/query/keys";
import { dismissInterventionMutation, interventionSchema, studentInterventionsQuery } from "@/lib/student/interventions-query";
import { zyraOpsQuery } from "@/lib/zyra/ops-query";
import { createZyraProposalMutation, proposalSummarySchema, transitionZyraProposalMutation, zyraProposalsQuery } from "@/lib/zyra/proposals-query";

const originalFetch = globalThis.fetch;
const clients: QueryClient[] = [];
const timestamp = "2026-11-18T12:00:00.000Z";
const intervention = {
  id: "suggestion-one", studentId: "student-a", courseId: "course-one",
  conceptName: "Vectors", reason: "low and declining mastery", status: "active" as const,
  payload: { moduleHref: "/courses/course-one", quizTemplateIds: ["quiz-one"], flashcardCount: 3 },
  createdAt: timestamp,
};
const proposal = {
  id: "proposal-one", proposalType: "course_readiness", courseId: "course-one",
  status: "validated" as const, preconditionVersion: 7, diffHash: "a".repeat(64), createdAt: timestamp,
};
const opsMetrics = {
  checkedAt: timestamp, externalUsageUnknown: true, projectSlotCount: 4,
  projectSlots: [1, 2, 3, 4].map(slot => ({ slot, alias: "masked", health: "unknown" })),
  ledger: { committedProviderTurns: 0, activeReservations: 0, refundedReservations: 0, cacheSavedTurns: 0 },
  image: { uploaded: 0, dispatched: 0, expired: 0, failed: 0 },
  traces: { success: 0, failure: 0, validationViolations: 0 },
  events: [], configuredModels: [], capacity: { modelPools: [] }, alerts: [],
};

function client(userId?: string) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  clients.push(cache);
  if (userId) syncQueryAccount(cache, userId);
  return cache;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  for (const cache of clients.splice(0)) cache.clear();
});

test("interventions validate their owner and nested payload before caching", async () => {
  globalThis.fetch = (async () => Response.json([{ ...intervention, payload: { ...intervention.payload, flashcardCount: "3" } }])) as unknown as typeof fetch;
  const cache = client("student-a");
  expect((await cache.query(studentInterventionsQuery("student-a")))[0]?.payload.flashcardCount).toBe(3);
  await expect(cache.query(studentInterventionsQuery("student-b"))).rejects.toBeInstanceOf(ApiResponseError);
  expect(cache.getQueryData(queryKeys.student.interventions("student-b"))).toBeUndefined();
  for (const flashcardCount of [null, false, "", "3.5", "-1"]) {
    expect(interventionSchema.safeParse({ ...intervention, payload: { ...intervention.payload, flashcardCount } }).success).toBe(false);
  }
});

test("a failed or unacknowledged dismissal preserves the cached suggestion without retrying", async () => {
  const cache = client("student-a");
  const key = queryKeys.student.interventions("student-a");
  cache.setQueryData(key, [intervention]);
  const options = dismissInterventionMutation(cache, "student-a");
  expect(options.retry).toBe(false);
  expect(options.networkMode).toBe("always");
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return Response.json({ error: "unavailable" }, { status: 503 }); }) as unknown as typeof fetch;
  await expect(new MutationObserver(cache, options).mutate(intervention.id)).rejects.toBeInstanceOf(ApiError);
  expect(calls).toBe(1);
  expect<unknown>(cache.getQueryData(key)).toEqual([intervention]);
  expect(cache.getQueryState(key)?.isInvalidated).toBe(false);
  globalThis.fetch = (async () => Response.json({ success: false })) as unknown as typeof fetch;
  await expect(new MutationObserver(cache, options).mutate(intervention.id)).rejects.toBeInstanceOf(ApiResponseError);
  expect<unknown>(cache.getQueryData(key)).toEqual([intervention]);
  expect(cache.getQueryState(key)?.isInvalidated).toBe(false);
});

test("acknowledged dismissals invalidate only their actor while the UI finishes its exit", async () => {
  const cache = client("student-a");
  const own = queryKeys.student.interventions("student-a"), other = queryKeys.student.interventions("student-b");
  cache.setQueryData(own, [intervention]);
  cache.setQueryData(other, [{ ...intervention, studentId: "student-b" }]);
  let receivedPath = "", receivedHeaders: Headers | undefined;
  globalThis.fetch = (async (path: unknown, init?: RequestInit) => {
    receivedPath = String(path); receivedHeaders = new Headers(init?.headers);
    return Response.json({ success: true });
  }) as unknown as typeof fetch;
  await new MutationObserver(cache, dismissInterventionMutation(cache, "student-a")).mutate("suggestion/one");
  expect(receivedPath).toBe("/api/student/interventions/suggestion%2Fone/dismiss");
  expect(receivedHeaders?.get("x-student-id")).toBe("student-a");
  expect<unknown>(cache.getQueryData(own)).toEqual([intervention]);
  expect(cache.getQueryState(own)?.isInvalidated).toBe(true);
  expect(cache.getQueryState(other)?.isInvalidated).toBe(false);
});

test("Zyra ops reads reuse the canonical masked metrics schema and account key", async () => {
  const cache = client();
  let requests = 0, signal: AbortSignal | null | undefined;
  globalThis.fetch = (async (_path: unknown, init?: RequestInit) => { requests++; signal = init?.signal; return Response.json(opsMetrics); }) as unknown as typeof fetch;
  await Promise.all([cache.query(zyraOpsQuery("admin-a")), cache.query(zyraOpsQuery("admin-a"))]);
  expect(requests).toBe(1);
  expect(signal).toBeInstanceOf(AbortSignal);
  expect(zyraOpsQuery("admin-a").queryKey).not.toEqual(zyraOpsQuery("admin-b").queryKey);
  expect(zyraOpsQuery("").enabled).toBe(false);
  globalThis.fetch = (async () => Response.json({ ...opsMetrics, projectSlotCount: 1 })) as unknown as typeof fetch;
  await expect(cache.query(zyraOpsQuery("admin-b"))).rejects.toBeInstanceOf(ApiResponseError);
  expect(cache.getQueryData(zyraOpsQuery("admin-b").queryKey)).toBeUndefined();
});

test("proposal queries isolate scope, encode filters, and cache only validated view fields", async () => {
  expect(zyraProposalsQuery("a", null).queryKey).toEqual(zyraProposalsQuery("a").queryKey);
  expect(zyraProposalsQuery("a", "course-one").queryKey).not.toEqual(zyraProposalsQuery("a", "course-two").queryKey);
  expect(zyraProposalsQuery("a", "course-one").queryKey).not.toEqual(zyraProposalsQuery("b", "course-one").queryKey);
  let url = "", signal: AbortSignal | null | undefined;
  globalThis.fetch = (async (path: unknown, init?: RequestInit) => {
    url = String(path); signal = init?.signal;
    return Response.json({ proposals: [{ ...proposal, operations: [{ kind: "read_only_report" }] }] });
  }) as unknown as typeof fetch;
  const cache = client();
  const response = await cache.query(zyraProposalsQuery("a", "course & one"));
  expect(new URL(url, "https://test.invalid").searchParams.get("courseId")).toBe("course & one");
  expect(signal).toBeInstanceOf(AbortSignal);
  expect(response.proposals).toEqual([proposal]);
  expect(proposalSummarySchema.safeParse({ ...proposal, preconditionVersion: "7" }).success).toBe(false);
  expect(proposalSummarySchema.safeParse({ ...proposal, diffHash: "invalid" }).success).toBe(false);
  expect(proposalSummarySchema.safeParse({ ...proposal, status: "unknown" }).success).toBe(false);
});

test("proposal transitions preserve revision checks and reconcile every actor filter", async () => {
  const cache = client("admin-a");
  const all = zyraProposalsQuery("admin-a").queryKey;
  const course = zyraProposalsQuery("admin-a", "course-one").queryKey;
  const other = zyraProposalsQuery("admin-b", "course-one").queryKey;
  for (const key of [all, course, other]) cache.setQueryData(key, { proposals: [proposal] });
  let body: unknown, path = "";
  globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
    path = String(url); body = JSON.parse(String(init?.body));
    return Response.json({ proposal: { ...proposal, status: "reviewed" } });
  }) as unknown as typeof fetch;
  const options = transitionZyraProposalMutation(cache, "admin-a");
  expect(options.retry).toBe(false);
  expect(options.networkMode).toBe("always");
  await new MutationObserver(cache, options).mutate({ proposal, action: "review" });
  expect(path).toBe("/api/zyra/proposals/proposal-one");
  expect(body).toEqual({ action: "review", preconditionVersion: 7 });
  expect(cache.getQueryState(all)?.isInvalidated).toBe(true);
  expect(cache.getQueryState(course)?.isInvalidated).toBe(true);
  expect(cache.getQueryState(other)?.isInvalidated).toBe(false);
  // There is no optimistic lifecycle transition before a fresh list response.
  expect(cache.getQueryData(course)?.proposals[0]?.status).toBe("validated");
});

test("proposal creation preserves read-only report operations and never retries a failed write", async () => {
  const cache = client("tutor-a");
  let calls = 0, body: Record<string, unknown> | undefined;
  globalThis.fetch = (async (_path: unknown, init?: RequestInit) => {
    calls++; body = JSON.parse(String(init?.body));
    return Response.json({ error: "unavailable" }, { status: 503 });
  }) as unknown as typeof fetch;
  const options = createZyraProposalMutation(cache, "tutor-a", "tutor", "course-one");
  expect(options.retry).toBe(false);
  await expect(new MutationObserver(cache, options).mutate()).rejects.toBeInstanceOf(ApiError);
  expect(calls).toBe(1);
  expect(body?.proposalType).toBe("misconception_brief");
  expect(body?.preconditionSnapshot).toEqual({ version: 1 });
  expect(body?.operations).toEqual([{ kind: "read_only_report", reportKey: "misconception_brief" }]);
});

test("old account mutations cannot recreate private caches after logout", async () => {
  const cache = client("admin-a");
  const key = zyraProposalsQuery("admin-a").queryKey;
  cache.setQueryData(key, { proposals: [proposal] });
  let resolveWrite!: (response: Response) => void;
  let started!: () => void;
  const start = new Promise<void>(resolve => { started = resolve; });
  globalThis.fetch = (async () => new Promise<Response>(resolve => { resolveWrite = resolve; started(); })) as unknown as typeof fetch;
  const pending = new MutationObserver(cache, transitionZyraProposalMutation(cache, "admin-a")).mutate({ proposal, action: "review" });
  await start;
  syncQueryAccount(cache, null);
  resolveWrite(Response.json({ proposal: { ...proposal, status: "reviewed" } }));
  await pending;
  expect(cache.getQueryData(key)).toBeUndefined();
  await expect(new MutationObserver(cache, dismissInterventionMutation(cache, "admin-a")).mutate("suggestion")).rejects.toMatchObject({ status: 409 });
});
