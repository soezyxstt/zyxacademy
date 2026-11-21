import { describe, expect, test, afterEach } from "bun:test";
import {
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
