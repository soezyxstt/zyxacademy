"use client";

export interface MobileTabSwipeState {
  count: number;
  activeIndex: number;
}

export interface MobileTabSwipeEntry {
  getContainer: () => Element | null;
  getNavElement: () => Element | null;
  getState: () => MobileTabSwipeState;
  navigate: (nextIndex: number) => void;
}

const MOBILE_MAX_WIDTH_PX = 767;
const LOCK_THRESHOLD_PX = 12;
const MIN_SWIPE_DISTANCE_PX = 56;
const LONG_SWIPE_DISTANCE_PX = 80;
const MAX_QUICK_SWIPE_MS = 650;
const HORIZONTAL_DOMINANCE_RATIO = 1.5;

const BLOCKED_TARGET_SELECTOR = [
  "[data-swipe-lock]",
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[contenteditable='']",
  "[role='slider']",
  "[role='dialog']",
  "[role='alertdialog']",
  "[data-slot='dialog-content']",
  "[data-slot='sheet-content']",
  "[data-slot='drawer-content']",
  "[data-slot='dropdown-menu-content']",
  "[data-slot='popover-content']",
  "canvas",
  ".cm-editor",
].join(", ");

function getDomDepth(el: Element): number {
  let depth = 0;
  let current: Element | null = el;
  while (current) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}

function isElementVisible(el: Element): boolean {
  if (!el.isConnected) return false;
  if (el.closest("[hidden], [aria-hidden='true']")) return false;
  if (typeof window !== "undefined" && typeof window.getComputedStyle === "function") {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

/**
 * Resolves whether a completed touch gesture should switch tabs.
 * Returns +1 for swipe left (next tab), -1 for swipe right (previous tab), or 0.
 */
export function resolveSwipeTabDelta(
  dx: number,
  dy: number,
  durationMs: number
): -1 | 0 | 1 {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < MIN_SWIPE_DISTANCE_PX) return 0;
  if (absX <= absY * HORIZONTAL_DOMINANCE_RATIO) return 0;
  if (durationMs > MAX_QUICK_SWIPE_MS && absX < LONG_SWIPE_DISTANCE_PX) return 0;
  return dx < 0 ? 1 : -1;
}

/**
 * Returns true if the touch started inside a gesture-locked element (such as
 * SwipeableDiscussionRow or DiscussionMessage), an interactive control/dialog,
 * or a horizontally scrollable element inside `boundary` that can scroll in the
 * gesture direction.
 */
export function isBlockedSwipeTarget(
  target: Element,
  boundary: Element | null,
  dx: number
): boolean {
  if (target.closest(BLOCKED_TARGET_SELECTOR)) return true;

  let current: Element | null = target;
  while (current && current !== boundary) {
    if (current instanceof HTMLElement && current.scrollWidth > current.clientWidth + 4) {
      const overflowX =
        typeof window !== "undefined" && typeof window.getComputedStyle === "function"
          ? window.getComputedStyle(current).overflowX
          : "";
      if (overflowX === "auto" || overflowX === "scroll") {
        // Swipe left (dx < 0) scrolls right; swipe right (dx > 0) scrolls left.
        if (dx === 0) return true;
        const canScrollLeft = current.scrollLeft > 1;
        const canScrollRight =
          current.scrollLeft + current.clientWidth < current.scrollWidth - 1;
        if ((dx < 0 && canScrollRight) || (dx > 0 && canScrollLeft)) {
          return true;
        }
      }
    }
    current = current.parentElement;
  }
  return false;
}

/**
 * Selects the deepest (innermost / lowest in the DOM tree) horizontal tab
 * controller whose container contains `target`.
 */
export function selectDeepestTabSwipeController(
  target: Element,
  entries: Iterable<MobileTabSwipeEntry>
): MobileTabSwipeEntry | null {
  const candidates: Array<{
    entry: MobileTabSwipeEntry;
    container: Element;
    nav: Element;
    containerDepth: number;
    navDepth: number;
  }> = [];

  for (const entry of entries) {
    const container = entry.getContainer();
    const nav = entry.getNavElement();
    if (!container || !nav) continue;
    if (!isElementVisible(nav)) continue;
    if (!container.contains(target)) continue;
    const state = entry.getState();
    if (state.count <= 1 || state.activeIndex < 0) continue;
    candidates.push({
      entry,
      container,
      nav,
      containerDepth: getDomDepth(container),
      navDepth: getDomDepth(nav),
    });
  }

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    if (a.container !== b.container) {
      if (a.container.contains(b.container)) return 1;
      if (b.container.contains(a.container)) return -1;
    }
    if (a.containerDepth !== b.containerDepth) {
      return b.containerDepth - a.containerDepth;
    }
    if (a.navDepth !== b.navDepth) {
      return b.navDepth - a.navDepth;
    }
    if (a.nav !== b.nav) {
      const pos = a.nav.compareDocumentPosition(b.nav);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return 1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return -1;
    }
    return 0;
  });

  return candidates[0].entry;
}

