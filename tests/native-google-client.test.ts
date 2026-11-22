import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { AccountSwitchError } from "@/lib/auth/account-switch-contract";
import { runAccountTransition, type AccountTransitionDependencies } from "@/lib/auth/account-transition";
import { isAccountTransitionPending, setAccountTransitionPending } from "@/lib/auth/account-transition-state";
import type { CapacitorGlobal } from "@/lib/native/runtime";

const calls: string[] = [];
let transitionImpl: (operation: () => Promise<string>) => Promise<string> = operation => operation();
const assertCanAddAccount = mock(async () => { calls.push("check-limit"); });
const withAccountTransition = mock(async (operation: () => Promise<string>) => {
  calls.push("transition");
  return transitionImpl(operation);
});
mock.module("@/lib/auth/account-switch", () => ({ assertCanAddAccount, withAccountTransition, AccountSwitchError }));
const { startNativeGoogleSignIn, NativeGoogleSignInError } = await import("@/lib/native/auth");

const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const oldNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
const oldFetch = globalThis.fetch;
let picker: (options: { serverClientId: string; nonce: string }) => Promise<{ idToken: string }>;
let platform: string;
let closed: number;
let browserUrls: string[];
let navigations: string[];
let storage: Map<string, string>;
let verifyFailure: string | null;
let capacitor: CapacitorGlobal;

beforeEach(() => {
  calls.length = 0;
  assertCanAddAccount.mockClear();
  withAccountTransition.mockClear();
  transitionImpl = operation => operation();
  verifyFailure = null;
  platform = "android";
  closed = 0;
  browserUrls = [];
  navigations = [];
  storage = new Map();
  picker = async ({ serverClientId, nonce }) => {
    expect(capacitor.isLoggingEnabled).toBe(false);
    expect(serverClientId).toBe("public-client.apps.googleusercontent.com");
    expect(nonce).toBe("a".repeat(43));
    calls.push("picker");
    return { idToken: "google-token-test-only" };
  };
  capacitor = {
    isLoggingEnabled: true,
    isNativePlatform: () => true,
    getPlatform: () => platform,
    Plugins: {
      ZyxGoogleAuth: { signIn: options => picker(options) },
      Browser: { open: async ({ url }) => { browserUrls.push(url); } },
    },
  };
  Object.defineProperty(globalThis, "window", { configurable: true, value: {
    Capacitor: capacitor,
    location: { hostname: "staging.zyxacademy.com", origin: "https://staging.zyxacademy.com", replace: (url: string) => navigations.push(url) },
    sessionStorage: { setItem: (key: string, value: string) => storage.set(key, value) },
  } });
  Object.defineProperty(globalThis, "navigator", { configurable: true, value: { userAgent: "Zyx Nightly Android", onLine: true } });
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { action: string; idToken?: string };
    calls.push(body.action);
    if (body.action === "challenge") return Response.json({ clientId: "public-client.apps.googleusercontent.com", nonce: "a".repeat(43) });
    if (body.action === "verify") {
      expect(body.idToken).toBe("google-token-test-only");
      if (verifyFailure) return Response.json({ code: verifyFailure }, { status: 401 });
      return Response.json({ userId: "user-b" });
    }
    return Response.json({ cancelled: true });
  }) as typeof fetch;
});

afterEach(() => {
  setAccountTransitionPending(false);
  globalThis.fetch = oldFetch;
  if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
  else Reflect.deleteProperty(globalThis, "window");
  if (oldNavigator) Object.defineProperty(globalThis, "navigator", oldNavigator);
  else Reflect.deleteProperty(globalThis, "navigator");
});

function transitionDependencies(): AccountTransitionDependencies {
  return {
    isOnline: () => true,
    hasPendingChanges: () => false,
    currentUserId: async () => "user-a",
    rememberCurrent: async () => {},
    cancelRequests: async () => {},
    detachPush: async () => async () => { calls.push("restore-push"); },
    commit: async () => { calls.push("commit"); },
    resume: () => { calls.push("resume"); },
    reload: () => { calls.push("reload"); },
  };
}

