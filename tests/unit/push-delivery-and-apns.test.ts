import { afterEach, describe, expect, test } from "bun:test";
import { createVerify, generateKeyPairSync } from "node:crypto";
import {
  buildApnsPayload,
  createApnsJwt,
  getApnsConfig,
  isApnsConfigured,
  normalizeApnsPrivateKey,
  resetApnsJwtCacheForTests,
  sendApnsNotifications,
} from "@/lib/notifications/apns";
import { dispatchTokensByTransport } from "@/lib/notifications/dispatch";
import {
  evaluateDeliveryReadiness,
  inferPlatformAndTransport,
  isValidPushTokenForTransport,
  normalizeOsPermissionStatus,
} from "@/lib/notifications/transport";
import {
  getUnifiedNotificationDeliveryStatus,
  registerUnifiedPushToken,
  startDesktopNotificationBridge,
  getUnifiedNotificationPermission,
  sendDesktopNativeNotification,
  unregisterCurrentPushToken,
} from "@/lib/native/notifications";

function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

describe("push transport classification and readiness", () => {
  test("infers platform and transport without misclassifying iOS APNs or desktop as FCM", () => {
    expect(inferPlatformAndTransport({ device: "capacitor-ios" })).toEqual({
      platform: "ios",
      transport: "apns",
    });
    expect(inferPlatformAndTransport({ device: "capacitor-android" })).toEqual({
      platform: "android",
      transport: "fcm",
    });
    expect(inferPlatformAndTransport({ device: "tauri-windows" })).toEqual({
      platform: "desktop",
      transport: "desktop",
    });
    expect(inferPlatformAndTransport({ device: "Mozilla/5.0 Chrome" })).toEqual({
      platform: "web",
      transport: "webpush",
    });
    expect(inferPlatformAndTransport({ platform: "desktop", transport: "fcm" })).toEqual({
      platform: "desktop",
      transport: "desktop",
    });
    expect(inferPlatformAndTransport({ platform: "ios", transport: "fcm" })).toEqual({
      platform: "ios",
      transport: "apns",
    });
  });

  test("validates token formats per transport including 64-char hex APNs tokens and desktop IDs", () => {
    const validApns = "a1b2c3d4".repeat(8); // 64 hex chars
    const validFcm = "f".repeat(120);
    const validDesktop = "desktop:abc123def4567890";

    expect(isValidPushTokenForTransport(validApns, "apns")).toBe(true);
    expect(isValidPushTokenForTransport("not-hex-token", "apns")).toBe(false);
    expect(isValidPushTokenForTransport("short", "apns")).toBe(false);

    expect(isValidPushTokenForTransport(validDesktop, "desktop")).toBe(true);
    expect(isValidPushTokenForTransport("web-token-without-prefix", "desktop")).toBe(false);

    expect(isValidPushTokenForTransport(validFcm, "fcm")).toBe(true);
    expect(isValidPushTokenForTransport(validFcm, "webpush")).toBe(true);
    expect(isValidPushTokenForTransport("too-short", "fcm")).toBe(false);
  });

  test("distinguishes OS permission from delivery readiness", () => {
    expect(normalizeOsPermissionStatus("default")).toBe("prompt");
    expect(normalizeOsPermissionStatus("granted")).toBe("granted");

    expect(
      evaluateDeliveryReadiness({
        osPermission: "granted",
        registered: true,
        transportActive: true,
      }),
    ).toBe("ready");

    expect(
      evaluateDeliveryReadiness({
        osPermission: "granted",
        registered: false,
        transportActive: true,
      }),
    ).toBe("unregistered");

    expect(
      evaluateDeliveryReadiness({
        osPermission: "granted",
        registered: true,
        transportActive: false,
      }),
    ).toBe("transport_inactive");

    expect(
      evaluateDeliveryReadiness({
        osPermission: "prompt",
        registered: false,
        transportActive: true,
      }),
    ).toBe("permission_required");

    expect(
      evaluateDeliveryReadiness({
        osPermission: "denied",
        registered: true,
        transportActive: true,
      }),
    ).toBe("permission_denied");
  });
});

