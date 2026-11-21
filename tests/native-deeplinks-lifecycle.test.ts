import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_AUTH_CALLBACK_PATH, getSafeRedirectPath } from "@/lib/auth-redirect";
import { captureNativeQuestionPhoto } from "@/lib/native/camera";
import {
  clearPendingCameraCapture,
  clearRestoredCameraPayload,
  consumeRestoredCameraPayload,
  extractRestoredPhotoData,
  handleAppRestoredCameraResult,
  peekRestoredCameraPayload,
  readPendingCameraCapture,
  savePendingCameraCapture,
  subscribeNativeCameraRestore,
  type CameraStorageAdapter,
} from "@/lib/native/camera-recovery";
import {
  createDeepLinkDedupeTracker,
  isSupportedAppDeepLinkPath,
  parseNativeDeepLink,
  resetHandledLaunchUrlForTest,
  resolveDeepLinkNavigationPath,
  subscribeNativeDeepLinks,
} from "@/lib/native/deep-links";
import {
  attachNativeLifecycleRefresh,
  createLifecycleRefreshController,
  isQuerySafeToBackgroundRefresh,
  type LifecycleRefreshReason,
} from "@/lib/native/lifecycle-refresh";
import {
  buildAndroidAssetLinks,
  buildAppleAppSiteAssociation,
  parseSha256Fingerprints,
} from "@/lib/well-known/mobile-links";

