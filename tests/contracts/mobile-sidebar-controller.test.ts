import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

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
});