describe("APNs HTTP/2 JWT transport", () => {
  afterEach(() => {
    resetApnsJwtCacheForTests();
  });

  test("reports unconfigured honestly when env vars are missing", async () => {
    expect(isApnsConfigured({})).toBe(false);
    expect(getApnsConfig({ APNS_KEY_ID: "KEY1234567" })).toBeNull();

    const result = await sendApnsNotifications(
      ["a1b2c3d4".repeat(8)],
      { title: "Quiz ready", body: "New quiz published", type: "quiz_published" },
      { config: null },
    );
    expect(result.succeeded).toBe(0);
    expect(result.failedTokens).toEqual([]);
    expect(result.errors).toEqual(["APNs transport is not configured"]);
  });

  test("signs verifiable ES256 JWT and dispatches APNs payloads with token pruning", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", {
      namedCurve: "P-256",
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });

    const base64Key = Buffer.from(privateKey, "utf8").toString("base64");
    expect(normalizeApnsPrivateKey(base64Key)).toContain("BEGIN PRIVATE KEY");

    const config = getApnsConfig({
      APNS_KEY_ID: "ABC1234567",
      APNS_TEAM_ID: "TEAM987654",
      APNS_PRIVATE_KEY: base64Key,
      APNS_BUNDLE_ID: "com.zyx.academy",
      APNS_USE_SANDBOX: "1",
    });
    expect(config).not.toBeNull();

    const jwt = createApnsJwt(config!, 1_700_000_000);
    const [encodedHeader, encodedPayload, encodedSig] = jwt.split(".");
    expect(JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"))).toEqual({
      alg: "ES256",
      kid: "ABC1234567",
    });
    expect(JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"))).toEqual({
      iss: "TEAM987654",
      iat: 1_700_000_000,
    });

    const joseSig = Buffer.from(encodedSig, "base64url");
    expect(joseSig.length).toBe(64);

    // Convert 64-byte IEEE P1363 signature (r || s) back to ASN.1 DER to verify cryptographically
    const encodeDerInt = (buf: Buffer): Buffer => {
      let i = 0;
      while (i < buf.length - 1 && buf[i] === 0) i += 1;
      let trimmed = buf.subarray(i);
      if (trimmed[0] & 0x80) {
        trimmed = Buffer.concat([Buffer.from([0x00]), trimmed]);
      }
      return Buffer.concat([Buffer.from([0x02, trimmed.length]), trimmed]);
    };
    const rDer = encodeDerInt(joseSig.subarray(0, 32));
    const sDer = encodeDerInt(joseSig.subarray(32, 64));
    const derSig = Buffer.concat([Buffer.from([0x30, rDer.length + sDer.length]), rDer, sDer]);

    const verifier = createVerify("SHA256");
    verifier.update(`${encodedHeader}.${encodedPayload}`);
    verifier.end();
    const verified = verifier.verify(publicKey, derSig);
    expect(verified).toBe(true);

    const apnsPayload = buildApnsPayload({
      title: "New quiz",
      body: "Math quiz is open",
      type: "quiz_published",
      link: "/courses/math",
      metadata: {
        aps: "should-not-clobber",
        type: "fake",
        url: "/evil",
        quizId: "q-1",
      },
    });
    expect(apnsPayload).toMatchObject({
      aps: { alert: { title: "New quiz", body: "Math quiz is open" }, sound: "default" },
      type: "quiz_published",
      url: "/courses/math",
      quizId: "q-1",
    });

    const requests: Array<{ host: string; deviceToken: string; bundleId: string }> = [];
    const okToken = "11111111".repeat(8);
    const deadToken = "22222222".repeat(8);
    const transientToken = "33333333".repeat(8);

    const res = await sendApnsNotifications(
      [okToken, deadToken, transientToken],
      { title: "New quiz", body: "Math quiz is open", type: "quiz_published" },
      {
        config,
        nowSeconds: 1_700_000_000,
        sendRequest: async (input) => {
          requests.push({
            host: input.host,
            deviceToken: input.deviceToken,
            bundleId: input.bundleId,
          });
          if (input.deviceToken === okToken) return { status: 200 };
          if (input.deviceToken === deadToken) return { status: 410, reason: "Unregistered" };
          return { status: 503, reason: "ServiceUnavailable" };
        },
      },
    );

    expect(requests).toHaveLength(3);
    expect(requests[0].host).toBe("https://api.sandbox.push.apple.com");
    expect(requests[0].bundleId).toBe("com.zyx.academy");
    expect(res.succeeded).toBe(1);
    expect(res.failedTokens).toEqual([deadToken]);
    expect(res.errors).toHaveLength(1);
  });
});

