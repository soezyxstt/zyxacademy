import { describe, expect, test, afterEach } from "bun:test";
import {
  buildNativeOfflineSnapshot,
  formatOfflineBytes,
  selectEvictionKeys,
} from "@/lib/offline/reading-cache";
import {
  getNativeDeviceLabel,
  getNativeRuntime,
  isCapacitorApp,
  isNativeApp,
  isTauriApp,
} from "@/lib/native/runtime";
import {
  buildNativeAuthDeepLink,
  isAllowedNativeAuthScheme,
  isMobileAuthScheme,
  parseNativeAuthDeepLink,
  resolveNativeAuthScheme,
} from "@/lib/native/auth-handoff";
import {
  compareSemver,
  isUpdateAvailable,
  parseInstalledAppMetaFromUa,
  parseReleaseTag,
  selectLatestReleaseForChannel,
} from "@/lib/native/updates";
import {
  getUnifiedNotificationPermission,
  registerUnifiedPushToken,
  requestUnifiedNotificationPermission,
} from "@/lib/native/notifications";

describe("offline reading cache LRU eviction", () => {
  test("does not evict when within entry and byte limits", () => {
    const records = [
      { key: "u1::c1::m1", sizeBytes: 100_000, lastAccessedAt: 10 },
      { key: "u1::c1::m2", sizeBytes: 200_000, lastAccessedAt: 20 },
    ];
    expect(selectEvictionKeys(records, 5, 1_000_000)).toEqual([]);
  });

  test("evicts oldest accessed entries first when entry count exceeds maxEntries", () => {
    const records = [
      { key: "newest", sizeBytes: 100, lastAccessedAt: 300 },
      { key: "oldest", sizeBytes: 100, lastAccessedAt: 100 },
      { key: "middle", sizeBytes: 100, lastAccessedAt: 200 },
    ];
    expect(selectEvictionKeys(records, 2, 10_000)).toEqual(["oldest"]);
  });

  test("evicts oldest accessed entries until total bytes fit maxBytes", () => {
    const records = [
      { key: "a", sizeBytes: 400, lastAccessedAt: 1 },
      { key: "b", sizeBytes: 400, lastAccessedAt: 2 },
      { key: "c", sizeBytes: 400, lastAccessedAt: 3 },
    ];
    expect(selectEvictionKeys(records, 10, 700)).toEqual(["a", "b"]);
  });

  test("formats byte sizes readably", () => {
    expect(formatOfflineBytes(512)).toBe("512 B");
    expect(formatOfflineBytes(2048)).toBe("2 KB");
    expect(formatOfflineBytes(2 * 1024 * 1024)).toBe("2.0 MB");
  });

  test("builds portable native offline snapshots without visual HTML comment tokens", () => {
    const snapshot = buildNativeOfflineSnapshot({
      key: "u1::c1::m1",
      userId: "u1",
      courseId: "c1",
      materialId: "m1",
      kind: "course_material",
      title: "Bilangan Real",
      courseTitle: "Matematika I",
      sizeBytes: 240,
      savedAt: 1000,
      lastAccessedAt: 1000,
      material: {
        id: "m1",
        courseId: "c1",
        title: "Bilangan Real",
        kind: "article",
        body: "## Pengantar\n\nHimpunan bilangan real.\n<!--__ZYX_V3_ARTICLE_VISUALS__:abc123-->",
      },
    });
    expect(snapshot.title).toBe("Bilangan Real");
    expect(snapshot.courseTitle).toBe("Matematika I");
    expect(snapshot.sections).toHaveLength(1);
    expect(snapshot.sections[0].body).toContain("Himpunan bilangan real.");
    expect(snapshot.sections[0].body).not.toContain("__ZYX_V3_ARTICLE_VISUALS__");
  });
});

describe("native runtime detection", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  test("defaults to web runtime when window is absent", () => {
    delete (globalThis as Record<string, unknown>).window;
    expect(getNativeRuntime()).toBe("web");
    expect(isNativeApp()).toBe(false);
    expect(isCapacitorApp()).toBe(false);
    expect(isTauriApp()).toBe(false);
  });

  test("detects Capacitor native platform", () => {
    (globalThis as Record<string, unknown>).window = {
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "android",
      },
    };
    expect(getNativeRuntime()).toBe("capacitor");
    expect(isCapacitorApp()).toBe(true);
    expect(isTauriApp()).toBe(false);
    expect(isNativeApp()).toBe(true);
    expect(getNativeDeviceLabel()).toBe("capacitor-android");
  });

  test("detects Tauri desktop runtime", () => {
    (globalThis as Record<string, unknown>).window = {
      __TAURI__: {
        core: { invoke: async () => null },
      },
    };
    expect(getNativeRuntime()).toBe("tauri");
    expect(isTauriApp()).toBe(true);
    expect(isCapacitorApp()).toBe(false);
    expect(isNativeApp()).toBe(true);
  });
});

