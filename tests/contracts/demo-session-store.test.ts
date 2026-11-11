import { describe, expect, test } from "bun:test";
import { createDemoOverlayStore } from "@/lib/demo/session-store";
import { emptyOverlay, overlayKey } from "@/lib/demo/session-overlay";

const first = { courseId: "course:a", revision: "one" };
const revised = { courseId: "course:a", revision: "two" };
const other = { courseId: "course:b", revision: "one" };
const article = { kind: "article" as const, id: "article", date: "2026-01-01" };

function fixture() {
  const values = new Map<string, string>();
  let reads = 0;
  let unavailable = false;
  const storage = {
    getItem(key: string) { reads++; if (unavailable) throw new Error("unavailable"); return values.get(key) ?? null; },
    setItem(key: string, value: string) { if (unavailable) throw new Error("unavailable"); values.set(key, value); },
    removeItem(key: string) { if (unavailable) throw new Error("unavailable"); values.delete(key); },
  };
  return { values, store: createDemoOverlayStore(() => storage), reads: () => reads, setUnavailable: (value: boolean) => { unavailable = value; } };
}

describe("demo overlay tab store", () => {
  test("validates storage once per scope and isolates course and revision across remounts", () => {
    const { values, store, reads } = fixture();
    values.set(overlayKey(first.courseId, first.revision), JSON.stringify({ version: 1, events: [article] }));
    values.set(overlayKey(other.courseId, other.revision), "{bad");
    expect(store.read(first).events).toEqual([article]);
    expect(store.read(first).events).toEqual([article]);
    expect(reads()).toBe(1);
    expect(store.read(revised)).toEqual(emptyOverlay());
    expect(store.read(other)).toEqual(emptyOverlay());
    expect(reads()).toBe(3);
    expect(store.read(first).events).toEqual([article]);
  });

  test("retries reads after temporary storage failure", () => {
    const { values, store, setUnavailable } = fixture();
    values.set(overlayKey(first.courseId, first.revision), JSON.stringify({ version: 1, events: [article] }));
    setUnavailable(true);
    expect(store.read(first)).toEqual(emptyOverlay());
    setUnavailable(false);
    expect(store.read(first).events).toEqual([article]);
  });

  test("publishes updates and resets to all subscribers, including on history return", () => {
    const { values, store } = fixture();
    const notifications: string[] = [];
    const unsubscribe = store.subscribe(change => notifications.push(change.kind));
    store.read(first);
    store.record(first, article);
    store.record(first, article);
    expect(notifications).toEqual(["update"]);
    expect(store.read(first).events).toEqual([article]);
    store.reset([first, other]);
    expect(notifications).toEqual(["update", "reset"]);
    expect(values.has(overlayKey(first.courseId, first.revision))).toBe(false);
    expect(store.read(first)).toEqual(emptyOverlay());
    store.invalidate(null);
    expect(store.read(first)).toEqual(emptyOverlay());
    unsubscribe();
    store.record(first, article);
    expect(notifications).toEqual(["update", "reset", "invalidate"]);
  });

  test("rereads invalidated storage and keeps unsaved changes when storage is unavailable", () => {
    const { values, store, setUnavailable } = fixture();
    const key = overlayKey(first.courseId, first.revision);
    expect(store.read(first)).toEqual(emptyOverlay());
    values.set(key, JSON.stringify({ version: 1, events: [article] }));
    store.invalidate(key);
    expect(store.read(first).events).toEqual([article]);
    setUnavailable(true);
    store.reset([first]);
    store.invalidate(null);
    expect(store.read(first)).toEqual(emptyOverlay());
    store.record(first, article);
    store.invalidate(null);
    expect(store.read(first).events).toEqual([article]);
    setUnavailable(false);
    store.record(first, { kind: "quiz", id: "quiz", date: "2026-01-02" });
    store.invalidate(key);
    expect(store.read(first).events).toHaveLength(2);
  });
});
