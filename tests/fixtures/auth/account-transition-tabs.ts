import { expect, test } from "bun:test";

test("other tabs pause once, resume on cancellation, and reload on verified commit or a missed BFCache update", async () => {
  const names = ["window", "document", "BroadcastChannel"] as const;
  const originals = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  const storage = new Map<string, string>();
  const sent: unknown[] = [];
  const windowTarget = new EventTarget();
  const documentTarget = new EventTarget();
  let reloads = 0;
  let channel: TestChannel | undefined;
  class TestChannel {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    constructor() { channel = this; }
    postMessage(data: unknown) { sent.push(data); }
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    addEventListener: windowTarget.addEventListener.bind(windowTarget),
    localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); } },
    sessionStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => { storage.set(key, value); }, removeItem: (key: string) => { storage.delete(key); } },
    location: { reload: () => { reloads += 1; } },
  } });
  Object.defineProperty(globalThis, "document", { configurable: true, value: {
    addEventListener: documentTarget.addEventListener.bind(documentTarget), hidden: false,
  } });
  Object.defineProperty(globalThis, "BroadcastChannel", { configurable: true, value: TestChannel });
  const path = new URL("../../../lib/auth/account-transition-state.ts", import.meta.url).href;
  const state = await import(path) as typeof import("@/lib/auth/account-transition-state");
  const observed: boolean[] = [];
  const observedRemote: boolean[] = [];
  const unsubscribe = state.subscribeAccountTransition((pending) => observed.push(pending));
  const unsubscribeRemote = state.subscribeRemoteAccountTransition((pending) => observedRemote.push(pending));
  try {
    const remote = { source: "other-tab", phase: "begin", at: Date.now() };
    channel?.onmessage?.({ data: remote });
    expect(state.isAccountTransitionPending()).toBe(true);
    expect(state.isRemoteAccountTransitionPending()).toBe(true);
    expect(state.isLocalAccountTransitionPending()).toBe(false);
    const event = new Event("storage");
    Object.assign(event, { key: "zyx-account-transition-v1", newValue: JSON.stringify(remote) });
    windowTarget.dispatchEvent(event);
    expect(observed).toEqual([true]);
    expect(observedRemote).toEqual([true]);
    channel?.onmessage?.({ data: { ...remote, phase: "cancel" } });
    expect(state.isAccountTransitionPending()).toBe(false);
    expect(observed).toEqual([true, false]);
    expect(state.isRemoteAccountTransitionPending()).toBe(false);

    state.setAccountTransitionPending(true);
    expect(state.isRemoteAccountTransitionPending()).toBe(false);
    expect(state.isLocalAccountTransitionPending()).toBe(true);
    state.announceAccountTransitionCommitted();
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(reloads).toBe(0);
    const commit = sent.at(-1) as Record<string, unknown>;
    expect(Object.keys(commit).sort()).toEqual(["at", "phase", "source"]);
    expect(commit.phase).toBe("commit");
    expect(observedRemote).toEqual([true, false]);
    state.setAccountTransitionPending(false);
    expect(state.isLocalAccountTransitionPending()).toBe(false);

    channel?.onmessage?.({ data: { ...remote, phase: "commit" } });
    expect(reloads).toBe(1);
    expect(state.isAccountTransitionPending()).toBe(true);
    channel?.onmessage?.({ data: { ...remote, phase: "cancel" } });
    state.markBrowserAccountRedirect("user-a");
    const sentBeforeRedirect = sent.length;
    state.finishBrowserAccountRedirect("user-a");
    expect(storage.has("zyx-account-redirect-v1")).toBe(true);
    expect(sent).toHaveLength(sentBeforeRedirect);
    // The callback document has a new source ID. Reproduce the marker it reads
    // from the departed document without relying on module-loader query caching.
    storage.set("zyx-account-redirect-v1", JSON.stringify({ previousUserId: "user-a", source: "departed-document" }));
    state.finishBrowserAccountRedirect("user-b");
    expect((sent.at(-1) as { phase: string }).phase).toBe("commit");
    expect(storage.has("zyx-account-redirect-v1")).toBe(false);
    storage.set("zyx-account-redirect-v1", JSON.stringify({ previousUserId: "user-a", source: "departed-document" }));
    state.finishBrowserAccountRedirect("user-a");
    expect((sent.at(-1) as { phase: string }).phase).toBe("cancel");

    storage.set("zyx-account-change-v1", JSON.stringify({ ...remote, at: Date.now() + 1, phase: "commit" }));
    const restored = new Event("pageshow");
    Object.assign(restored, { persisted: true });
    windowTarget.dispatchEvent(restored);
    expect(reloads).toBe(2);
    expect(state.isAccountTransitionPending()).toBe(true);
    expect(state.isRemoteAccountTransitionPending()).toBe(true);
  } finally {
    unsubscribe();
    unsubscribeRemote();
    state.setAccountTransitionPending(false);
    names.forEach((name, index) => {
      const descriptor = originals[index];
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    });
  }
});
