import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DEFAULT_HAPTICS_ENABLED,
  HAPTICS_STORAGE_KEY,
  getHapticsEnabled,
  hapticSelection,
  hapticSuccess,
  isHapticsSupported,
  parseHapticsPreference,
  resetHapticsPreferenceCache,
  setHapticsEnabled,
  subscribeHapticsPreference,
  triggerHapticImpact,
} from "@/lib/native/haptics";
import {
  canUseNativeShare,
  resolveShareUrl,
  shareLink,
} from "@/lib/native/share";
import {
  openAuthorizedFile,
  resolveAuthorizedFileUrl,
  sanitizeFileName,
  saveAuthorizedFile,
} from "@/lib/native/files";
import {
  acquirePullToRefreshLock,
  clearPullToRefreshLocks,
  getPullToRefreshLockReasons,
  isPullToRefreshLocked,
} from "@/lib/pull-to-refresh-lock";
import {
  MAX_PULL_PX,
  calculatePullDistance,
  canStartPullToRefresh,
  shouldCommitPullGesture,
} from "@/lib/pull-to-refresh-gesture";

const originalWindow = globalThis.window;
const originalNavigator = globalThis.navigator;
const originalFetch = globalThis.fetch;

function createMemoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
}

function restoreGlobals() {
  if (originalWindow === undefined) {
    delete (globalThis as Record<string, unknown>).window;
  } else {
    globalThis.window = originalWindow;
  }
  if (originalNavigator === undefined) {
    delete (globalThis as Record<string, unknown>).navigator;
  } else {
    Object.defineProperty(globalThis, "navigator", {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  }
  globalThis.fetch = originalFetch;
  resetHapticsPreferenceCache();
  clearPullToRefreshLocks();
}

describe("Item #10: OS Share, Save, and Open Files", () => {
  afterEach(restoreGlobals);

  test("resolveShareUrl resolves relative paths and blocks unsafe protocols", () => {
    expect(resolveShareUrl("/courses/math/material/123", "https://www.zyxacademy.com")).toBe(
      "https://www.zyxacademy.com/courses/math/material/123",
    );
    expect(resolveShareUrl("https://staging.zyxacademy.com/discussions?q=1")).toBe(
      "https://staging.zyxacademy.com/discussions?q=1",
    );
    expect(resolveShareUrl("javascript:alert(1)")).toBeNull();
    expect(resolveShareUrl("data:text/html,hi")).toBeNull();
    expect(resolveShareUrl("")).toBeNull();
  });

  test("shareLink uses Capacitor Share plugin when available", async () => {
    const calls: Array<Record<string, unknown>> = [];
    (globalThis as Record<string, unknown>).window = {
      location: { origin: "https://www.zyxacademy.com" },
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: {
          Share: {
            canShare: async () => ({ value: true }),
            share: async (options: Record<string, unknown>) => {
              calls.push(options);
              return {};
            },
          },
        },
      },
    };

    expect(canUseNativeShare()).toBe(true);
    const result = await shareLink({
      title: "Limit Fungsi",
      url: "/courses/calc/material/limit",
    });
    expect(result).toEqual({ ok: true, method: "capacitor" });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://www.zyxacademy.com/courses/calc/material/limit");
  });

  test("shareLink returns cancelled without falling back to clipboard on user cancel", async () => {
    let copiedText = "";
    (globalThis as Record<string, unknown>).window = {
      location: { origin: "https://www.zyxacademy.com" },
    };
    Object.defineProperty(globalThis, "navigator", {
      value: {
        share: async () => {
          const err = new Error("Share canceled");
          err.name = "AbortError";
          throw err;
        },
        clipboard: {
          writeText: async (text: string) => {
            copiedText = text;
          },
        },
      },
      configurable: true,
      writable: true,
    });

    const result = await shareLink({
      title: "Diskusi Kalkulus",
      url: "https://www.zyxacademy.com/discussions/t1",
    });
    expect(result).toEqual({ ok: false, cancelled: true });
    expect(copiedText).toBe("");
  });

  test("shareLink falls back to Web Share API and then clipboard", async () => {
    const shared: Array<Record<string, unknown>> = [];
    (globalThis as Record<string, unknown>).window = {
      location: { origin: "https://www.zyxacademy.com" },
    };
    Object.defineProperty(globalThis, "navigator", {
      value: {
        share: async (payload: Record<string, unknown>) => {
          shared.push(payload);
        },
      },
      configurable: true,
      writable: true,
    });

    const webResult = await shareLink({
      title: "Materi 1",
      url: "https://www.zyxacademy.com/courses/c1/material/m1",
    });
    expect(webResult).toEqual({ ok: true, method: "web-share" });
    expect(shared).toHaveLength(1);

    let copied = "";
    Object.defineProperty(globalThis, "navigator", {
      value: {
        clipboard: {
          writeText: async (text: string) => {
            copied = text;
          },
        },
      },
      configurable: true,
      writable: true,
    });

    const clipResult = await shareLink({
      title: "Materi 1",
      url: "/courses/c1/material/m1",
    });
    expect(clipResult).toEqual({ ok: true, method: "clipboard" });
    expect(copied).toBe("https://www.zyxacademy.com/courses/c1/material/m1");
  });

  test("sanitizeFileName strips traversal and illegal characters", () => {
    expect(sanitizeFileName("../../secret/catatan.pdf")).toBe("catatan.pdf");
    expect(sanitizeFileName("file:name*?<>|.png")).toBe("file_name_____.png");
    expect(sanitizeFileName("   ", "fallback.pdf")).toBe("fallback.pdf");
  });

  test("resolveAuthorizedFileUrl distinguishes same-origin and blocks non-http schemes", () => {
    expect(
      resolveAuthorizedFileUrl("/api/discussions/attachments/a1?download=1", "https://www.zyxacademy.com"),
    ).toEqual({
      url: "https://www.zyxacademy.com/api/discussions/attachments/a1?download=1",
      sameOrigin: true,
    });
    expect(
      resolveAuthorizedFileUrl("https://signed.example.com/file.pdf", "https://www.zyxacademy.com"),
    ).toEqual({
      url: "https://signed.example.com/file.pdf",
      sameOrigin: false,
    });
    expect(resolveAuthorizedFileUrl("file:///etc/passwd", "https://www.zyxacademy.com")).toBeNull();
  });

  test("saveAuthorizedFile strictly enforces server authorization responses", async () => {
    const fetchCalls: Array<{ url: string; credentials?: RequestCredentials }> = [];
    let filesystemWritten = false;

    (globalThis as Record<string, unknown>).window = {
      location: { origin: "https://www.zyxacademy.com" },
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: {
          Filesystem: {
            writeFile: async () => {
              filesystemWritten = true;
              return { uri: "file:///cache/test.png" };
            },
          },
        },
      },
    };

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(input), credentials: init?.credentials });
      return new Response("Forbidden", { status: 403 });
    }) as typeof fetch;

    const result = await saveAuthorizedFile({
      url: "/api/discussions/attachments/att_123?download=1",
      fileName: "soal.png",
    });

    expect(result).toEqual({ ok: false, status: 403, error: "unauthorized" });
    expect(fetchCalls).toEqual([
      {
        url: "https://www.zyxacademy.com/api/discussions/attachments/att_123?download=1",
        credentials: "same-origin",
      },
    ]);
    expect(filesystemWritten).toBe(false);
  });

  test("openAuthorizedFile uses Tauri opener and Capacitor Browser for external signed URLs", async () => {
    const tauriOpened: string[] = [];
    (globalThis as Record<string, unknown>).window = {
      location: { origin: "https://www.zyxacademy.com" },
      __TAURI__: {
        opener: {
          openUrl: async (url: string) => {
            tauriOpened.push(url);
          },
        },
      },
    };

    const tauriRes = await openAuthorizedFile({ url: "https://signed.storage.example/diktat.pdf" });
    expect(tauriRes).toEqual({ ok: true, method: "tauri-opener" });
    expect(tauriOpened).toEqual(["https://signed.storage.example/diktat.pdf"]);

    const capOpened: string[] = [];
    (globalThis as Record<string, unknown>).window = {
      location: { origin: "https://www.zyxacademy.com" },
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: {
          Browser: {
            open: async ({ url }: { url: string }) => {
              capOpened.push(url);
            },
          },
        },
      },
    };

    const capRes = await openAuthorizedFile({ url: "https://signed.storage.example/diktat.pdf" });
    expect(capRes).toEqual({ ok: true, method: "capacitor-browser" });
    expect(capOpened).toEqual(["https://signed.storage.example/diktat.pdf"]);
  });

  test("saveAuthorizedFile falls back to direct browser open/download for cross-origin CORS fetch errors", async () => {
    const opened: Array<{ url: string; target?: string }> = [];
    (globalThis as Record<string, unknown>).window = {
      location: { origin: "https://www.zyxacademy.com" },
      open: (url: string, target?: string) => {
        opened.push({ url, target });
        return null;
      },
    };
    globalThis.fetch = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;

    const crossOrigin = await saveAuthorizedFile({
      url: "https://signed.storage.example/diktat.pdf",
      fileName: "diktat.pdf",
    });
    expect(crossOrigin).toEqual({ ok: true, method: "web-download" });
    expect(opened).toEqual([{ url: "https://signed.storage.example/diktat.pdf", target: "_blank" }]);

    // Same-origin fetch errors must still fail without bypassing auth.
    const sameOrigin = await saveAuthorizedFile({
      url: "/api/discussions/attachments/att_1?download=1",
      fileName: "soal.png",
    });
    expect(sameOrigin).toEqual({ ok: false, error: "fetch_failed" });
  });

  test("saveAuthorizedFile skips Capacitor Filesystem CACHE write when Share plugin is unavailable", async () => {
    let filesystemWritten = false;
    (globalThis as Record<string, unknown>).window = {
      location: { origin: "https://www.zyxacademy.com" },
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: {
          Filesystem: {
            writeFile: async () => {
              filesystemWritten = true;
              return { uri: "file:///cache/test.png" };
            },
          },
        },
      },
    };
    globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;

    const result = await saveAuthorizedFile({
      url: "/api/discussions/attachments/att_123?download=1",
      fileName: "soal.png",
    });
    expect(filesystemWritten).toBe(false);
    expect(result).toEqual({ ok: false, error: "unsupported" });
  });
});

