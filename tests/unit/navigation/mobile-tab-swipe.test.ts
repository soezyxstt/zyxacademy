import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  isBlockedSwipeTarget,
  registerMobileTabSwipe,
  resolveSwipeTabDelta,
  selectDeepestTabSwipeController,
  type MobileTabSwipeEntry,
} from "@/lib/navigation/mobile-tab-swipe";

class FakeElement {
  tagName: string;
  parentElement: FakeElement | null = null;
  children: FakeElement[] = [];
  attrs = new Map<string, string>();
  isConnected = true;
  scrollWidth = 0;
  clientWidth = 0;
  scrollLeft = 0;
  private listeners = new Map<string, Set<(event: unknown) => void>>();

  constructor(tagName: string) {
    this.tagName = tagName.toLowerCase();
  }

  append(...nodes: FakeElement[]) {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }

  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }

  matchesSelector(selector: string): boolean {
    const parts = selector.split(",").map((part) => part.trim());
    for (const part of parts) {
      if (part === this.tagName) return true;
      const attrMatch = part.match(/^\[([^=\]]+)(?:=['"]?([^'"\]]*)['"]?)?\]$/);
      if (attrMatch) {
        const [, key, val] = attrMatch;
        if (val === undefined) {
          if (this.attrs.has(key)) return true;
        } else if (this.attrs.get(key) === val) {
          return true;
        }
      }
    }
    return false;
  }

  closest(selector: string): FakeElement | null {
    let current: FakeElement | null = this;
    while (current) {
      if (current.matchesSelector(selector)) return current;
      current = current.parentElement;
    }
    return null;
  }

  contains(target: FakeElement | null): boolean {
    let current: FakeElement | null = target;
    while (current) {
      if (current === this) return true;
      current = current.parentElement;
    }
    return false;
  }

  compareDocumentPosition(other: FakeElement): number {
    if (this === other) return 0;
    const order: FakeElement[] = [];
    let root: FakeElement = this;
    while (root.parentElement) root = root.parentElement;
    const walk = (node: FakeElement) => {
      order.push(node);
      for (const child of node.children) walk(child);
    };
    walk(root);
    return order.indexOf(this) < order.indexOf(other) ? 4 : 2;
  }

  addEventListener(type: string, fn: (event: unknown) => void) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(fn);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, fn: (event: unknown) => void) {
    this.listeners.get(type)?.delete(fn);
  }

  dispatch(type: string, event: Record<string, unknown>) {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
}

let doc: FakeElement;
let origWindow: typeof globalThis.window;
let origDocument: typeof globalThis.document;
let origElement: typeof globalThis.Element;
let origHTMLElement: typeof globalThis.HTMLElement;
let origNode: typeof globalThis.Node;

beforeEach(() => {
  origWindow = globalThis.window;
  origDocument = globalThis.document;
  origElement = globalThis.Element;
  origHTMLElement = globalThis.HTMLElement;
  origNode = globalThis.Node;

  doc = new FakeElement("document");
  Object.assign(globalThis, {
    window: {
      innerWidth: 390,
      innerHeight: 844,
      getComputedStyle: () => ({ display: "block", visibility: "visible", overflowX: "visible" }),
    },
    document: doc,
    Element: FakeElement,
    HTMLElement: FakeElement,
    Node: { DOCUMENT_POSITION_PRECEDING: 2, DOCUMENT_POSITION_FOLLOWING: 4 },
  });
});

afterEach(() => {
  Object.assign(globalThis, {
    window: origWindow,
    document: origDocument,
    Element: origElement,
    HTMLElement: origHTMLElement,
    Node: origNode,
  });
});

function fireTouch(
  type: "touchstart" | "touchmove" | "touchend",
  target: FakeElement,
  clientX: number,
  clientY: number
) {
  const touch = { clientX, clientY };
  doc.dispatch(type, {
    target,
    touches: type === "touchend" ? [] : [touch],
    changedTouches: [touch],
  });
}

describe("resolveSwipeTabDelta", () => {
  test("maps horizontal left swipe to +1 and right swipe to -1", () => {
    expect(resolveSwipeTabDelta(-72, 10, 180)).toBe(1);
    expect(resolveSwipeTabDelta(72, -8, 180)).toBe(-1);
  });

  test("ignores short or vertically dominant gestures", () => {
    expect(resolveSwipeTabDelta(-30, 0, 120)).toBe(0);
    expect(resolveSwipeTabDelta(-60, 50, 180)).toBe(0);
    expect(resolveSwipeTabDelta(-65, 5, 900)).toBe(0);
    expect(resolveSwipeTabDelta(-90, 5, 900)).toBe(1);
  });
});