const registry = new Set<MobileTabSwipeEntry>();
let attached = false;

type ActiveGesture = {
  startX: number;
  startY: number;
  startTime: number;
  axis: "none" | "horizontal" | "vertical";
  target: Element;
  controller: MobileTabSwipeEntry;
  boundary: Element | null;
};

let activeGesture: ActiveGesture | null = null;

function onTouchStart(event: TouchEvent) {
  activeGesture = null;
  if (typeof window === "undefined" || window.innerWidth > MOBILE_MAX_WIDTH_PX) return;
  if (event.touches.length !== 1) return;
  const rawTarget = event.target;
  if (!(rawTarget instanceof Element)) return;
  if (rawTarget.closest(BLOCKED_TARGET_SELECTOR)) return;

  const controller = selectDeepestTabSwipeController(rawTarget, registry);
  if (!controller) return;

  const touch = event.touches[0];
  activeGesture = {
    startX: touch.clientX,
    startY: touch.clientY,
    startTime: Date.now(),
    axis: "none",
    target: rawTarget,
    controller,
    boundary: controller.getContainer(),
  };
}

function onTouchMove(event: TouchEvent) {
  if (!activeGesture) return;
  if (event.touches.length !== 1) {
    activeGesture = null;
    return;
  }
  const touch = event.touches[0];
  const dx = touch.clientX - activeGesture.startX;
  const dy = touch.clientY - activeGesture.startY;

  if (activeGesture.axis === "none") {
    if (Math.abs(dy) > LOCK_THRESHOLD_PX && Math.abs(dy) >= Math.abs(dx) * 0.75) {
      activeGesture.axis = "vertical";
      return;
    }
    if (Math.abs(dx) > LOCK_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy)) {
      if (isBlockedSwipeTarget(activeGesture.target, activeGesture.boundary, dx)) {
        activeGesture = null;
        return;
      }
      activeGesture.axis = "horizontal";
    }
  }
}

function onTouchEnd(event: TouchEvent) {
  const gesture = activeGesture;
  activeGesture = null;
  if (!gesture || gesture.axis !== "horizontal") return;
  const touch = event.changedTouches[0];
  if (!touch) return;

  const dx = touch.clientX - gesture.startX;
  const dy = touch.clientY - gesture.startY;
  const durationMs = Date.now() - gesture.startTime;
  const delta = resolveSwipeTabDelta(dx, dy, durationMs);
  if (delta === 0) return;

  if (isBlockedSwipeTarget(gesture.target, gesture.boundary, dx)) return;

  const state = gesture.controller.getState();
  const nextIndex = state.activeIndex + delta;
  if (nextIndex < 0 || nextIndex >= state.count || nextIndex === state.activeIndex) return;
  gesture.controller.navigate(nextIndex);
}

function onTouchCancel() {
  activeGesture = null;
}

function ensureListeners() {
  if (attached || typeof document === "undefined") return;
  document.addEventListener("touchstart", onTouchStart, { passive: true });
  document.addEventListener("touchmove", onTouchMove, { passive: true });
  document.addEventListener("touchend", onTouchEnd, { passive: true });
  document.addEventListener("touchcancel", onTouchCancel, { passive: true });
  attached = true;
}

function teardownListenersIfEmpty() {
  if (!attached || registry.size > 0 || typeof document === "undefined") return;
  document.removeEventListener("touchstart", onTouchStart);
  document.removeEventListener("touchmove", onTouchMove);
  document.removeEventListener("touchend", onTouchEnd);
  document.removeEventListener("touchcancel", onTouchCancel);
  activeGesture = null;
  attached = false;
}

export function registerMobileTabSwipe(entry: MobileTabSwipeEntry): () => void {
  registry.add(entry);
  ensureListeners();
  return () => {
    registry.delete(entry);
    if (activeGesture?.controller === entry) activeGesture = null;
    teardownListenersIfEmpty();
  };
}
