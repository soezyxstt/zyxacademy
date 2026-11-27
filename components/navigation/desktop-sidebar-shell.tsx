"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { useCommandMenu } from "@/components/command-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AppUpdateControl } from "@/components/native/app-update-control";
import { StudentAccountBoundary } from "@/components/student-account-boundary";
import { SidebarAccountMenu } from "@/components/auth/sidebar-account-menu";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useTranslations } from "@/lib/i18n/client";
import { isMaterialReaderPathname } from "@/lib/materials/reader-layout";
import { SidebarTooltip } from "@/components/sidebar-shell";
import { useViewportMode } from "@/hooks/use-viewport-mode";

export interface DesktopSidebarShellProps {
  collapsedKey: string;
  logoHref: string;
  logoLabel: string;
  nav: (collapsed: boolean) => ReactNode;
  headerActions?: (collapsed: boolean) => ReactNode;
  topSection?: (collapsed: boolean) => ReactNode;
  bottomSection?: (collapsed: boolean) => ReactNode;
  showAccountTools?: boolean;
  defaultCollapsed?: boolean;
  className?: string;
}

function DesktopSidebarUserMenu({ collapsed }: { collapsed: boolean }) {
  return (
    <StudentAccountBoundary>
      {({ data }) =>
        data?.user ? <SidebarAccountMenu collapsed={collapsed} session={data} /> : null
      }
    </StudentAccountBoundary>
  );
}

/**
 * Desktop-only sidebar shell (hidden md:flex) without any mobile drawer,
 * backdrop, swipe gestures, or mobile sidebar window listeners.
 */
export function DesktopSidebarShell({
  collapsedKey,
  logoHref,
  logoLabel,
  nav,
  headerActions,
  topSection,
  bottomSection,
  showAccountTools = true,
  defaultCollapsed = false,
  className,
}: DesktopSidebarShellProps) {
  const t = useTranslations("common");
  const actualPathname = usePathname();
  const experience = useStudentExperience();
  const pathname = experience.pathname ?? actualPathname;
  const { setOpen: setSearchOpen } = useCommandMenu();
  const viewportMode = useViewportMode();

  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [mounted, setMounted] = useState(false);
  const [modKeyHint, setModKeyHint] = useState("Ctrl + K");
  const isMaterialReaderRoute = isMaterialReaderPathname(pathname);
  const [readerCollapsed, setReaderCollapsed] = useState(isMaterialReaderRoute);

  useEffect(() => {
    setMounted(true);
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    setModKeyHint(/Mac|iPhone|iPod|iPad/i.test(ua) ? "\u2318K" : "Ctrl + K");

    try {
      const stored = window.localStorage.getItem(collapsedKey);
      if (stored !== null) {
        setCollapsed(stored === "true");
      }
    } catch {
      // Ignore storage access errors in restricted contexts.
    }
  }, [collapsedKey]);

  useEffect(() => {
    setReaderCollapsed(isMaterialReaderRoute);
  }, [isMaterialReaderRoute, pathname]);

  const isCollapsed = readerCollapsed || collapsed;

  const toggleCollapsed = useCallback(() => {
    if (readerCollapsed) {
      setReaderCollapsed(false);
      return;
    }
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(collapsedKey, String(next));
      } catch {
        // Ignore storage write errors.
      }
      return next;
    });
  }, [collapsedKey, readerCollapsed]);

  if (viewportMode === "mobile") {
    return null;
  }

  return (
    <aside
      data-desktop-sidebar=""
      data-sidebar-ready={mounted ? "true" : undefined}
      style={{ top: 0, height: "100svh" }}
      className={cn(
        "hidden shrink-0 flex-col overflow-hidden border-r border-border bg-card transition-[width] duration-300 ease-in-out md:sticky md:top-0 md:z-30 md:flex md:self-start",
        isCollapsed ? "md:w-[64px]" : "md:w-[248px]",
        className
      )}
    >
      <div
        className={cn(
          "flex h-12 shrink-0 items-center gap-1 border-b border-border/60",
          isCollapsed ? "justify-center px-1.5" : "px-3"
        )}
      >
        {!isCollapsed ? (
          <>
            <Link
              href={logoHref}
              aria-label={logoLabel}
              className="flex min-w-0 flex-1 items-center"
            >
              <Logo variant="symbol" className="[--logo-height:1.25rem]" />
            </Link>

            {headerActions?.(false)}

            {showAccountTools && <NotificationBell variant="sidebar" />}
            <AppUpdateControl variant="sidebar" />

            {showAccountTools && (
              <SidebarTooltip
                label={t("searchWithShortcut", { shortcut: modKeyHint })}
                collapsed={false}
              >
                <button
                  type="button"
                  data-tour="search"
                  onClick={() => setSearchOpen(true)}
                  aria-label={t("searchWithShortcut", { shortcut: modKeyHint })}
                  className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Search className="size-4" />
                </button>
              </SidebarTooltip>
            )}

            <SidebarTooltip label={t("closeSidebar")} collapsed={false}>
              <button
                type="button"
                onClick={toggleCollapsed}
                aria-label={t("closeSidebar")}
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PanelLeftClose className="size-4" />
              </button>
            </SidebarTooltip>
          </>
        ) : (
          <SidebarTooltip label={t("openSidebar")} collapsed={true}>
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={t("openSidebar")}
              className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          </SidebarTooltip>
        )}
      </div>

      {topSection?.(isCollapsed)}

      {isCollapsed && (showAccountTools || headerActions) && (
        <div className="flex shrink-0 flex-col items-center gap-1 border-b border-border/60 px-1 py-1.5">
          {showAccountTools && (
            <SidebarTooltip
              label={t("searchWithShortcut", { shortcut: modKeyHint })}
              collapsed={true}
            >
              <button
                type="button"
                data-tour="search"
                  onClick={() => setSearchOpen(true)}
                aria-label={t("searchWithShortcut", { shortcut: modKeyHint })}
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Search className="size-4" />
              </button>
            </SidebarTooltip>
          )}
          {headerActions?.(true)}
        </div>
      )}

      {nav(isCollapsed)}

      {bottomSection?.(isCollapsed)}

      <div
        className={cn(
          "shrink-0 border-t border-border/70 bg-card/50 p-2",
          isCollapsed && "flex justify-center p-1.5"
        )}
      >
        {showAccountTools && <DesktopSidebarUserMenu collapsed={isCollapsed} />}
      </div>
    </aside>
  );
}
