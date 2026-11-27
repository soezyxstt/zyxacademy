import { afterEach, describe, expect, test } from "bun:test";
import {
  requestUnifiedNotificationPermission,
  type UnifiedNotificationDeliveryStatus,
  type UnifiedNotificationPermission,
} from "@/lib/native/notifications";
import {
  deferTourNotifications,
  runTourNotificationSetup,
  type TourNotificationBridge,
  type TourNotificationState,
} from "@/lib/onboarding/tour-notifications";

function status(overrides: Partial<UnifiedNotificationDeliveryStatus> = {}): UnifiedNotificationDeliveryStatus {
  return {
    platform: "web", transport: "webpush", osPermission: "granted",
    registered: true, transportActive: true, deliveryReadiness: "ready", ...overrides,
  };
}

function fixture(overrides: Partial<TourNotificationBridge> = {}) {
  const calls: string[] = [];
  const states: TourNotificationState[] = [];
  const bridge: TourNotificationBridge = {
    requestPermission: async () => { calls.push("permission"); return "granted"; },
    registerToken: async (userId, isCurrent) => { calls.push(`register:${userId}`); return isCurrent(); },
    readStatus: async () => { calls.push("status"); return status(); },
    ...overrides,
  };
  return { calls, states, bridge, userId: "student-a", isCurrent: () => true, onState: (value: TourNotificationState) => states.push(value) };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("tour notification setup", () => {
  test("Enable requests permission in its click stack, then registers before reporting ready", async () => {
    const input = fixture();
    const pending = runTourNotificationSetup({ action: "enable", ...input });
    expect(input.calls).toEqual(["permission"]);
    expect(input.states).toEqual(["requesting"]);
    expect(await pending).toBe("ready");
    expect(input.calls).toEqual(["permission", "register:student-a", "status"]);
    expect(input.states).toEqual(["requesting", "registering", "ready"]);
  });

  test("opening or rechecking the step never asks for permission", async () => {
    const input = fixture({ readStatus: async () => status({ osPermission: "prompt", registered: false, deliveryReadiness: "permission_required" }) });
    expect(await runTourNotificationSetup({ action: "recheck", ...input })).toBe("permission_required");
    expect(input.calls).toEqual([]);
    expect(input.states).toEqual(["checking", "permission_required"]);
  });

  test("an existing permission still registers this device before showing ready", async () => {
    const input = fixture();
    expect(await runTourNotificationSetup({ action: "recheck", ...input })).toBe("ready");
    expect(input.calls).toEqual(["status", "register:student-a", "status"]);
    expect(input.states).toEqual(["checking", "registering", "ready"]);
  });

  test("denied, dismissed and unsupported permission outcomes never register a token", async () => {
    for (const [permission, result] of [["denied", "denied"], ["default", "permission_required"], ["unsupported", "unsupported"]] as const) {
      const input = fixture({ requestPermission: async () => permission });
      expect(await runTourNotificationSetup({ action: "enable", ...input })).toBe(result);
      expect(input.calls).toEqual([]);
      expect(input.states).toEqual(["requesting", result]);
    }
  });

  test("permission-only and inactive transport results cannot claim delivery readiness", async () => {
    const unregistered = fixture({ registerToken: async () => false });
    expect(await runTourNotificationSetup({ action: "enable", ...unregistered })).toBe("registration_failed");
    expect(unregistered.calls).toEqual(["permission"]);
    expect(unregistered.states).not.toContain("ready");
    const inactive = fixture({ readStatus: async () => status({ transportActive: false, deliveryReadiness: "transport_inactive" }) });
    expect(await runTourNotificationSetup({ action: "enable", ...inactive })).toBe("transport_inactive");
    expect(inactive.states).not.toContain("ready");
  });

  test("a failed registration can retry without accepting a false ready result", async () => {
    let attempts = 0;
    const input = fixture({ registerToken: async () => ++attempts > 1 });
    expect(await runTourNotificationSetup({ action: "enable", ...input })).toBe("registration_failed");
    expect(await runTourNotificationSetup({ action: "enable", ...input })).toBe("ready");
    expect(attempts).toBe(2);
  });

  test("switching accounts or unmounting during the native prompt discards its result", async () => {
    const permission = deferred<UnifiedNotificationPermission>();
    let current = true;
    const input = fixture({ requestPermission: () => permission.promise });
    const pending = runTourNotificationSetup({ action: "enable", ...input, isCurrent: () => current });
    current = false;
    permission.resolve("granted");
    expect(await pending).toBeNull();
    expect(input.calls).toEqual([]);
    expect(input.states).toEqual(["requesting"]);
  });

  test("a pending registration receives the same account guard and cannot publish after a switch", async () => {
    const registration = deferred<boolean>();
    let current = true;
    let registrationGuard: (() => boolean) | undefined;
    const input = fixture({ registerToken: (_userId, guard) => { registrationGuard = guard; return registration.promise; } });
    const pending = runTourNotificationSetup({ action: "enable", ...input, isCurrent: () => current });
    await Promise.resolve();
    expect(registrationGuard?.()).toBe(true);
    current = false;
    expect(registrationGuard?.()).toBe(false);
    registration.resolve(true);
    expect(await pending).toBeNull();
    expect(input.calls).toEqual(["permission"]);
    expect(input.states).toEqual(["requesting", "registering"]);
  });

  test("request and registration errors keep a retryable state without leaking an exception", async () => {
    const request = fixture({ requestPermission: async () => { throw new Error("native request unavailable"); } });
    expect(await runTourNotificationSetup({ action: "enable", ...request })).toBe("request_failed");
    const registration = fixture({ registerToken: async () => { throw new Error("offline"); } });
    expect(await runTourNotificationSetup({ action: "enable", ...registration })).toBe("registration_failed");
    const stale = fixture();
    expect(await runTourNotificationSetup({ action: "enable", ...stale, isCurrent: () => false })).toBeNull();
    expect(stale.calls).toEqual([]);
    expect(stale.states).toEqual([]);
  });

  test("Skip stores the existing cooldown and survives restricted browser storage", () => {
    const saved = new Map<string, string>();
    deferTourNotifications({ setItem: (key, value) => { saved.set(key, value); } }, 1_800_000_000_000);
    expect(Object.fromEntries(saved)).toEqual({ fcm_consent: "later", fcm_later_at: "1800000000000" });
    expect(() => deferTourNotifications({ setItem: () => { throw new Error("storage denied"); } })).not.toThrow();
  });
});

describe("real notification permission bridge dispatch", () => {
  const savedWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const savedNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const replaceGlobal = (name: "window" | "navigator", value: unknown) => {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  };
  afterEach(() => {
    for (const [name, descriptor] of [["window", savedWindow], ["navigator", savedNavigator]] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });

  test("web requests directly while the originating gesture is still active", async () => {
    let gesture = true;
    let requestedWithGesture = false;
    replaceGlobal("window", { Notification: {
      permission: "default",
      requestPermission: () => { requestedWithGesture = gesture; return Promise.resolve("granted"); },
    } });
    replaceGlobal("navigator", { serviceWorker: {} });
    const pending = requestUnifiedNotificationPermission();
    gesture = false;
    expect(requestedWithGesture).toBe(true);
    expect(await pending).toBe("granted");
  });

  test("web respects existing decisions and does not prompt an unsupported browser", async () => {
    let requests = 0;
    for (const permission of ["granted", "denied"] as const) {
      replaceGlobal("window", { Notification: { permission, requestPermission: () => { requests++; return Promise.resolve("granted"); } } });
      replaceGlobal("navigator", { serviceWorker: {} });
      expect(await requestUnifiedNotificationPermission()).toBe(permission);
    }
    replaceGlobal("navigator", {});
    expect(await requestUnifiedNotificationPermission()).toBe("unsupported");
    expect(requests).toBe(0);
  });

  test("Android and iOS ask the native display permission instead of the WebView API", async () => {
    for (const platform of ["android", "ios"] as const) {
      const calls: string[] = [];
      replaceGlobal("window", {
        Notification: { requestPermission: () => { calls.push("web"); return Promise.resolve("granted"); } },
        Capacitor: { isNativePlatform: () => true, getPlatform: () => platform, Plugins: {
          LocalNotifications: { requestPermissions: async () => { calls.push("local"); return { display: "granted" }; } },
          PushNotifications: { requestPermissions: async () => { calls.push("push"); return { receive: "granted" }; } },
        } },
      });
      expect(await requestUnifiedNotificationPermission()).toBe("granted");
      expect(calls).toEqual(["local"]);
    }
  });

  test("Capacitor falls back to native push permission when the local plugin is unavailable", async () => {
    const calls: string[] = [];
    replaceGlobal("window", { Capacitor: { isNativePlatform: () => true, getPlatform: () => "android", Plugins: {
      LocalNotifications: { requestPermissions: async () => { calls.push("local"); throw new Error("plugin unavailable"); } },
      PushNotifications: { requestPermissions: async () => { calls.push("push"); return { receive: "denied" }; } },
    } } });
    expect(await requestUnifiedNotificationPermission()).toBe("denied");
    expect(calls).toEqual(["local", "push"]);
  });

  test("Tauri requests the native permission even when its WebView reports denied", async () => {
    const commands: string[] = [];
    replaceGlobal("window", {
      Notification: { permission: "denied", requestPermission: () => { throw new Error("must use the native plugin"); } },
      __TAURI__: { core: { invoke: async (command: string) => { commands.push(command); return "granted"; } } },
    });
    expect(await requestUnifiedNotificationPermission()).toBe("granted");
    expect(commands).toEqual(["plugin:notification|request_permission"]);
  });
});