describe("platform-aware dispatch", () => {
  test("routes FCM/webpush to FCM, iOS APNs only to APNs, and keeps desktop on inbox bridge", async () => {
    const fcmSent: string[] = [];
    const apnsSent: string[] = [];

    const result = await dispatchTokensByTransport(
      [
        { token: "android-fcm-token", transport: "fcm" },
        { token: "web-push-token", transport: "webpush" },
        { token: "a1b2c3d4".repeat(8), transport: "apns" },
        { token: "desktop:win-client-1234", transport: "desktop" },
      ],
      { title: "Reminder", body: "Session starts soon", type: "tutor_reminder" },
      {
        sendFcm: async (tokens) => {
          fcmSent.push(...tokens);
          return { succeeded: tokens.length, failedTokens: [], errors: [] };
        },
        sendApns: async (tokens) => {
          apnsSent.push(...tokens);
          return { succeeded: tokens.length, failedTokens: [], errors: [] };
        },
      },
    );

    expect(fcmSent).toEqual(["android-fcm-token", "web-push-token"]);
    expect(apnsSent).toEqual(["a1b2c3d4".repeat(8)]);
    expect(result).toEqual({
      attempted: 4,
      succeeded: 4,
      failedTokens: [],
      errors: [],
    });
  });
});

describe("iOS registration, desktop notification bridge, and honest client readiness", () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      globalThis.window = originalWindow;
    }
    globalThis.fetch = originalFetch;
  });

  test("registers iOS APNs token with platform=ios and transport=apns", async () => {
    const apnsToken = "abcdef01".repeat(8);
    const postedBodies: Record<string, unknown>[] = [];

    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      postedBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          success: true,
          registered: true,
          platform: "ios",
          transport: "apns",
          transportActive: false,
          readiness: "transport_inactive",
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    let registrationHandler: ((ev: Record<string, unknown>) => void) | null = null;
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      localStorage: makeMemoryStorage(),
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "ios",
        Plugins: {
          PushNotifications: {
            checkPermissions: async () => ({ receive: "granted" }),
            requestPermissions: async () => ({ receive: "granted" }),
            addListener: async (eventName: string, fn: (ev: Record<string, unknown>) => void) => {
              if (eventName === "registration") registrationHandler = fn;
              return { remove: async () => {} };
            },
            register: async () => {
              registrationHandler?.({ value: apnsToken });
            },
          },
        },
      },
    };

    const ok = await registerUnifiedPushToken("ios-user-1", () => true);
    expect(ok).toBe(true);
    expect(postedBodies).toHaveLength(1);
    expect(postedBodies[0]).toEqual({
      token: apnsToken,
      device: "capacitor-ios",
      platform: "ios",
      transport: "apns",
    });

    // Unregistering on logout calls DELETE /api/notifications/register-token with the current token
    const deleteCalls: Array<{ method?: string; body: Record<string, unknown> }> = [];
    await unregisterCurrentPushToken((async (_url: unknown, init?: RequestInit) => {
      deleteCalls.push({
        method: init?.method,
        body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }) as unknown as typeof fetch);
    expect(deleteCalls).toEqual([{ method: "DELETE", body: { token: apnsToken } }]);

    // Now verify getUnifiedNotificationDeliveryStatus reports granted permission
    // separately from transport_inactive readiness when server APNs is unconfigured.
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          registered: true,
          devices: [],
          transports: {
            fcm: { configured: true, registeredCount: 0, active: false },
            apns: { configured: false, registeredCount: 1, active: false },
            webpush: { configured: true, registeredCount: 0, active: false },
            desktop: { configured: true, registeredCount: 0, active: false },
          },
        }),
        { status: 200 },
      )) as unknown as typeof fetch;

    const status = await getUnifiedNotificationDeliveryStatus();
    expect(status).toEqual({
      osPermission: "granted",
      deliveryReadiness: "transport_inactive",
      platform: "ios",
      transport: "apns",
      registered: true,
      transportActive: false,
    });
  });

  test("uses the Tauri-injected desktop Notification API without mobile IPC", async () => {
    const sent: Array<{ title: string; body?: string }> = [];
    class DesktopNotification {
      static permission = "granted";
      constructor(title: string, options: { body?: string }) {
        sent.push({ title, body: options.body });
      }
    }
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      __TAURI__: { core: { invoke: async (command: string) => { throw new Error(`Command ${command} not found`); } } },
      Notification: DesktopNotification,
    };
    expect(await getUnifiedNotificationPermission()).toBe("granted");
    expect(await sendDesktopNativeNotification("Desktop alert", "Delivered")).toBe(true);
    expect(await sendDesktopNativeNotification("Stale account", "Must not show", () => false)).toBe(false);
    expect(sent).toEqual([{ title: "Desktop alert", body: "Delivered" }]);
  });

  test("trusts native permission instead of the Windows WebView shim and awaits native delivery", async () => {
    const calls: string[] = [];
    let nativeAllowed = true;
    let osFails = false;
    class DeniedNotification {
      static permission = "denied";
      constructor() { throw new Error("WebView fallback must not run"); }
    }
    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      __TAURI__: { core: { invoke: async (command: string) => {
        calls.push(command);
        if (command === "plugin:notification|is_permission_granted") return nativeAllowed;
        if (command === "show_desktop_notification") {
          if (osFails) throw new Error("DESKTOP_NOTIFICATION_OS_ERROR");
          return true;
        }
        throw new Error("Unexpected fallback");
      } } },
      Notification: DeniedNotification,
    };
    expect(await getUnifiedNotificationPermission()).toBe("granted");
    expect(await sendDesktopNativeNotification("Native test", "Body")).toBe(true);
    osFails = true;
    expect(await sendDesktopNativeNotification("Native error", "Body")).toBe(false);
    expect(calls.filter(command => command === "show_desktop_notification")).toHaveLength(2);
    expect(calls).not.toContain("plugin:notification|notify");
    nativeAllowed = false;
    expect(await sendDesktopNativeNotification("Permission denied")).toBe(false);
    expect(calls.filter(command => command === "show_desktop_notification")).toHaveLength(2);
  });

  test("never displays a different account's inbox after session recovery", async () => {
    let attempts = 0;
    const displayed: string[] = [];
    const stop = startDesktopNotificationBridge({ onForeground: event => {
      if (event.notificationId) displayed.push(event.notificationId);
    } }, {
      pollIntervalMs: 15,
      userId: "current-user",
      fetchImpl: (async () => {
        attempts += 1;
        const notifications = attempts === 1 ? [] : attempts === 2 ? [
          { id: "other", userId: "other-user", title: "Other account", createdAt: "2026-11-21T11:00:00.000Z" },
        ] : [
          { id: "own", userId: "current-user", title: "Own account", createdAt: "2026-11-21T10:00:00.000Z" },
        ];
        return new Response(JSON.stringify({ notifications }), { status: 200 });
      }) as typeof fetch,
      sendNative: async () => {},
    });
    await new Promise(resolve => setTimeout(resolve, 90));
    stop();
    expect(displayed).toEqual(["own"]);
  });

  test("recovers when a desktop inbox request stalls", async () => {
    let attempts = 0;
    let aborted = false;
    const stop = startDesktopNotificationBridge({ onForeground: () => {} }, {
      pollIntervalMs: 15,
      requestTimeoutMs: 10,
      fetchImpl: (async (_url: unknown, init?: RequestInit) => {
        attempts += 1;
        if (attempts === 1) return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true;
            reject(new Error("Request aborted"));
          }, { once: true });
        });
        return new Response(JSON.stringify({ notifications: [] }), { status: 200 });
      }) as typeof fetch,
    });
    await new Promise(resolve => setTimeout(resolve, 80));
    stop();
    expect(aborted).toBe(true);
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  test("registers Tauri desktop token and delivers new inbox notifications to native OS", async () => {
    const postedBodies: Record<string, unknown>[] = [];

    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      postedBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          success: true,
          registered: true,
          platform: "desktop",
          transport: "desktop",
          transportActive: true,
          readiness: "ready",
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      localStorage: makeMemoryStorage(),
      addEventListener: () => {},
      removeEventListener: () => {},
      __TAURI__: {
        notification: {
          isPermissionGranted: async () => true,
        },
      },
    };

    const ok = await registerUnifiedPushToken("desktop-user-1", () => true);
    expect(ok).toBe(true);
    expect(postedBodies).toHaveLength(1);
    expect(postedBodies[0].platform).toBe("desktop");
    expect(postedBodies[0].transport).toBe("desktop");
    expect(String(postedBodies[0].token ?? "")).toStartWith("desktop:");

    // Test desktop inbox bridge polling: first poll seeds existing IDs without firing,
    // second poll fires native notification + foreground handler for new arrival.
    const nativeCalls: Array<{ title: string; body?: string }> = [];
    const foregroundCalls: Array<{ notificationId?: string; title?: string; body?: string; url?: string }> = [];
    let pollCount = 0;
    const queries: URLSearchParams[] = [];

    const fakeFetch = (async (url: unknown) => {
      const query = new URL(String(url), "https://example.test").searchParams;
      queries.push(query);
      pollCount += 1;
      if (pollCount === 1) {
        return new Response(
          JSON.stringify({
            notifications: [
              {
                id: "old-1",
                title: "Old alert",
                body: "Already seen",
                createdAt: "2026-11-21T10:00:00.000Z",
              },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          notifications: [
            {
              id: "new-2",
              title: "New quiz",
              body: "Calculus quiz is open",
              read: true,
              createdAt: "2026-11-21T10:05:00.000Z",
              metadata: { url: "/courses/calc" },
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const stop = startDesktopNotificationBridge(
      {
        onForeground: (event) => foregroundCalls.push(event),
      },
      {
        pollIntervalMs: 25,
        fetchImpl: fakeFetch,
        sendNative: async (title, body) => {
          nativeCalls.push({ title, body });
        },
      },
    );

    await new Promise((resolve) => setTimeout(resolve, 90));
    stop();

    expect(pollCount).toBeGreaterThanOrEqual(2);
    expect(queries.every(query => !query.has("unreadOnly"))).toBe(true);
    expect(foregroundCalls).toEqual([
      { notificationId: "new-2", title: "New quiz", body: "Calculus quiz is open", url: "/courses/calc" },
    ]);
    expect(nativeCalls).toEqual([{ title: "New quiz", body: "Calculus quiz is open" }]);

    // An expired session is retried without replaying old inbox history or
    // relying on the local clock when the first successful inbox is empty.
    let unauthPolls = 0;
    const recovered: string[] = [];
    const stopUnauth = startDesktopNotificationBridge(
      { onForeground: event => { if (event.notificationId) recovered.push(event.notificationId); } },
      {
        pollIntervalMs: 15,
        fetchImpl: (async () => {
          unauthPolls += 1;
          if (unauthPolls === 1) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
          return new Response(JSON.stringify({ notifications: unauthPolls === 2 ? [] : [
            { id: "recovered", title: "Recovered", createdAt: "2026-11-21T10:00:00.000Z" },
          ] }), { status: 200 });
        }) as unknown as typeof fetch,
        sendNative: async () => {},
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 90));
    stopUnauth();
    expect(unauthPolls).toBeGreaterThanOrEqual(3);
    expect(recovered).toEqual(["recovered"]);
  });
});
