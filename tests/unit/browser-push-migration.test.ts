import { expect, test } from "bun:test";
import { isBrowserPushPaused, pauseBrowserPush, resumeBrowserPush } from "@/lib/firebase/messaging";
import { clearRegisteredPushTokenIdentity, getPersistedRegisteredPushToken, markPushTokenRegistered } from "@/lib/notifications/transport";

test("browser migration retires only its push scope and preserves retry identity until server acknowledgement", async () => {
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const oldFetch = globalThis.fetch;
  const oldApiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const store = new Map<string, string>();
  const scopes: string[] = [];
  const deletions: unknown[] = [];
  let hasSubscription = true;
  let unsubscribeCalls = 0;
  let serverAvailable = false;
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
  try {
    // Test the explicit browser cleanup without contacting the Firebase SDK.
    delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage } });
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        userAgent: "Chrome",
        serviceWorker: {
          getRegistration: async (scope: string) => {
            scopes.push(scope);
            return {
              scope: "https://staging.zyxacademy.com/firebase-cloud-messaging-push-scope/",
              pushManager: { getSubscription: async () => hasSubscription ? {
                unsubscribe: async () => { unsubscribeCalls++; hasSubscription = false; return true; },
              } : null },
            };
          },
        },
      },
    });
    globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
      expect(String(url)).toBe("/api/notifications/register-token");
      expect(init?.method).toBe("DELETE");
      deletions.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: serverAvailable ? 200 : 503 });
    }) as typeof fetch;

    markPushTokenRegistered("owner", "browser-token");
    await expect(pauseBrowserPush()).rejects.toThrow("BROWSER_PUSH_RETIRE_FAILED");
    expect(isBrowserPushPaused()).toBe(true);
    expect(getPersistedRegisteredPushToken()).toBe("browser-token");
    expect(unsubscribeCalls).toBe(1);

    serverAvailable = true;
    await pauseBrowserPush();
    expect(getPersistedRegisteredPushToken()).toBeNull();
    expect(isBrowserPushPaused()).toBe(true);
    expect(unsubscribeCalls).toBe(1);
    expect(scopes).toEqual(Array(2).fill("/firebase-cloud-messaging-push-scope"));
    expect(deletions).toEqual(Array(2).fill({ token: "browser-token", browserOnly: true }));
    resumeBrowserPush();
    expect(isBrowserPushPaused()).toBe(false);
  } finally {
    clearRegisteredPushTokenIdentity();
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
    globalThis.fetch = oldFetch;
    if (oldApiKey === undefined) delete process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    else process.env.NEXT_PUBLIC_FIREBASE_API_KEY = oldApiKey;
  }
});
