import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { PageTransition } from "@/components/ui/page-transition";
import { MobileSidebarController } from "@/components/mobile-sidebar-controller";
import { MobileChromeProvider } from "@/components/navigation/mobile-chrome-context";

export interface ApplicationShellProps {
  sidebar?: ReactNode;
  mobileNavigation?: ReactNode;
  desktopSidebar?: ReactNode;
  mobileTopNav?: ReactNode;
  mobileBottomNav?: ReactNode;
  children: ReactNode;
  overlays?: ReactNode;
  ornamentsVariant?: "testimonial" | "plans" | "about";
  showOrnaments?: boolean;
  personalizeTypographyAndSpacing?: boolean;
  className?: string;
  mainClassName?: string;
}

export function ApplicationShell({
  sidebar,
  mobileNavigation,
  desktopSidebar,
  mobileTopNav,
  mobileBottomNav,
  children,
  overlays,
  ornamentsVariant = "about",
  showOrnaments = true,
  personalizeTypographyAndSpacing = false,
  className,
  mainClassName,
}: ApplicationShellProps) {
  const resolvedSidebar = desktopSidebar ?? sidebar;
  const resolvedMobileTopNav = mobileTopNav ?? mobileNavigation;
  const usesLegacyMobileDrawer =
    Boolean(sidebar || mobileNavigation) && !desktopSidebar && !mobileTopNav;

  return (
    <MobileChromeProvider hasTopNav={Boolean(resolvedMobileTopNav)}>
      <div
        data-personalized-surface={personalizeTypographyAndSpacing ? "" : undefined}
        className={cn(
          "relative flex min-h-screen flex-col overflow-x-clip bg-background md:flex-row",
          className,
        )}
      >
        {usesLegacyMobileDrawer && <MobileSidebarController />}
        {showOrnaments && (
          <div aria-hidden className="pointer-events-none absolute inset-0 opacity-30">
            <PageOrnaments variant={ornamentsVariant} />
          </div>
        )}
        {resolvedSidebar}
        <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-x-clip">
          {resolvedMobileTopNav}
          <main
            id="main-content"
            tabIndex={-1}
            className={cn("relative min-w-0 flex-1 focus:outline-none", mainClassName)}
          >
            <PageTransition>{children}</PageTransition>
          </main>
        </div>
        {mobileBottomNav}
        {overlays}
      </div>
    </MobileChromeProvider>
  );
}