function createMemoryStorage(options?: { failSet?: boolean }): CameraStorageAdapter {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      if (options?.failSet) {
        throw new Error("QuotaExceededError");
      }
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

const SAMPLE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("Item #6: Android camera appRestoredResult recovery", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    clearRestoredCameraPayload({ localStorage: null, sessionStorage: null });
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  test("persists and reads pending camera capture target with TTL expiry", () => {
    const storage = createMemoryStorage();
    const now = 1_700_000_000_000;

    savePendingCameraCapture(
      {
        surface: "discussion",
        mode: "new",
        channelId: "ch-math",
        viewerId: "user-1",
        draftBody: "Bagaimana cara membuktikan limit ini?",
        pathname: "/dashboard/discussions",
        search: "?channel=ch-math",
      },
      { now, storage },
    );

    const active = readPendingCameraCapture({ now: now + 60_000, storage });
    expect(active).not.toBeNull();
    expect(active?.surface).toBe("discussion");
    expect(active?.draftBody).toBe("Bagaimana cara membuktikan limit ini?");

    const expired = readPendingCameraCapture({ now: now + 20 * 60_000, storage });
    expect(expired).toBeNull();
  });

  test("extracts restored photo from base64String or dataUrl and ignores non-camera or cancelled events", () => {
    expect(
      extractRestoredPhotoData({
        pluginId: "Camera",
        methodName: "getPhoto",
        success: true,
        data: { base64String: SAMPLE_PNG_BASE64, format: "png" },
      }),
    ).toEqual({ base64String: SAMPLE_PNG_BASE64, format: "png" });

    expect(
      extractRestoredPhotoData({
        pluginId: "Camera",
        methodName: "getPhoto",
        success: true,
        data: { dataUrl: `data:image/jpeg;base64,${SAMPLE_PNG_BASE64}` },
      }),
    ).toEqual({ base64String: SAMPLE_PNG_BASE64, format: "jpeg" });

    expect(
      extractRestoredPhotoData({
        pluginId: "Camera",
        methodName: "getPhoto",
        success: false,
        error: { message: "User cancelled" },
      }),
    ).toBeNull();

    expect(
      extractRestoredPhotoData({
        pluginId: "Browser",
        methodName: "open",
        success: true,
        data: { base64String: SAMPLE_PNG_BASE64 },
      }),
    ).toBeNull();
  });

  test("routes restored photo back to Discussion reply composer without losing draft text or replyTo", () => {
    const local = createMemoryStorage();
    const session = createMemoryStorage();
    const now = 1_700_000_000_000;

    savePendingCameraCapture(
      {
        surface: "discussion",
        mode: "reply",
        channelId: "ch-fisika",
        questionId: "q-42",
        viewerId: "u-student-1",
        draftBody: "Ini langkah pengerjaan saya:",
        replyTo: { id: "msg-7", authorName: "Budi", excerpt: "Coba cek gaya normal" },
        pathname: "/dashboard/discussions",
        search: "?question=q-42",
      },
      { now, storage: local },
    );

    // WebView relaunched on /dashboard after Android killed process
    const result = handleAppRestoredCameraResult(
      {
        pluginId: "Camera",
        methodName: "getPhoto",
        success: true,
        data: { base64String: SAMPLE_PNG_BASE64, format: "png" },
      },
      {
        now: now + 5_000,
        currentPath: "/dashboard",
        localStorage: local,
        sessionStorage: session,
        dispatchEvent: false,
      },
    );

    expect(result.handled).toBe(true);
    expect(result.navigateTo).toBe("/dashboard/discussions?question=q-42");
    expect(readPendingCameraCapture({ now: now + 5_000, storage: local })).toBeNull();

    // Wrong question or wrong user must NOT consume the payload
    expect(
      consumeRestoredCameraPayload(
        (target) =>
          target.surface === "discussion" &&
          target.mode === "reply" &&
          target.questionId === "q-999",
        { now: now + 6_000, localStorage: local, sessionStorage: session },
      ),
    ).toBeNull();

    // Exact originating reply composer consumes it once
    const consumed = consumeRestoredCameraPayload(
      (target) =>
        target.surface === "discussion" &&
        target.mode === "reply" &&
        target.viewerId === "u-student-1" &&
        target.channelId === "ch-fisika" &&
        target.questionId === "q-42",
      { now: now + 6_000, localStorage: local, sessionStorage: session },
    );

    expect(consumed).not.toBeNull();
    expect(consumed?.file.type).toBe("image/png");
    expect(consumed?.file.size).toBeGreaterThan(0);
    expect(consumed?.payload.target.draftBody).toBe("Ini langkah pengerjaan saya:");
    if (consumed?.payload.target.surface === "discussion" && consumed.payload.target.mode === "reply") {
      expect(consumed.payload.target.replyTo?.id).toBe("msg-7");
    }

    // Second consume returns null (no duplicate photo attachment)
    expect(
      consumeRestoredCameraPayload(() => true, {
        now: now + 7_000,
        localStorage: local,
        sessionStorage: session,
      }),
    ).toBeNull();
  });

  test("routes restored photo to Zyra composer and survives storage quota errors via memory fallback", () => {
    const local = createMemoryStorage();
    const quotaSession = createMemoryStorage({ failSet: true });
    const now = 1_700_000_000_000;

    savePendingCameraCapture(
      {
        surface: "zyra",
        courseId: "ma1101",
        sessionId: "sess-1",
        draftBody: "Tolong jelaskan integral ini",
        pathname: "/courses/ma1101/material/m-5",
        search: "",
      },
      { now, storage: local },
    );

    const result = handleAppRestoredCameraResult(
      {
        pluginId: "Camera",
        methodName: "getPhoto",
        success: true,
        data: { base64String: SAMPLE_PNG_BASE64, format: "jpeg" },
      },
      {
        now: now + 2_000,
        currentPath: "/courses/ma1101/material/m-5",
        localStorage: local,
        sessionStorage: quotaSession,
        dispatchEvent: false,
      },
    );

    expect(result.handled).toBe(true);
    expect(result.navigateTo).toBeUndefined();

    const peeked = peekRestoredCameraPayload(
      (target) => target.surface === "zyra" && target.courseId === "ma1101",
      { now: now + 3_000, localStorage: local, sessionStorage: quotaSession },
    );
    expect(peeked).not.toBeNull();

    const consumed = consumeRestoredCameraPayload(
      (target) => target.surface === "zyra" && target.courseId === "ma1101",
      { now: now + 3_000, localStorage: local, sessionStorage: quotaSession },
    );
    expect(consumed?.file.type).toBe("image/jpeg");
    expect(consumed?.payload.target.draftBody).toBe("Tolong jelaskan integral ini");
  });

  test("captureNativeQuestionPhoto clears pending recovery context on normal completion", async () => {
    const local = createMemoryStorage();
    let seenPendingDuringCapture = false;

    (globalThis as Record<string, unknown>).window = {
      localStorage: local,
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "android",
        Plugins: {
          Camera: {
            getPhoto: async () => {
              seenPendingDuringCapture = readPendingCameraCapture({ storage: local }) !== null;
              return { base64String: SAMPLE_PNG_BASE64, format: "png" };
            },
          },
        },
      },
    };

    const file = await captureNativeQuestionPhoto({
      surface: "zyra",
      courseId: "fi1101",
      draftBody: "Halo",
      pathname: "/courses/fi1101",
      search: "",
    });

    expect(seenPendingDuringCapture).toBe(true);
    expect(file).not.toBeNull();
    expect(readPendingCameraCapture({ storage: local })).toBeNull();
    clearPendingCameraCapture({ storage: local });
  });

  test("subscribeNativeCameraRestore hooks Capacitor appRestoredResult and triggers navigation", async () => {
    const local = createMemoryStorage();
    const session = createMemoryStorage();
    const now = Date.now();
    let listener: ((event: Record<string, unknown>) => void) | undefined;
    let removed = false;

    savePendingCameraCapture(
      {
        surface: "discussion",
        mode: "new",
        channelId: "ch-1",
        viewerId: "u-1",
        draftBody: "Draft soal baru",
        pathname: "/dashboard/discussions",
        search: "",
      },
      { now, storage: local },
    );

    (globalThis as Record<string, unknown>).window = {
      localStorage: local,
      sessionStorage: session,
      location: { pathname: "/dashboard", search: "" },
      dispatchEvent: () => true,
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "android",
        Plugins: {
          App: {
            addListener: async (_name: string, fn: (event: Record<string, unknown>) => void) => {
              listener = fn;
              return {
                remove: async () => {
                  removed = true;
                },
              };
            },
          },
        },
      },
    };

    const navigated: string[] = [];
    const unsub = await subscribeNativeCameraRestore((path) => navigated.push(path));
    listener?.({
      pluginId: "Camera",
      methodName: "getPhoto",
      success: true,
      data: { base64String: SAMPLE_PNG_BASE64, format: "png" },
    });

    expect(navigated).toEqual(["/dashboard/discussions"]);
    unsub();
    expect(removed).toBe(true);
  });
});