describe("Item #12: Meaningful Haptics", () => {
  afterEach(restoreGlobals);

  test("parseHapticsPreference defaults to enabled and respects explicit false", () => {
    expect(DEFAULT_HAPTICS_ENABLED).toBe(true);
    expect(parseHapticsPreference(null)).toBe(true);
    expect(parseHapticsPreference("")).toBe(true);
    expect(parseHapticsPreference("true")).toBe(true);
    expect(parseHapticsPreference("false")).toBe(false);
    expect(parseHapticsPreference("0")).toBe(false);
    expect(parseHapticsPreference("corrupt")).toBe(true);
  });

  test("haptics preference persists to localStorage and notifies subscribers", () => {
    const localStorage = createMemoryStorage();
    (globalThis as Record<string, unknown>).window = {
      localStorage,
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    expect(getHapticsEnabled()).toBe(true);
    let notifyCount = 0;
    const unsubscribe = subscribeHapticsPreference(() => {
      notifyCount += 1;
    });

    setHapticsEnabled(false);
    expect(getHapticsEnabled()).toBe(false);
    expect(localStorage.getItem(HAPTICS_STORAGE_KEY)).toBe("false");
    expect(notifyCount).toBe(1);

    setHapticsEnabled(true);
    expect(getHapticsEnabled()).toBe(true);
    expect(localStorage.getItem(HAPTICS_STORAGE_KEY)).toBe("true");
    expect(notifyCount).toBe(2);
    unsubscribe();
  });

  test("hapticSuccess and hapticSelection fire only when enabled in Capacitor runtime", async () => {
    const localStorage = createMemoryStorage();
    const events: string[] = [];

    (globalThis as Record<string, unknown>).window = {
      localStorage,
      addEventListener: () => {},
      removeEventListener: () => {},
      Capacitor: {
        isNativePlatform: () => true,
        Plugins: {
          Haptics: {
            notification: async ({ type }: { type: string }) => {
              events.push(`notification:${type}`);
            },
            selectionChanged: async () => {
              events.push("selection");
            },
            impact: async ({ style }: { style: string }) => {
              events.push(`impact:${style}`);
            },
          },
        },
      },
    };

    expect(isHapticsSupported()).toBe(true);
    expect(await hapticSuccess()).toBe(true);
    expect(await hapticSelection()).toBe(true);
    expect(await triggerHapticImpact("LIGHT")).toBe(true);
    expect(events).toEqual(["notification:SUCCESS", "selection", "impact:LIGHT"]);

    // Disabling user preference must suppress all haptic calls
    setHapticsEnabled(false);
    expect(await hapticSuccess()).toBe(false);
    expect(await hapticSelection()).toBe(false);
    expect(await triggerHapticImpact("LIGHT")).toBe(false);
    expect(events).toEqual(["notification:SUCCESS", "selection", "impact:LIGHT"]);
  });

  test("haptics no-op safely on web without throwing", async () => {
    (globalThis as Record<string, unknown>).window = {
      localStorage: createMemoryStorage(),
    };
    expect(isHapticsSupported()).toBe(false);
    expect(await hapticSuccess()).toBe(false);
    expect(await hapticSelection()).toBe(false);
  });
});

describe("Item #13: Smartphone Pull-to-Refresh", () => {
  afterEach(restoreGlobals);

  test("lock registry supports multiple concurrent locks and idempotent release", () => {
    expect(isPullToRefreshLocked()).toBe(false);

    const releaseQuiz = acquirePullToRefreshLock("active-quiz");
    const releaseUpload = acquirePullToRefreshLock("quiz-upload");
    expect(isPullToRefreshLocked()).toBe(true);
    expect(getPullToRefreshLockReasons()).toEqual(["active-quiz", "quiz-upload"]);

    releaseQuiz();
    releaseQuiz(); // idempotent
    expect(isPullToRefreshLocked()).toBe(true);
    expect(getPullToRefreshLockReasons()).toEqual(["quiz-upload"]);

    releaseUpload();
    expect(isPullToRefreshLocked()).toBe(false);
    expect(getPullToRefreshLockReasons()).toEqual([]);
  });

  test("canStartPullToRefresh activates ONLY at scrollTop === 0 and when unlocked", () => {
    const base = {
      enabled: true,
      locked: false,
      isRefreshing: false,
      scrollTop: 0,
      windowScrollY: 0,
      hasOpenDialog: false,
      isIgnoredTarget: false,
    };

    expect(canStartPullToRefresh(base)).toBe(true);
    expect(canStartPullToRefresh({ ...base, scrollTop: 1 })).toBe(false);
    expect(canStartPullToRefresh({ ...base, windowScrollY: 12 })).toBe(false);
    expect(canStartPullToRefresh({ ...base, locked: true })).toBe(false);
    expect(canStartPullToRefresh({ ...base, enabled: false })).toBe(false);
    expect(canStartPullToRefresh({ ...base, isRefreshing: true })).toBe(false);
    expect(canStartPullToRefresh({ ...base, hasOpenDialog: true })).toBe(false);
    expect(canStartPullToRefresh({ ...base, isIgnoredTarget: true })).toBe(false);
  });

  test("calculatePullDistance and shouldCommitPullGesture handle direction and resistance", () => {
    expect(calculatePullDistance(-20)).toBe(0);
    expect(calculatePullDistance(0)).toBe(0);
    expect(calculatePullDistance(60)).toBeGreaterThan(0);
    expect(calculatePullDistance(5000)).toBeLessThanOrEqual(MAX_PULL_PX);

    expect(shouldCommitPullGesture(2, 3)).toBe("pending");
    expect(shouldCommitPullGesture(4, 24)).toBe("pull");
    expect(shouldCommitPullGesture(30, 10)).toBe("cancel");
    expect(shouldCommitPullGesture(0, -18)).toBe("cancel");
  });
});

describe("Integration wiring & AGENTS.md compliance", () => {
  const root = process.cwd();

  test("pull-to-refresh locks are wired for quizzes, uploads, and composer submissions", () => {
    const quizPlayer = readFileSync(join(root, "hooks/use-quiz-player.ts"), "utf8");
    expect(quizPlayer).toContain('usePullToRefreshLock(!isSubmitted, "active-quiz")');
    expect(quizPlayer).toContain('usePullToRefreshLock(submitting, "quiz-submit")');
    expect(quizPlayer).toContain("hapticSuccess");

    const composer = readFileSync(join(root, "components/discussions/composer.tsx"), "utf8");
    expect(composer).toContain('usePullToRefreshLock(uploading, "discussion-upload")');
    expect(composer).toContain('usePullToRefreshLock(draft.sending, "discussion-submit")');
    expect(composer).toContain("hapticSuccess");

    const zyraUpload = readFileSync(join(root, "components/course/zyra-attachment-composer.tsx"), "utf8");
    expect(zyraUpload).toContain('usePullToRefreshLock(isUploadingAny, "zyra-upload")');
  });

  test("new files do not contain em dashes or en dashes", () => {
    const files = [
      "lib/native/haptics.ts",
      "lib/native/share.ts",
      "lib/native/files.ts",
      "lib/pull-to-refresh-lock.ts",
      "hooks/use-pull-to-refresh.ts",
      "components/pull-to-refresh.tsx",
      "components/share-link-button.tsx",
    ];
    for (const file of files) {
      const content = readFileSync(join(root, file), "utf8");
      expect(content).not.toContain("\u2014");
      expect(content).not.toContain("\u2013");
    }
  });

  test("en and id message catalogs stay in key parity for modified namespaces", () => {
    const collectKeys = (obj: Record<string, unknown>, prefix = ""): string[] =>
      Object.entries(obj).flatMap(([k, v]) =>
        typeof v === "object" && v !== null && !Array.isArray(v)
          ? collectKeys(v as Record<string, unknown>, `${prefix}${k}.`)
          : [`${prefix}${k}`],
      );

    for (const file of ["common.json", "student.json"]) {
      const en = JSON.parse(readFileSync(join(root, "messages/en", file), "utf8")) as Record<string, unknown>;
      const id = JSON.parse(readFileSync(join(root, "messages/id", file), "utf8")) as Record<string, unknown>;
      expect(collectKeys(en).sort()).toEqual(collectKeys(id).sort());
    }
  });
});
