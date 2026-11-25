import { afterEach, describe, expect, test } from "bun:test";
import {
  DESKTOP_BREAKPOINT_PX,
  DESKTOP_MEDIA_QUERY,
  getViewportModeServerSnapshot,
  getViewportModeSnapshot,
  subscribeViewportMode,
} from "@/hooks/use-viewport-mode";

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow === undefined) {
    // @ts-expect-error restoring undefined window in Bun test environment
    delete globalThis.window;
  } else {
    globalThis.window = originalWindow;
  }
});

describe("useViewportMode helpers", () => {
  test("anchors to the canonical 768px breakpoint", () => {
    expect(DESKTOP_BREAKPOINT_PX).toBe(768);
    expect(DESKTOP_MEDIA_QUERY).toBe("(min-width: 768px)");
  });

  test("returns unknown on server snapshot unless an initialHint is provided", () => {
    expect(getViewportModeServerSnapshot()).toBe("unknown");
    expect(getViewportModeServerSnapshot("desktop")).toBe("desktop");
    expect(getViewportModeServerSnapshot("mobile")).toBe("mobile");
  });

  test("returns unknown when window or matchMedia is unavailable", () => {
    // @ts-expect-error simulating SSR environment
    delete globalThis.window;
    expect(getViewportModeSnapshot()).toBe("unknown");
    expect(subscribeViewportMode(() => {})).toBeTypeOf("function");
  });

  test("reads desktop or mobile from window.matchMedia and subscribes to change events", () => {
    let matches = false;
    const listeners = new Set<() => void>();
    let observedQuery = "";

    const mockMediaQuery = {
      get matches() {
        return matches;
      },
      addEventListener: (event: string, cb: () => void) => {
        if (event === "change") listeners.add(cb);
      },
      removeEventListener: (event: string, cb: () => void) => {
        if (event === "change") listeners.delete(cb);
      },
    };

    globalThis.window = {
      matchMedia: (query: string) => {
        observedQuery = query;
        return mockMediaQuery as unknown as MediaQueryList;
      },
    } as unknown as Window & typeof globalThis;

    expect(getViewportModeSnapshot()).toBe("mobile");
    expect(observedQuery).toBe("(min-width: 768px)");

    let notifications = 0;
    const unsubscribe = subscribeViewportMode(() => {
      notifications += 1;
    });

    matches = true;
    for (const listener of listeners) listener();

    expect(notifications).toBe(1);
    expect(getViewportModeSnapshot()).toBe("desktop");

    unsubscribe();
    matches = false;
    for (const listener of listeners) listener();

    expect(notifications).toBe(1);
    expect(getViewportModeSnapshot()).toBe("mobile");
  });

  test("falls back to legacy addListener and removeListener when addEventListener is absent", () => {
    const legacyListeners = new Set<() => void>();

    globalThis.window = {
      matchMedia: () =>
        ({
          matches: true,
          addListener: (cb: () => void) => legacyListeners.add(cb),
          removeListener: (cb: () => void) => legacyListeners.delete(cb),
        }) as unknown as MediaQueryList,
    } as unknown as Window & typeof globalThis;

    let count = 0;
    const unsubscribe = subscribeViewportMode(() => {
      count += 1;
    });

    expect(legacyListeners.size).toBe(1);
    for (const cb of legacyListeners) cb();
    expect(count).toBe(1);

    unsubscribe();
    expect(legacyListeners.size).toBe(0);
  });
});
