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
    });
    expect(apnsPayload).toMatchObject({
      aps: { alert: { title: "New quiz", body: "Math quiz is open" }, sound: "default" },
      type: "quiz_published",
      url: "/courses/math",
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
    let postedBody: Record<string, unknown> | null = null;

    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      postedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
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
    expect(postedBody).toEqual({
      token: apnsToken,
      device: "capacitor-ios",
      platform: "ios",
      transport: "apns",
    });

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

  test("registers Tauri desktop token and delivers new inbox notifications to native OS", async () => {
    let postedBody: Record<string, unknown> | null = null;

    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      postedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
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
    expect(postedBody?.platform).toBe("desktop");
    expect(postedBody?.transport).toBe("desktop");
    expect(String(postedBody?.token ?? "")).toStartWith("desktop:");

    // Test desktop inbox bridge polling: first poll seeds existing IDs without firing,
    // second poll fires native notification + foreground handler for new arrival.
    const nativeCalls: Array<{ title: string; body?: string }> = [];
    const foregroundCalls: Array<{ title?: string; body?: string; url?: string }> = [];
    let pollCount = 0;

    const fakeFetch = (async () => {
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
    expect(foregroundCalls).toEqual([
      { title: "New quiz", body: "Calculus quiz is open", url: "/courses/calc" },
    ]);
    expect(nativeCalls).toEqual([{ title: "New quiz", body: "Calculus quiz is open" }]);
  });
});