describe("native OAuth handoff helpers", () => {
  test("resolves nightly vs stable schemes per runtime and host", () => {
    expect(
      resolveNativeAuthScheme({
        runtime: "capacitor",
        userAgent: "ZyxMobileApp/0.1.0-alpha.1 (Capacitor; nightly)",
        hostname: "staging.zyxacademy.com",
      }),
    ).toBe("com.zyx.academy.nightly");

    expect(
      resolveNativeAuthScheme({
        runtime: "capacitor",
        userAgent: "ZyxMobileApp/0.1.0-alpha.1 (Capacitor; stable)",
        hostname: "www.zyxacademy.com",
      }),
    ).toBe("com.zyx.academy");

    expect(
      resolveNativeAuthScheme({
        runtime: "tauri",
        hostname: "staging.zyxacademy.com",
      }),
    ).toBe("zyxacademy-nightly");

    expect(
      resolveNativeAuthScheme({
        runtime: "tauri",
        hostname: "www.zyxacademy.com",
      }),
    ).toBe("zyxacademy");

    expect(resolveNativeAuthScheme({ runtime: "web", hostname: "www.zyxacademy.com" })).toBeNull();
  });

  test("enforces strict scheme allowlist, state nonce, and fragment-only token transport", () => {
    expect(isAllowedNativeAuthScheme("com.zyx.academy.nightly")).toBe(true);
    expect(isAllowedNativeAuthScheme("javascript")).toBe(false);
    expect(isMobileAuthScheme("com.zyx.academy.nightly")).toBe(true);
    expect(isMobileAuthScheme("zyxacademy-nightly")).toBe(false);

    const state = "valid_state_nonce_123456";
    const deepLink = buildNativeAuthDeepLink("com.zyx.academy.nightly", "tok_123", state, "/courses/math");
    expect(deepLink).toBe(
      `com.zyx.academy.nightly://auth/native-finish#token=tok_123&state=${state}&next=%2Fcourses%2Fmath`,
    );
    expect(parseNativeAuthDeepLink(deepLink)).toBe(
      `/auth/native-finish#token=tok_123&state=${state}&next=%2Fcourses%2Fmath`,
    );

    // External open redirect attempts must fall back to /dashboard
    const evilNext = parseNativeAuthDeepLink(
      `com.zyx.academy.nightly://auth/native-finish#token=tok_123&state=${state}&next=//evil.com`,
    );
    expect(evilNext).toBe(`/auth/native-finish#token=tok_123&state=${state}&next=%2Fdashboard`);

    // Missing state, query-string token, unknown schemes, and wrong paths must be rejected
    expect(parseNativeAuthDeepLink("com.zyx.academy.nightly://auth/native-finish#token=tok_123")).toBeNull();
    expect(parseNativeAuthDeepLink(`com.zyx.academy.nightly://auth/native-finish?token=tok_123&state=${state}`)).toBeNull();
    expect(parseNativeAuthDeepLink(`evil://auth/native-finish#token=tok_123&state=${state}`)).toBeNull();
    expect(parseNativeAuthDeepLink(`com.zyx.academy.nightly://other/path#token=tok_123&state=${state}`)).toBeNull();
  });
});

