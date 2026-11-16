import { expect, test } from "bun:test";
import { discussionContentUncovered, visibleDiscussionReadSnapshot, watchDiscussionVisibility } from "@/components/discussions/discussion-adapter";

test("content needs a meaningful uncovered dwell, including after a modal or revision", async () => {
  const original = ["document", "window", "IntersectionObserver", "MutationObserver"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  let contentTop = 100, contentHeight = 40, blocked = false, covered = false, revision = 1;
  let refresh = () => {};
  const rect = (top: number, height: number) => ({ left: 10, top, right: 90, bottom: top + height, width: 80, height });
  const status = { getBoundingClientRect: () => rect(5, 10), contains: () => false };
  const parent = { parentElement: null, getBoundingClientRect: () => rect(20, 80) };
  const content = { parentElement: parent, getBoundingClientRect: () => rect(contentTop, contentHeight), contains: () => false, closest: () => ({ dataset: { messageId: "m1" } }) };
  const documentFake = { visibilityState: "visible", body: {}, querySelector: () => blocked ? {} : null,
    elementFromPoint: (_x: number, y: number) => y < 20 ? status : covered ? {} : content, addEventListener: () => {}, removeEventListener: () => {} };
  class IntersectionFake { constructor(callback: () => void) { refresh = callback; } observe() {} disconnect() {} }
  class MutationFake { constructor(callback: () => void) { refresh = callback; } observe() {} disconnect() {} }
  Object.defineProperty(globalThis, "document", { configurable: true, value: documentFake });
  Object.defineProperty(globalThis, "window", { configurable: true, value: { innerWidth: 100, innerHeight: 100, getComputedStyle: () => ({ overflowX: "hidden", overflowY: "auto" }), addEventListener: () => {}, removeEventListener: () => {} } });
  Object.defineProperty(globalThis, "IntersectionObserver", { configurable: true, value: IntersectionFake });
  Object.defineProperty(globalThis, "MutationObserver", { configurable: true, value: MutationFake });
  const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  const observed: number[] = [];
  let emptyCallbacks = 0;
  const state = { through: 0, seen: new Set<number>(), versions: new Map<string, number>() };
  try {
    const root = { querySelector: () => status, querySelectorAll: () => [content] } as unknown as ParentNode;
    const stop = watchDiscussionVisibility(root, ids => {
      if (ids && !ids.length) emptyCallbacks++;
      const messages = ids?.includes("m1") ? [{ id: "m1", seq: 1, revision }] : [];
      if (visibleDiscussionReadSnapshot(state, "open", messages, "receipt")) observed.push(revision);
    });
    await wait(650);
    expect(emptyCallbacks).toBeGreaterThan(0);
    expect(observed).toEqual([]);
    contentTop = 99.96; refresh();
    expect(discussionContentUncovered(content as unknown as HTMLElement)).toBe(false);
    await wait(100);
    contentTop = 25; refresh();
    await wait(250);
    contentTop = 100; refresh();
    await wait(450);
    expect(observed).toEqual([]);
    contentTop = 25; refresh();
    await wait(650);
    expect(observed).toEqual([1]);
    blocked = true; refresh(); revision = 2;
    await wait(650);
    expect(observed).toEqual([1]);
    blocked = false; covered = true; refresh();
    await wait(650);
    expect(observed).toEqual([1]);
    covered = false; refresh();
    await wait(250);
    covered = true;
    await wait(450);
    expect(observed).toEqual([1]);
    covered = false; contentTop = -1000; contentHeight = 2000; refresh();
    await wait(650);
    expect(observed).toEqual([1, 2]);
    stop();
  } finally {
    for (const [key, descriptor] of original) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
}, 7000);
