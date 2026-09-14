"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSwipe } from "@/hooks/use-swipe";

const MOBILE_QUERY = "(max-width: 767px)";
const SIDEBAR_SELECTOR = "aside.fixed.inset-y-0.left-0";

function getSidebar(): HTMLElement | null {
  return document.querySelector<HTMLElement>(SIDEBAR_SELECTOR);
}

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.matchMedia(MOBILE_QUERY).matches;
}

function setSidebarOpen(open: boolean) {
  if (!isMobileViewport()) return;
  const sidebar = getSidebar();
  if (!sidebar) return;
  sidebar.style.translate = open ? "0 0" : "-100% 0";
  sidebar.setAttribute("aria-hidden", open ? "false" : "true");
}

/**
 * Compatibility controller for the shared sidebar shell.
 *
 * The shell historically coupled its mobile position to a JS `innerWidth`
 * flag while the hamburger visibility is controlled by CSS breakpoints. On
 * some mobile/webview layouts those two sources disagree, leaving both the
 * hamburger event and edge swipe unable to reveal the drawer. This controller
 * uses the same CSS breakpoint as the UI and guarantees the drawer translate,
 * while the existing SidebarShell state continues to own its normal rendering.
 */
export function MobileSidebarController() {
  const pathname = usePathname();
  const openRef = useRef(false);

  const open = () => {
    if (!isMobileViewport()) return;
    openRef.current = true;
    setSidebarOpen(true);
  };

  const close = () => {
    openRef.current = false;
    if (typeof document === "undefined") return;
    const sidebar = getSidebar();
    if (sidebar && isMobileViewport()) {
      sidebar.style.translate = "-100% 0";
      sidebar.setAttribute("aria-hidden", "true");
    }
  };

  useSwipe({
    onSwipeRight: (startX) => {
      if (!isMobileViewport()) return;
      const edge = Math.max(60, window.innerWidth * 0.15);
      if (!openRef.current && startX <= edge) {
        open();
        window.dispatchEvent(new CustomEvent("zyx:open-mobile-sidebar"));
      }
    },
    onSwipeLeft: () => {
      if (!isMobileViewport() || !openRef.current) return;
      close();
      window.dispatchEvent(new CustomEvent("zyx:close-mobile-sidebar"));
    },
  });

  useEffect(() => {
    const handleOpen = () => open();
    const handleClose = () => close();
    const handleToggle = () => (openRef.current ? close() : open());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && openRef.current) {
        close();
        window.dispatchEvent(new CustomEvent("zyx:close-mobile-sidebar"));
      }
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (!openRef.current || !isMobileViewport()) return;
      const sidebar = getSidebar();
      const target = event.target as Node | null;
      if (sidebar && target && !sidebar.contains(target)) {
        close();
        window.dispatchEvent(new CustomEvent("zyx:close-mobile-sidebar"));
      }
    };
    const handleClick = (event: MouseEvent) => {
      if (!openRef.current) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest(`${SIDEBAR_SELECTOR} a`)) {
        close();
        window.dispatchEvent(new CustomEvent("zyx:close-mobile-sidebar"));
      }
    };
    const media = window.matchMedia(MOBILE_QUERY);
    const handleViewportChange = () => {
      const sidebar = getSidebar();
      if (!media.matches && sidebar) {
        openRef.current = false;
        sidebar.style.translate = "";
        sidebar.removeAttribute("aria-hidden");
      } else if (media.matches && sidebar && !openRef.current) {
        sidebar.style.translate = "-100% 0";
        sidebar.setAttribute("aria-hidden", "true");
      }
    };

    window.addEventListener("zyx:open-mobile-sidebar", handleOpen);
    window.addEventListener("zyx:close-mobile-sidebar", handleClose);
    window.addEventListener("zyx:toggle-mobile-sidebar", handleToggle);
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("click", handleClick);
    media.addEventListener("change", handleViewportChange);
    handleViewportChange();

    return () => {
      window.removeEventListener("zyx:open-mobile-sidebar", handleOpen);
      window.removeEventListener("zyx:close-mobile-sidebar", handleClose);
      window.removeEventListener("zyx:toggle-mobile-sidebar", handleToggle);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("click", handleClick);
      media.removeEventListener("change", handleViewportChange);
    };
  }, []);

  useEffect(() => {
    close();
  }, [pathname]);

  return null;
}