describe("in-app update checker helpers", () => {
  test("parses nightly and stable GitHub release tags and selects matching channel assets", () => {
    expect(parseReleaseTag("app-v0.1.0-alpha.1-nightly.20261121.d36d955")).toEqual({
      channel: "nightly",
      version: "0.1.0-alpha.1",
      buildId: "d36d955",
    });
    expect(parseReleaseTag("app-v0.2.0")).toEqual({
      channel: "stable",
      version: "0.2.0",
      buildId: null,
    });
    expect(parseReleaseTag("app-v0.2.0-b42")).toEqual({
      channel: "stable",
      version: "0.2.0",
      buildId: "b42",
    });

    const latestNightly = selectLatestReleaseForChannel(
      [
        {
          tag_name: "app-v0.1.0-alpha.1",
          html_url: "https://github.com/soezyxstt/zyxacademy/releases/tag/app-v0.1.0-alpha.1",
          published_at: "2026-11-21T12:00:00Z",
          assets: [],
        },
        {
          tag_name: "app-v0.1.0-alpha.1-nightly.20261121.d36d955",
          html_url: "https://github.com/soezyxstt/zyxacademy/releases/tag/app-v0.1.0-alpha.1-nightly.20261121.d36d955",
          published_at: "2026-11-21T09:13:35Z",
          assets: [
            {
              name: "zyx-academy-nightly-0.1.0-alpha.1-20261121-android.apk",
              browser_download_url: "https://github.com/soezyxstt/zyxacademy/releases/download/old/app.apk",
            },
          ],
        },
        {
          tag_name: "app-v0.1.0-alpha.1-nightly.20261121.a28ef10",
          html_url: "https://github.com/soezyxstt/zyxacademy/releases/tag/app-v0.1.0-alpha.1-nightly.20261121.a28ef10",
          published_at: "2026-11-21T11:58:18Z",
          assets: [
            {
              name: "zyx-academy-nightly-0.1.0-alpha.1-20261121-android.apk",
              browser_download_url: "https://github.com/soezyxstt/zyxacademy/releases/download/tag/app.apk",
            },
            {
              name: "zyx-academy-nightly-0.1.0-alpha.1-20261121-windows-x64.exe",
              browser_download_url: "https://github.com/soezyxstt/zyxacademy/releases/download/tag/app.exe",
            },
          ],
        },
      ],
      "nightly",
    );
    expect(latestNightly?.buildId).toBe("a28ef10");
    expect(latestNightly?.downloads.android).toContain(".apk");
    expect(latestNightly?.downloads.windows).toContain(".exe");
  });

  test("compares semver, nightly SHA, and stable build numbers without looping", () => {
    expect(compareSemver("0.1.0-alpha.2", "0.1.0-alpha.1")).toBeGreaterThan(0);
    expect(compareSemver("0.1.0", "0.1.0-alpha.1")).toBeGreaterThan(0);
    expect(compareSemver("0.1.0-alpha.1", "0.1.0-alpha.1")).toBe(0);

    expect(
      isUpdateAvailable(
        { channel: "nightly", version: "0.1.0-alpha.1", buildId: "32de3fd" },
        { channel: "nightly", version: "0.1.0-alpha.1", buildId: "d36d955" },
      ),
    ).toBe(true);
    expect(
      isUpdateAvailable(
        { channel: "nightly", version: "0.1.0-alpha.1", buildId: "d36d955" },
        { channel: "nightly", version: "0.1.0-alpha.1", buildId: "d36d955" },
      ),
    ).toBe(false);
    expect(
      isUpdateAvailable(
        { channel: "stable", version: "0.1.0-alpha.1", buildId: "b0" },
        { channel: "stable", version: "0.1.0", buildId: null },
      ),
    ).toBe(true);
    expect(
      isUpdateAvailable(
        { channel: "stable", version: "0.1.0-alpha.1", buildId: "b42" },
        { channel: "stable", version: "0.1.0-alpha.1", buildId: "b42" },
      ),
    ).toBe(false);
    expect(
      isUpdateAvailable(
        { channel: "stable", version: "0.1.0-alpha.1", buildId: "b41" },
        { channel: "stable", version: "0.1.0-alpha.1", buildId: "b42" },
      ),
    ).toBe(true);
  });

  test("parses installed build metadata from Capacitor User-Agent", () => {
    const meta = parseInstalledAppMetaFromUa({
      runtime: "capacitor",
      userAgent: "Mozilla/5.0 ZyxMobileApp/0.1.0-alpha.8 (Capacitor; nightly; build=24b2ae0)",
      hostname: "staging.zyxacademy.com",
      capacitorPlatform: "android",
    });
    expect(meta).toEqual({
      runtime: "capacitor",
      channel: "nightly",
      version: "0.1.0-alpha.8",
      buildId: "24b2ae0",
      platform: "android",
    });
    expect(compareSemver("0.1.0-alpha.10", "0.1.0-alpha.8")).toBeGreaterThan(0);
  });
});

describe("native Android notification crash guard", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  test("uses LocalNotifications for permission and skips PushNotifications.register when FCM is not bundled", async () => {
    let pushRegisterCalls = 0;
    let localRequestCalls = 0;

    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "android",
        Plugins: {
          LocalNotifications: {
            checkPermissions: async () => ({ display: "prompt" }),
            requestPermissions: async () => {
              localRequestCalls += 1;
              return { display: "granted" };
            },
          },
          PushNotifications: {
            checkPermissions: async () => ({ receive: "prompt" }),
            requestPermissions: async () => ({ receive: "granted" }),
            register: async () => {
              pushRegisterCalls += 1;
              throw new Error("Default FirebaseApp is not initialized");
            },
            addListener: async () => ({ remove: async () => {} }),
          },
          ZyxAppUpdater: {
            downloadAndInstall: async () => ({ started: true }),
            getAppCapabilities: async () => ({ fcmConfigured: false }),
          },
        },
      },
    };

    expect(await getUnifiedNotificationPermission()).toBe("default");
    expect(await requestUnifiedNotificationPermission()).toBe("granted");
    expect(localRequestCalls).toBe(1);
    expect(await registerUnifiedPushToken("user-1", () => true)).toBe(false);
    expect(pushRegisterCalls).toBe(0);
  });
});