describe("selectDeepestTabSwipeController", () => {
  test("prefers the innermost horizontal tab controller when 2 levels are nested", () => {
    const main = new FakeElement("main");
    const outerNav = new FakeElement("nav");
    const page = new FakeElement("div");
    const innerTabs = new FakeElement("div");
    const innerNav = new FakeElement("div");
    const innerContent = new FakeElement("p");

    innerTabs.append(innerNav, innerContent);
    page.append(innerTabs);
    main.append(outerNav, page);
    doc.append(main);

    const outer: MobileTabSwipeEntry = {
      getContainer: () => main as unknown as Element,
      getNavElement: () => outerNav as unknown as Element,
      getState: () => ({ count: 3, activeIndex: 1 }),
      navigate: () => {},
    };
    const inner: MobileTabSwipeEntry = {
      getContainer: () => innerTabs as unknown as Element,
      getNavElement: () => innerNav as unknown as Element,
      getState: () => ({ count: 2, activeIndex: 0 }),
      navigate: () => {},
    };

    expect(selectDeepestTabSwipeController(innerContent as unknown as Element, [outer, inner])).toBe(inner);
    expect(selectDeepestTabSwipeController(page as unknown as Element, [outer, inner])).toBe(outer);
  });
});

describe("isBlockedSwipeTarget", () => {
  test("blocks gestures inside data-swipe-lock (discussion rows and messages) and form inputs", () => {
    const container = new FakeElement("div");
    const row = new FakeElement("div");
    row.setAttribute("data-swipe-lock", "");
    const rowChild = new FakeElement("span");
    row.append(rowChild);

    const input = new FakeElement("input");
    const plain = new FakeElement("p");

    container.append(row, input, plain);
    doc.append(container);

    expect(isBlockedSwipeTarget(rowChild as unknown as Element, container as unknown as Element, -80)).toBe(true);
    expect(isBlockedSwipeTarget(input as unknown as Element, container as unknown as Element, -80)).toBe(true);
    expect(isBlockedSwipeTarget(plain as unknown as Element, container as unknown as Element, -80)).toBe(false);
  });
});

describe("registerMobileTabSwipe integration", () => {
  test("triggers only innermost tab on mobile and never collides with data-swipe-lock", () => {
    const main = new FakeElement("main");
    const outerNav = new FakeElement("nav");
    const innerTabs = new FakeElement("div");
    const innerNav = new FakeElement("div");
    const innerContent = new FakeElement("div");
    const lockedRow = new FakeElement("div");
    lockedRow.setAttribute("data-swipe-lock", "");
    const lockedText = new FakeElement("span");
    lockedRow.append(lockedText);

    innerTabs.append(innerNav, innerContent, lockedRow);
    main.append(outerNav, innerTabs);
    doc.append(main);

    const outerCalls: number[] = [];
    const innerCalls: number[] = [];

    const unregOuter = registerMobileTabSwipe({
      getContainer: () => main as unknown as Element,
      getNavElement: () => outerNav as unknown as Element,
      getState: () => ({ count: 3, activeIndex: 1 }),
      navigate: (idx) => outerCalls.push(idx),
    });
    const unregInner = registerMobileTabSwipe({
      getContainer: () => innerTabs as unknown as Element,
      getNavElement: () => innerNav as unknown as Element,
      getState: () => ({ count: 3, activeIndex: 0 }),
      navigate: (idx) => innerCalls.push(idx),
    });

    try {
      // Swipe left on innerContent -> moves inner tab from 0 to 1, outer untouched
      fireTouch("touchstart", innerContent, 250, 200);
      fireTouch("touchmove", innerContent, 180, 204);
      fireTouch("touchend", innerContent, 150, 206);
      expect(innerCalls).toEqual([1]);
      expect(outerCalls).toEqual([]);

      // Swipe right at inner index 0 -> does NOT fall through to outer tab
      fireTouch("touchstart", innerContent, 100, 200);
      fireTouch("touchmove", innerContent, 180, 202);
      fireTouch("touchend", innerContent, 220, 203);
      expect(innerCalls).toEqual([1]);
      expect(outerCalls).toEqual([]);

      // Swipe inside data-swipe-lock (SwipeableDiscussionRow) -> neither tab triggers
      fireTouch("touchstart", lockedText, 250, 200);
      fireTouch("touchmove", lockedText, 170, 202);
      fireTouch("touchend", lockedText, 120, 203);
      expect(innerCalls).toEqual([1]);
      expect(outerCalls).toEqual([]);
    } finally {
      unregInner();
      unregOuter();
    }
  });
});
