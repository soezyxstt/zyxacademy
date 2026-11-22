/**
 * Selectors for portaled overlays (popovers, dropdown menus, dialogs, selects,
 * tooltips, sheets, and toasts) that can be opened from inside the sidebar.
 * Interactions inside these surfaces must not be treated as outside clicks that
 * collapse the mobile sidebar drawer.
 */
export const SIDEBAR_OVERLAY_TARGET_SELECTOR = [
  "[data-radix-portal]",
  "[data-radix-popper-content-wrapper]",
  '[data-slot="popover-content"]',
  '[data-slot="dialog-content"]',
  '[data-slot="dialog-overlay"]',
  '[data-slot="alert-dialog-content"]',
  '[data-slot="alert-dialog-overlay"]',
  '[data-slot="sheet-content"]',
  '[data-slot="sheet-overlay"]',
  '[data-slot="tooltip-content"]',
  '[role="menu"]',
  '[role="listbox"]',
  '[role="dialog"]',
  '[role="alertdialog"]',
  '[role="combobox"]',
  "[data-sonner-toaster]",
  "[data-sonner-toast]",
].join(", ");

export const OPEN_SIDEBAR_OVERLAY_SELECTOR = [
  '[data-slot="popover-content"][data-state="open"]',
  '[data-slot="dialog-content"][data-state="open"]',
  '[data-slot="alert-dialog-content"][data-state="open"]',
  '[data-slot="sheet-content"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
].join(", ");

function toElement(target: EventTarget | null): Element | null {
  if (!target || typeof target !== "object") return null;
  if ("closest" in target && typeof target.closest === "function") {
    return target as Element;
  }
  if ("parentElement" in target) {
    return (target as Node).parentElement;
  }
  return null;
}

export function isSidebarOverlayTarget(target: EventTarget | null): boolean {
  return Boolean(toElement(target)?.closest(SIDEBAR_OVERLAY_TARGET_SELECTOR));
}

export function hasOpenSidebarOverlay(
  doc: Pick<Document, "querySelector"> | null = typeof document !== "undefined" ? document : null,
): boolean {
  return Boolean(doc?.querySelector(OPEN_SIDEBAR_OVERLAY_SELECTOR));
}

let suppressOutsideDismissUntil = 0;

export function markSidebarOverlayGesture(now = Date.now(), ttlMs = 400): void {
  suppressOutsideDismissUntil = Math.max(suppressOutsideDismissUntil, now + ttlMs);
}

export function resetSidebarOverlayGesture(): void {
  suppressOutsideDismissUntil = 0;
}

export function isSidebarOverlayGestureActive(now = Date.now()): boolean {
  return now < suppressOutsideDismissUntil;
}

export function syncSidebarOverlayGesture(
  target: EventTarget | null,
  doc: Pick<Document, "querySelector"> | null = typeof document !== "undefined" ? document : null,
  now = Date.now(),
): boolean {
  if (isSidebarOverlayTarget(target) || hasOpenSidebarOverlay(doc)) {
    markSidebarOverlayGesture(now);
    return true;
  }
  resetSidebarOverlayGesture();
  return false;
}