describe("native Google picker orchestration", () => {
  test("verifies the selected identity inside the transition guard, then navigates", async () => {
    expect(await startNativeGoogleSignIn("/dashboard")).toBe(true);
    expect(calls).toEqual(["check-limit", "challenge", "picker", "transition", "verify"]);
    expect(navigations).toEqual(["/dashboard"]);
    expect(browserUrls).toEqual([]);
    expect(storage.size).toBe(0);
    expect(capacitor.isLoggingEnabled).toBe(true);
  });

  test("cancellation preserves the active session and does not open a browser", async () => {
    picker = async () => { throw { code: "CANCELLED" }; };
    expect(await startNativeGoogleSignIn("/dashboard", { onBrowserClosed: () => { closed++; } })).toBe(true);
    expect(calls).toEqual(["check-limit", "challenge", "cancel"]);
    expect(withAccountTransition).not.toHaveBeenCalled();
    expect(closed).toBe(1);
    expect(capacitor.isLoggingEnabled).toBe(true);
    expect(browserUrls).toEqual([]);
    expect(navigations).toEqual([]);
  });

  test("provider failure stays visible instead of silently opening browser login", async () => {
    picker = async () => { throw { code: "NATIVE_GOOGLE_FAILED" }; };
    await expect(startNativeGoogleSignIn("/dashboard")).rejects.toBeInstanceOf(NativeGoogleSignInError);
    expect(withAccountTransition).not.toHaveBeenCalled();
    expect(browserUrls).toEqual([]);
    expect(navigations).toEqual([]);
  });

  test("verification recovery remains available after the real guard confirms rollback", async () => {
    verifyFailure = "CHALLENGE_EXPIRED";
    transitionImpl = operation => runAccountTransition(operation, transitionDependencies());
    await expect(startNativeGoogleSignIn()).rejects.toMatchObject({ name: "NativeGoogleSignInError", code: "CHALLENGE_EXPIRED" });
    expect(calls).toContain("restore-push");
    expect(calls).toContain("resume");
    expect(calls).not.toContain("commit");
    expect(isAccountTransitionPending()).toBe(false);
    expect(browserUrls).toEqual([]);
  });

  test("uncertain session state keeps the guard paused instead of offering browser recovery", async () => {
    verifyFailure = "SIGN_IN_FAILED";
    let reads = 0;
    transitionImpl = operation => runAccountTransition(operation, {
      ...transitionDependencies(),
      currentUserId: async () => {
        if (++reads > 1) throw new Error("network-unavailable");
        return "user-a";
      },
    });
    await expect(startNativeGoogleSignIn()).rejects.toBeInstanceOf(AccountSwitchError);
    expect(calls).toContain("reload");
    expect(calls).not.toContain("restore-push");
    expect(isAccountTransitionPending()).toBe(true);
    expect(browserUrls).toEqual([]);
  });

  test("an unavailable native provider falls back to the existing browser handoff", async () => {
    picker = async () => { throw { code: "UNAVAILABLE" }; };
    expect(await startNativeGoogleSignIn("/dashboard")).toBe(true);
    expect(browserUrls).toHaveLength(1);
    expect(new URL(browserUrls[0]).pathname).toBe("/api/auth/native/start");
    expect(withAccountTransition).not.toHaveBeenCalled();
    expect(navigations).toEqual([]);
  });

  test("explicit browser recovery bypasses the picker and challenge", async () => {
    expect(await startNativeGoogleSignIn("/dashboard", { preferBrowser: true })).toBe(true);
    expect(calls).toEqual(["check-limit"]);
    expect(browserUrls).toHaveLength(1);
  });

  test("iOS retains system browser login", async () => {
    platform = "ios";
    expect(await startNativeGoogleSignIn("/dashboard")).toBe(true);
    expect(calls).toEqual(["check-limit"]);
    expect(browserUrls).toHaveLength(1);
  });
});
