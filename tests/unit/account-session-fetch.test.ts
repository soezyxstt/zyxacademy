import { expect, test } from "bun:test";
import { createAccountSessionFetch } from "@/lib/auth/account-session-fetch";

function transitionState() {
  let pending = false;
  const listeners = new Set<(pending: boolean) => void>();
  return {
    isPending: () => pending,
    subscribe: (listener: (pending: boolean) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set(next: boolean) {
      pending = next;
      [...listeners].forEach((listener) => listener(next));
    },
    listenerCount: () => listeners.size,
  };
}

const sessionUrl = "https://staging.zyxacademy.com/api/auth/get-session";

test("transition aborts passive session transport, queues new reads, and resumes them after rollback", async () => {
  const state = transitionState();
  let calls = 0;
  let firstSignal: AbortSignal | null | undefined;
  let started!: () => void;
  const firstStarted = new Promise<void>((resolve) => { started = resolve; });
  const sessionFetch = createAccountSessionFetch({
    ...state,
    fetch: async (_input, init) => {
      calls += 1;
      if (calls === 1) {
        firstSignal = init?.signal;
        started();
        await new Promise<void>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
        });
      }
      return Response.json({ user: { id: "current" } });
    },
  });
  const first = sessionFetch(sessionUrl);
  await firstStarted;
  state.set(true);
  expect(firstSignal?.aborted).toBe(true);
  const queued = sessionFetch(sessionUrl);
  await Promise.resolve();
  expect(calls).toBe(1);

  const authoritative = await sessionFetch(`${sessionUrl}?disableCookieCache=true&disableRefresh=true`);
  expect((await authoritative.json()).user.id).toBe("current");
  expect(calls).toBe(2);
  state.set(false);
  const resumed = await Promise.all([first, queued]);
  expect(await Promise.all(resumed.map((response) => response.json()))).toEqual([
    { user: { id: "current" } }, { user: { id: "current" } },
  ]);
  expect(calls).toBe(4);
  expect(state.listenerCount()).toBe(0);
});

test("caller abort cancels a queued or in-flight read without retrying or leaving subscriptions", async () => {
  const state = transitionState();
  let calls = 0;
  let started!: () => void;
  const firstStarted = new Promise<void>((resolve) => { started = resolve; });
  const sessionFetch = createAccountSessionFetch({
    ...state,
    fetch: async (_input, init) => {
      calls += 1;
      started();
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
      });
    },
  });
  state.set(true);
  const queuedController = new AbortController();
  const queued = sessionFetch(sessionUrl, { signal: queuedController.signal });
  queuedController.abort();
  await expect(queued).rejects.toMatchObject({ name: "AbortError" });
  expect(calls).toBe(0);
  expect(state.listenerCount()).toBe(0);

  state.set(false);
  const runningController = new AbortController();
  const running = sessionFetch(sessionUrl, { signal: runningController.signal });
  await firstStarted;
  runningController.abort();
  await expect(running).rejects.toMatchObject({ name: "AbortError" });
  expect(calls).toBe(1);
  expect(state.listenerCount()).toBe(0);
});

test("non-session auth operations stay available and ordinary fetch failures are not retried", async () => {
  const state = transitionState();
  const failure = new TypeError("Network unavailable");
  let calls = 0;
  const sessionFetch = createAccountSessionFetch({
    ...state,
    fetch: async () => { calls += 1; throw failure; },
  });
  state.set(true);
  await expect(sessionFetch("https://staging.zyxacademy.com/api/auth/multi-session/set-active", { method: "POST" }))
    .rejects.toBe(failure);
  state.set(false);
  await expect(sessionFetch(sessionUrl)).rejects.toBe(failure);
  expect(calls).toBe(2);
  expect(state.listenerCount()).toBe(0);
});
