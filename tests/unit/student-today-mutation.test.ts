import { afterEach, expect, test } from "bun:test";
import { MutationObserver, QueryObserver } from "@tanstack/react-query";
import { createQueryClient, syncQueryAccount } from "@/lib/query/client";
import { todayCompletionMutation } from "@/lib/student/today-mutation";
import { studentTodayQuery, type TodayData } from "@/lib/student/today-query";

const originalFetch = globalThis.fetch;
const cleanup: Array<() => void> = [];
afterEach(() => {
  globalThis.fetch = originalFetch;
  cleanup.splice(0).forEach(dispose => dispose());
});

function observeToday() {
  const client = createQueryClient();
  syncQueryAccount(client, "student-a");
  const options = studentTodayQuery("student-a");
  const initial: TodayData = {
    streak: { current: 1, longest: 1 },
    items: ["one", "two"].map(id => ({ id, kind: "quiz", title: id, href: "/", done: false })),
  };
  client.setQueryData(options.queryKey, initial);
  const confirmed = new Set<string>();
  let reads = 0;
  const observer = new QueryObserver(client, {
    ...options,
    queryFn: async () => {
      reads++;
      return { ...initial, items: initial.items.map(item => ({ ...item, done: confirmed.has(item.id) })) };
    },
  });
  const unsubscribe = observer.subscribe(() => {});
  cleanup.push(() => { unsubscribe(); client.clear(); });
  return { client, options, initial, confirmed, reads: () => reads };
}

function holdWrites(count: number) {
  const responses = new Map<string, (response: Response) => void>();
  let allStarted!: () => void;
  const started = new Promise<void>(resolve => { allStarted = resolve; });
  globalThis.fetch = (async (_path: unknown, init?: RequestInit) => {
    const { itemId } = JSON.parse(String(init?.body)) as { itemId: string };
    return new Promise<Response>((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
      responses.set(itemId, resolve);
      if (responses.size === count) allStarted();
    });
  }) as unknown as typeof fetch;
  return { responses, started };
}

test("completions released in one turn refresh Today exactly once after both settle", async () => {
  const state = observeToday();
  const writes = holdWrites(2);
  // Separate factories match multiple mounted consumers of the shared cache.
  const first = new MutationObserver(state.client, todayCompletionMutation(state.client, "student-a"))
    .mutate({ itemId: "one", controller: new AbortController() });
  const second = new MutationObserver(state.client, todayCompletionMutation(state.client, "student-a"))
    .mutate({ itemId: "two", controller: new AbortController() });
  await writes.started;
  expect(state.client.getQueryData(state.options.queryKey)?.items.map(item => item.done)).toEqual([true, true]);
  state.confirmed.add("one");
  state.confirmed.add("two");
  writes.responses.get("one")!(Response.json({ ok: true }));
  writes.responses.get("two")!(Response.json({ ok: true }));
  await Promise.all([first, second]);
  expect(state.reads()).toBe(1);
  expect(state.client.isMutating()).toBe(0);
  expect(state.client.getQueryState(state.options.queryKey)?.isInvalidated).toBe(false);
  expect(state.client.getQueryData(state.options.queryKey)?.items.map(item => item.done)).toEqual([true, true]);
});

test("simultaneous ambiguous and valid completions reconcile after rollback", async () => {
  const state = observeToday();
  const writes = holdWrites(2);
  const first = new MutationObserver(state.client, todayCompletionMutation(state.client, "student-a"))
    .mutate({ itemId: "one", controller: new AbortController() }).catch(error => error);
  const second = new MutationObserver(state.client, todayCompletionMutation(state.client, "student-a"))
    .mutate({ itemId: "two", controller: new AbortController() });
  await writes.started;
  // Both writes committed, but the first response has an invalid success body.
  state.confirmed.add("one");
  state.confirmed.add("two");
  writes.responses.get("one")!(Response.json({ ok: "invalid" }));
  writes.responses.get("two")!(Response.json({ ok: true }));
  await Promise.all([first, second]);
  expect(state.reads()).toBe(1);
  expect(state.client.getQueryData(state.options.queryKey)?.items.map(item => item.done)).toEqual([true, true]);
});

