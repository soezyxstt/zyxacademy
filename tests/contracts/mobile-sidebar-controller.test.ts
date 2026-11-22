import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  hasOpenSidebarOverlay,
  isSidebarOverlayTarget,
  OPEN_SIDEBAR_OVERLAY_SELECTOR,
  SIDEBAR_OVERLAY_TARGET_SELECTOR,
} from "@/lib/sidebar-overlay";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

function makeElement(matchedSelector: string | null) {
  return {
    closest(selector: string) {
      if (!matchedSelector) return null;
      return selector.includes(matchedSelector) ? {} : null;
    },
  } as unknown as Element;
}

describe("mobile sidebar controller contract", () => {
  test("application shell always installs the mobile controller", () => {
    const shell = source("components/application-shell.tsx");
    expect(shell).toContain("MobileSidebarController");
  });

  test("hamburger events and edge swipes share the same open/close channel", () => {
    const controller = source("components/mobile-sidebar-controller.tsx");
    const navbar = source("components/mobile-navbar.tsx");

    expect(navbar).toContain("openMobileSidebar");
    expect(controller).toContain("zyx:open-mobile-sidebar");
    expect(controller).toContain("zyx:close-mobile-sidebar");
    expect(controller).toContain("onSwipeRight");
    expect(controller).toContain("onSwipeLeft");
    expect(controller).toContain("(max-width: 767px)");
  });

  test("mobile drawer overrides Tailwind v4 translate instead of transform", () => {
    const sidebar = source("components/sidebar-shell.tsx");
    const controller = source("components/mobile-sidebar-controller.tsx");

    expect(sidebar).toContain('translate: mobileOpen ? "0 0" : "-100% 0"');
    expect(sidebar).toContain('transition-[translate,width]');
    expect(controller).toContain('sidebar.style.translate = open ? "0 0" : "-100% 0"');
    expect(controller).toContain('sidebar.style.translate = ""');
    expect(controller).not.toContain("sidebar.style.transform");
  });

  test("controller and shell both ignore interactions inside portaled sidebar overlays", () => {
    const sidebar = source("components/sidebar-shell.tsx");
    const controller = source("components/mobile-sidebar-controller.tsx");

    expect(controller).toContain("isSidebarOverlayTarget");
    expect(controller).toContain("hasOpenSidebarOverlay");
    expect(sidebar).toContain("isSidebarOverlayTarget");
    expect(sidebar).toContain("hasOpenSidebarOverlay");
  });

  test("isSidebarOverlayTarget recognizes popovers, menus, dialogs, toasts, and text nodes", () => {
    for (const selector of [
      "[data-radix-popper-content-wrapper]",
      '[data-slot="popover-content"]',
      '[data-slot="dialog-content"]',
      '[data-slot="dialog-overlay"]',
      '[role="menu"]',
      '[role="dialog"]',
      '[role="listbox"]',
      "[data-sonner-toast]",
    ]) {
      expect(SIDEBAR_OVERLAY_TARGET_SELECTOR).toContain(selector);
      expect(isSidebarOverlayTarget(makeElement(selector))).toBe(true);
    }

    const textNodeInsidePopover = {
      parentElement: makeElement('[data-slot="popover-content"]'),
    } as unknown as Node;
    expect(isSidebarOverlayTarget(textNodeInsidePopover)).toBe(true);

    expect(isSidebarOverlayTarget(makeElement(null))).toBe(false);
    expect(isSidebarOverlayTarget(null)).toBe(false);
  });

  test("hasOpenSidebarOverlay detects open Radix popovers, menus, and dialogs", () => {
    const openDoc = {
      querySelector(selector: string) {
        expect(selector).toBe(OPEN_SIDEBAR_OVERLAY_SELECTOR);
        return {} as Element;
      },
    };
    const closedDoc = {
      querySelector() {
        return null;
      },
    };

    expect(hasOpenSidebarOverlay(openDoc)).toBe(true);
    expect(hasOpenSidebarOverlay(closedDoc)).toBe(false);
    expect(hasOpenSidebarOverlay(null)).toBe(false);
  });
});