describe("Item #7: Direct deep links, safe redirects, and .well-known config", () => {
  const originalWindow = globalThis.window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      globalThis.window = originalWindow;
    }
  });

  test("parses HTTPS App Links and Universal Links for materials, discussions, and schedules", () => {
    expect(
      parseNativeDeepLink("https://www.zyxacademy.com/courses/ma1101/material/m-12?tab=ringkasan#bab-2"),
    ).toEqual({
      kind: "app",
      path: "/courses/ma1101/material/m-12?tab=ringkasan#bab-2",
    });

    expect(
      parseNativeDeepLink("https://staging.zyxacademy.com/discussions?question=q-1&message=m-9"),
    ).toEqual({
      kind: "app",
      path: "/discussions?question=q-1&message=m-9",
    });

    expect(parseNativeDeepLink("https://zyx.academy/calendar?date=2026-11-22")).toEqual({
      kind: "app",
      path: "/calendar?date=2026-11-22",
    });

    expect(parseNativeDeepLink("https://zyxacademy.com/courses/tutorial-pka/jadwal")).toEqual({
      kind: "app",
      path: "/courses/tutorial-pka/jadwal",
    });

    expect(parseNativeDeepLink("https://www.zyxacademy.com/tutor/schedule")).toEqual({
      kind: "app",
      path: "/tutor/schedule",
    });

    expect(parseNativeDeepLink("https://www.zyxacademy.com/tutor/c-1/discussions?question=q-5")).toEqual({
      kind: "app",
      path: "/tutor/c-1/discussions?question=q-5",
    });
  });

  test("parses custom mobile schemes for both auth callbacks and direct app deep links", () => {
    expect(
      parseNativeDeepLink(
        "com.zyx.academy://auth/native-finish#token=ott123&state=valid_state_nonce_123456&next=%2Fcalendar",
      ),
    ).toEqual({
      kind: "auth",
      path: "/auth/native-finish#token=ott123&state=valid_state_nonce_123456&next=%2Fcalendar",
    });

    expect(
      parseNativeDeepLink("com.zyx.academy://courses/fi1101/material/mat-7"),
    ).toEqual({
      kind: "app",
      path: "/courses/fi1101/material/mat-7",
    });

    expect(
      parseNativeDeepLink("com.zyx.academy.nightly://discussions?question=q-2"),
    ).toEqual({
      kind: "app",
      path: "/discussions?question=q-2",
    });

    expect(
      parseNativeDeepLink("com.zyx.academy://calendar?date=2026-11-22"),
    ).toEqual({
      kind: "app",
      path: "/calendar?date=2026-11-22",
    });
  });

  test("blocks open redirects, untrusted hosts, unsupported routes, and control characters", () => {
    expect(parseNativeDeepLink("https://evil.example/courses/ma1101")).toBeNull();
    expect(parseNativeDeepLink("http://www.zyxacademy.com/courses/ma1101")).toBeNull();
    expect(parseNativeDeepLink("https://www.zyxacademy.com/api/auth/sign-out")).toBeNull();
    expect(parseNativeDeepLink("https://www.zyxacademy.com/sign-out")).toBeNull();
    expect(parseNativeDeepLink("javascript:alert(1)")).toBeNull();
    expect(isSupportedAppDeepLinkPath("//evil.com/courses")).toBe(false);
    expect(isSupportedAppDeepLinkPath("/\\evil.com/courses")).toBe(false);

    expect(getSafeRedirectPath("https://evil.com/phish")).toBe(DEFAULT_AUTH_CALLBACK_PATH);
    expect(getSafeRedirectPath("//evil.com/phish")).toBe(DEFAULT_AUTH_CALLBACK_PATH);
    expect(getSafeRedirectPath("/\\evil.com/phish")).toBe(DEFAULT_AUTH_CALLBACK_PATH);
    expect(getSafeRedirectPath("evil.com/courses")).toBe(DEFAULT_AUTH_CALLBACK_PATH);
    expect(getSafeRedirectPath("/courses/math\r\nSet-Cookie: a=1")).toBe(DEFAULT_AUTH_CALLBACK_PATH);
    expect(getSafeRedirectPath("/courses/math/material/1?tab=notes")).toBe(
      "/courses/math/material/1?tab=notes",
    );
  });

  test("preserves deep-link destination across /sign-in and deduplicates cold-start + appUrlOpen", async () => {
    expect(resolveDeepLinkNavigationPath("/courses/ma1101/material/m1", "/sign-in")).toBe(
      "/sign-in?next=%2Fcourses%2Fma1101%2Fmaterial%2Fm1",
    );
    expect(resolveDeepLinkNavigationPath("/calendar?date=2026-11-22", "/dashboard")).toBe(
      "/calendar?date=2026-11-22",
    );

    const tracker = createDeepLinkDedupeTracker(3_000);
    const url = "https://www.zyxacademy.com/courses/ma1101/material/m1";
    expect(tracker.shouldHandle(url, "/dashboard", 1_000)).toEqual({
      kind: "app",
      path: "/courses/ma1101/material/m1",
    });
    // Immediate duplicate from getLaunchUrl + appUrlOpen is ignored
    expect(tracker.shouldHandle(url, "/dashboard", 1_500)).toBeNull();
    // Already on the exact path does not loop
    expect(tracker.shouldHandle(url, "/courses/ma1101/material/m1", 10_000)).toBeNull();

    // Cold-start getLaunchUrl + duplicate appUrlOpen integration
    let appUrlListener: ((event: { url?: string }) => void) | undefined;
    (globalThis as Record<string, unknown>).window = {
      location: { pathname: "/sign-in", search: "", hash: "" },
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "android",
        Plugins: {
          App: {
            getLaunchUrl: async () => ({ url: "https://www.zyxacademy.com/calendar?date=2026-11-22" }),
            addListener: async (_name: string, fn: (event: { url?: string }) => void) => {
              appUrlListener = fn;
              return { remove: async () => {} };
            },
          },
        },
      },
    };

    const appRoutes: string[] = [];
    const authRoutes: string[] = [];
    const unsub = await subscribeNativeDeepLinks({
      onAuthFinish: (path) => authRoutes.push(path),
      onAppRoute: (path) => appRoutes.push(path),
    });

    // Duplicate appUrlOpen right after cold-start getLaunchUrl should be ignored
    appUrlListener?.({ url: "https://www.zyxacademy.com/calendar?date=2026-11-22" });

    expect(authRoutes).toEqual([]);
    expect(appRoutes).toEqual(["/sign-in?next=%2Fcalendar%3Fdate%3D2026-11-22"]);
    unsub();

    // Remounting subscribeNativeDeepLinks later must NOT re-navigate to the same cold-start getLaunchUrl()
    const unsub2 = await subscribeNativeDeepLinks({
      onAuthFinish: (path) => authRoutes.push(path),
      onAppRoute: (path) => appRoutes.push(path),
    });
    expect(appRoutes).toEqual(["/sign-in?next=%2Fcalendar%3Fdate%3D2026-11-22"]);
    unsub2();
    resetHandledLaunchUrlForTest();
  });

  test("builds valid Android assetlinks.json and Apple AASA payloads", () => {
    const fp = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";
    expect(parseSha256Fingerprints(` ${fp.toLowerCase()} , invalid, ${fp} `)).toEqual([fp]);

    const emptyLinks = buildAndroidAssetLinks({ stableFingerprints: "", nightlyFingerprints: "" });
    expect(emptyLinks).toEqual([]);

    const links = buildAndroidAssetLinks({ stableFingerprints: fp, nightlyFingerprints: fp });
    expect(links).toHaveLength(2);
    expect(links[0].target.package_name).toBe("com.zyx.academy");
    expect(links[1].target.package_name).toBe("com.zyx.academy.nightly");

    const emptyAasa = buildAppleAppSiteAssociation({ teamId: "", appIds: "" });
    expect(emptyAasa.applinks.details).toEqual([]);

    const aasa = buildAppleAppSiteAssociation({ teamId: "AB12CD34EF" });
    expect(aasa.applinks.details).toHaveLength(1);
    expect(aasa.applinks.details[0].appIDs).toEqual([
      "AB12CD34EF.com.zyx.academy",
      "AB12CD34EF.com.zyx.academy.nightly",
    ]);
    const componentPaths = aasa.applinks.details[0].components.map((c) => c["/"]);
    expect(componentPaths).toContain("/courses/*");
    expect(componentPaths).toContain("/discussions");
    expect(componentPaths).toContain("/calendar");
    expect(componentPaths).toContain("/tutor/schedule");
    expect(aasa.applinks.details[0].components.some((c) => c["/"] === "/api/*" && c.exclude === true)).toBe(true);
  });

  test("AndroidManifest.xml, iOS App.entitlements, Xcode project, and proxy.ts contain required deep-link contracts", () => {
    const root = process.cwd();
    const manifest = readFileSync(
      join(root, "apps/mobile/android/app/src/main/AndroidManifest.xml"),
      "utf8",
    );
    expect(manifest).toContain('android:autoVerify="true"');
    expect(manifest).toContain('android:host="www.zyxacademy.com"');
    expect(manifest).toContain('android:host="staging.zyxacademy.com"');
    expect(manifest).toContain('android:pathPrefix="/courses"');
    expect(manifest).toContain('android:pathPrefix="/discussions"');
    expect(manifest).toContain('android:pathPrefix="/calendar"');
    expect(manifest).toContain('android:pathPattern="/tutor/.*/discussions.*"');
    expect(manifest).toContain('android:pathPrefix="/tutor/schedule"');

    const entitlements = readFileSync(
      join(root, "apps/mobile/ios/App/App/App.entitlements"),
      "utf8",
    );
    expect(entitlements).toContain("com.apple.developer.associated-domains");
    expect(entitlements).toContain("applinks:www.zyxacademy.com");
    expect(entitlements).toContain("applinks:staging.zyxacademy.com");

    const pbxproj = readFileSync(
      join(root, "apps/mobile/ios/App/App.xcodeproj/project.pbxproj"),
      "utf8",
    );
    expect(pbxproj).toContain("CODE_SIGN_ENTITLEMENTS = App/App.entitlements;");

    const proxySource = readFileSync(join(root, "proxy.ts"), "utf8");
    expect(proxySource).toContain('pathname.startsWith("/calendar")');
    expect(proxySource).toContain('pathname.startsWith("/discussions/")');
    expect(proxySource).toContain('pathname.startsWith("/tutor")');
  });
});