test("an aborted completion stays stale until the remaining live write settles", async () => {
  const state = observeToday();
  const writes = holdWrites(2);
  const aborted = new AbortController();
  const first = new MutationObserver(state.client, todayCompletionMutation(state.client, "student-a"))
    .mutate({ itemId: "one", controller: aborted }).catch(error => error);
  const second = new MutationObserver(state.client, todayCompletionMutation(state.client, "student-a"))
    .mutate({ itemId: "two", controller: new AbortController() });
  await writes.started;
  aborted.abort();
  await first;
  expect(state.reads()).toBe(0);
  expect(state.client.getQueryState(state.options.queryKey)?.isInvalidated).toBe(true);
  state.confirmed.add("two");
  writes.responses.get("two")!(Response.json({ ok: true }));
  await second;
  expect(state.reads()).toBe(1);
  expect(state.client.getQueryData(state.options.queryKey)?.items.map(item => item.done)).toEqual([false, true]);
});

test("an aborted onMutate cleans up so a later completion can refresh", async () => {
  const state = observeToday();
  const writes = holdWrites(1);
  const aborted = new AbortController();
  aborted.abort();
  await expect(new MutationObserver(state.client, todayCompletionMutation(state.client, "student-a"))
    .mutate({ itemId: "one", controller: aborted })).rejects.toThrow();
  expect(writes.responses.size).toBe(0);
  expect(state.reads()).toBe(0);
  expect(state.client.getQueryState(state.options.queryKey)?.isInvalidated).toBe(true);
  const next = new MutationObserver(state.client, todayCompletionMutation(state.client, "student-a"))
    .mutate({ itemId: "two", controller: new AbortController() });
  await writes.started;
  state.confirmed.add("two");
  writes.responses.get("two")!(Response.json({ ok: true }));
  await next;
  expect(state.reads()).toBe(1);
});

test("account changes ignore late responses and clean up failed onMutate registrations", async () => {
  const state = observeToday();
  const writes = holdWrites(1);
  const old = new MutationObserver(state.client, todayCompletionMutation(state.client, "student-a"))
    .mutate({ itemId: "one", controller: new AbortController() });
  await writes.started;
  syncQueryAccount(state.client, "student-b");
  writes.responses.get("one")!(Response.json({ ok: true }));
  await old;
  expect(state.client.getQueryData(state.options.queryKey)).toBeUndefined();
  expect(state.reads()).toBe(0);
  await expect(new MutationObserver(state.client, todayCompletionMutation(state.client, "student-a"))
    .mutate({ itemId: "two", controller: new AbortController() })).rejects.toThrow("Account changed");
  expect(writes.responses.size).toBe(1);

  // Returning to the account must not inherit a stuck pending registration.
  syncQueryAccount(state.client, "student-a");
  state.client.setQueryData(state.options.queryKey, state.initial);
  const observer = new QueryObserver(state.client, {
    ...state.options,
    queryFn: async () => ({ ...state.initial, items: state.initial.items.map(item => ({ ...item, done: true })) }),
  });
  const unsubscribe = observer.subscribe(() => {});
  cleanup.push(unsubscribe);
  const nextWrites = holdWrites(1);
  const next = new MutationObserver(state.client, todayCompletionMutation(state.client, "student-a"))
    .mutate({ itemId: "two", controller: new AbortController() });
  await nextWrites.started;
  nextWrites.responses.get("two")!(Response.json({ ok: true }));
  await next;
  expect(state.client.getQueryData(state.options.queryKey)?.items.map(item => item.done)).toEqual([true, true]);
  expect(state.client.getQueryState(state.options.queryKey)?.isInvalidated).toBe(false);
});
