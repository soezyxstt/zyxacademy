import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  clearRegisteredPushTokenIdentity,
  isFirebaseMessagingConfigured,
  markPushTokenRegistered,
  onForegroundMessage,
  registerTokenToServer,
  getFCMToken,
  shouldRegisterPushToken,
} from "@/lib/firebase/messaging";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalFetch = globalThis.fetch;
beforeEach(() => {
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  clearRegisteredPushTokenIdentity();
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
  clearRegisteredPushTokenIdentity();
});

describe("FCM client effects and configuration guards (WP6)", () => {
  test("deduplicates granted token registration by userId and token across route transitions while re-registering on account switch or token refresh", () => {
    clearRegisteredPushTokenIdentity();

    // First session registration
    expect(shouldRegisterPushToken({ userId: "student-1", token: "fcm-token-a" })).toBe(true);
    markPushTokenRegistered("student-1", "fcm-token-a");

    // Route transition with same userId and token does not re-register
    expect(shouldRegisterPushToken({ userId: "student-1", token: "fcm-token-a" })).toBe(false);

    // Stale token refresh for same user triggers re-registration
    expect(shouldRegisterPushToken({ userId: "student-1", token: "fcm-token-b" })).toBe(true);
    markPushTokenRegistered("student-1", "fcm-token-b");
    expect(shouldRegisterPushToken({ userId: "student-1", token: "fcm-token-b" })).toBe(false);

    // Account switch on the same browser with same device token triggers re-registration
    expect(shouldRegisterPushToken({ userId: "student-2", token: "fcm-token-b" })).toBe(true);
    markPushTokenRegistered("student-2", "fcm-token-b");
    expect(shouldRegisterPushToken({ userId: "student-2", token: "fcm-token-b" })).toBe(false);

    // Sign-out resets identity so subsequent login registers cleanly
    clearRegisteredPushTokenIdentity();
    expect(shouldRegisterPushToken({ userId: "student-2", token: "fcm-token-b" })).toBe(true);
  });

  test("POST success deduplicates, failures retry, and stale completions cannot mark identity", async () => {
    let requests = 0;
    let ok = false;
    let current = true;
    globalThis.fetch = Object.assign(async () => {
      requests++;
      return new Response("", { status: ok ? 200 : 503 });
    }, originalFetch);
    expect(await registerTokenToServer("token", "a")).toBe(false);
    ok = true;
    expect(await registerTokenToServer("token", "a")).toBe(true);
    expect(await registerTokenToServer("token", "a")).toBe(true);
    expect(requests).toBe(2);
    expect(await registerTokenToServer("token", "b")).toBe(true);
    expect(requests).toBe(3);
    clearRegisteredPushTokenIdentity();
    globalThis.fetch = Object.assign(async () => {
      requests++;
      current = false;
      return new Response("");
    }, originalFetch);
    await registerTokenToServer("token", "a", () => current);
    expect(shouldRegisterPushToken({ userId: "a", token: "token" })).toBe(true);
    expect(await registerTokenToServer("token", "a", () => current)).toBe(false);
    expect(requests).toBe(4);
  });

  test("server calls never store identity or POST", async () => {
    Reflect.deleteProperty(globalThis, "window");
    markPushTokenRegistered("a", "token");
    expect(await registerTokenToServer("token", "a")).toBe(false);
    Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
    expect(shouldRegisterPushToken({ userId: "a", token: "token" })).toBe(true);
  });

  test("returns unavailable/no-op without throwing when public Firebase config is missing", async () => {
    const prevProjectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
    try {
      delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
      expect(isFirebaseMessagingConfigured()).toBe(false);
      expect(await getFCMToken()).toBeNull();

      const unsubscribe = onForegroundMessage(() => {});
      expect(typeof unsubscribe).toBe("function");
      expect(() => unsubscribe()).not.toThrow();
    } finally {
      if (prevProjectId !== undefined) {
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = prevProjectId;
      }
    }
  });

  test("PushPermissionInit separates granted token registration from pathname prompt scheduling and preserves admin gating", async () => {
    const pushSource = await Bun.file(
      new URL("../../components/notifications/push-permission-init.tsx", import.meta.url)
    ).text();

    // Granted token registration effect does not depend on pathname
    expect(pushSource).toContain("}, [isPending, userId, isAdminSurface, syncGrantedTokenForUser]);");
    // Prompt scheduling effect retains pathname and admin surface gating
    expect(pushSource).toContain("}, [isPending, userId, isAdminSurface, pathname]);");
    expect(pushSource).toContain('pathname.startsWith("/admin") || userRole === "admin"');
    // Does not use coarse global sessionStorage flags
    expect(pushSource).not.toContain("sessionStorage");
  });

  test("AdminFormsBuilder defers initial forms list fetch until forms tab is active and guards against empty-list loops", async () => {
    const formsSource = await Bun.file(
      new URL("../../components/forms/admin-forms-builder.tsx", import.meta.url)
    ).text();

    expect(formsSource).toContain('if (activeTab !== "forms" || hasLoadedForms) return;');
    expect(formsSource).toContain("setHasLoadedForms(true);");
    expect(formsSource).toContain("}, [activeTab, hasLoadedForms, fetchForms]);");
  });
});