describe("Item #8: Smart data refresh on network reconnect or app resume", () => {
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      globalThis.window = originalWindow;
    }
    if (originalDocument === undefined) {
      delete (globalThis as Record<string, unknown>).document;
    } else {
      globalThis.document = originalDocument;
    }
  });

  test("coalesces simultaneous reconnect + resume signals into one debounced refresh and throttles repeats", async () => {
    let clock = 100_000;
    const timers: Array<{ id: number; fn: () => void; ms: number; cleared: boolean }> = [];
    let nextTimerId = 1;

    const onlineChanges: boolean[] = [];
    const inboxReasons: LifecycleRefreshReason[] = [];
    let sessionRefreshes = 0;
    let queryRefetches = 0;

    const controller = createLifecycleRefreshController(
      {
        queryClient: {
          refetchQueries: async () => {
            queryRefetches += 1;
          },
          isMutating: () => 0,
        },
        refreshSession: async () => {
          sessionRefreshes += 1;
        },
        notifyInbox: (reason) => inboxReasons.push(reason),
        setOnline: (connected) => onlineChanges.push(connected),
        now: () => clock,
        scheduleTimer: (fn, ms) => {
          const entry = { id: nextTimerId++, fn, ms, cleared: false };
          timers.push(entry);
          return entry.id as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimer: (id) => {
          const found = timers.find((t) => t.id === (id as unknown as number));
          if (found) found.cleared = true;
        },
      },
      {
        debounceMs: 300,
        resumeCooldownMs: 10_000,
        reconnectCooldownMs: 2_000,
        minResumeAwayMs: 5_000,
        minVisibilityAwayMs: 15_000,
        sessionStaleMs: 60_000,
      },
    );

    const flushTimers = async () => {
      const active = timers.filter((t) => !t.cleared);
      for (const timer of active) {
        timer.cleared = true;
        timer.fn();
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    };

    // App goes background & offline
    controller.handleAppStateChange(false);
    controller.handleVisibilityChange(false);
    controller.handleNetworkStatusChange(false);
    expect(onlineChanges).toEqual([false]);

    // 20 seconds later, user unlocks phone: visibility, appState, and network all fire together
    clock += 20_000;
    controller.handleNetworkStatusChange(true);
    controller.handleAppStateChange(true);
    controller.handleVisibilityChange(true);

    await flushTimers();

    expect(onlineChanges).toEqual([false, true]);
    expect(sessionRefreshes).toBe(1);
    expect(queryRefetches).toBe(1);
    // Highest priority reason wins
    expect(inboxReasons).toEqual(["network_reconnect"]);

    // Redundant online -> online does not trigger another refresh
    clock += 3_000;
    controller.handleNetworkStatusChange(true);
    await flushTimers();
    expect(queryRefetches).toBe(1);

    // Another resume within resumeCooldownMs is throttled
    controller.handleAppStateChange(false);
    clock += 6_000;
    controller.handleAppStateChange(true);
    await flushTimers();
    expect(queryRefetches).toBe(1);

    // After resumeCooldownMs (total > 10s since last refresh), resume refreshes queries + inbox
    // without re-checking session because sessionStaleMs (60s) has not elapsed yet
    controller.handleAppStateChange(false);
    clock += 6_000;
    controller.handleAppStateChange(true);
    await flushTimers();
    expect(queryRefetches).toBe(2);
    expect(sessionRefreshes).toBe(1);
    expect(inboxReasons).toEqual(["network_reconnect", "app_resume"]);

    controller.dispose();
  });

  test("skips queries with in-flight mutations on the same domain and survives transient session errors", async () => {
    const activeMutationDomains = new Set<string>(["zyx:account:u1:quizzes"]);
    const queryClient = {
      isMutating: (filters?: { mutationKey?: readonly unknown[] }) => {
        if (!filters?.mutationKey) return activeMutationDomains.size;
        return activeMutationDomains.has(filters.mutationKey.join(":")) ? 1 : 0;
      },
      refetchQueries: async (filters: {
        type: "active";
        stale: true;
        predicate?: (query: { queryKey: readonly unknown[] }) => boolean;
      }) => {
        expect(filters.type).toBe("active");
        expect(filters.stale).toBe(true);
        const quizKey = ["zyx", "account", "u1", "quizzes", "attempt", "a1"];
        const todayKey = ["zyx", "account", "u1", "student", "today"];
        expect(filters.predicate?.({ queryKey: quizKey })).toBe(false);
        expect(filters.predicate?.({ queryKey: todayKey })).toBe(true);
      },
    };

    expect(
      isQuerySafeToBackgroundRefresh(queryClient, ["zyx", "account", "u1", "quizzes", "attempt", "a1"]),
    ).toBe(false);
    expect(
      isQuerySafeToBackgroundRefresh(queryClient, ["zyx", "account", "u1", "student", "today"]),
    ).toBe(true);

    let inboxNotified = false;
    const controller = createLifecycleRefreshController(
      {
        queryClient,
        refreshSession: async () => {
          throw new Error("temporary_offline_blip");
        },
        notifyInbox: () => {
          inboxNotified = true;
        },
        scheduleTimer: (fn) => {
          fn();
          return 1 as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimer: () => {},
      },
      { debounceMs: 0 },
    );

    controller.triggerRefresh("network_reconnect");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(inboxNotified).toBe(true);
    controller.dispose();
  });

  test("attachNativeLifecycleRefresh subscribes to Capacitor Network + App plugins and disposes cleanly", async () => {
    let networkListener: ((status: { connected: boolean }) => void) | undefined;
    let appStateListener: ((state: { isActive: boolean }) => void) | undefined;
    let networkRemoved = false;
    let appStateRemoved = false;
    const dispatched: string[] = [];

    (globalThis as Record<string, unknown>).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: (event: { type?: string }) => {
        if (event?.type) dispatched.push(event.type);
        return true;
      },
      Capacitor: {
        isNativePlatform: () => true,
        getPlatform: () => "android",
        Plugins: {
          Network: {
            getStatus: async () => ({ connected: false }),
            addListener: async (_event: string, fn: (status: { connected: boolean }) => void) => {
              networkListener = fn;
              return {
                remove: async () => {
                  networkRemoved = true;
                },
              };
            },
          },
          App: {
            addListener: async (_event: string, fn: (state: { isActive: boolean }) => void) => {
              appStateListener = fn;
              return {
                remove: async () => {
                  appStateRemoved = true;
                },
              };
            },
          },
        },
      },
    };
    (globalThis as Record<string, unknown>).document = {
      visibilityState: "visible",
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    const onlineEvents: boolean[] = [];
    let refetched = 0;

    const dispose = await attachNativeLifecycleRefresh(
      {
        queryClient: {
          refetchQueries: async () => {
            refetched += 1;
          },
          isMutating: () => 0,
        },
        setOnline: (connected) => onlineEvents.push(connected),
        scheduleTimer: (fn) => {
          fn();
          return 1 as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimer: () => {},
      },
      { debounceMs: 0 },
    );

    expect(typeof networkListener).toBe("function");
    expect(typeof appStateListener).toBe("function");
    expect(onlineEvents).toContain(false);

    // Transition offline -> online triggers smart refresh
    networkListener?.({ connected: true });
    await Promise.resolve();
    await Promise.resolve();

    expect(onlineEvents[onlineEvents.length - 1]).toBe(true);
    expect(refetched).toBe(1);
    expect(dispatched).toContain("zyx:lifecycle-refresh");

    dispose();
    expect(networkRemoved).toBe(true);
    expect(appStateRemoved).toBe(true);
  });
});
