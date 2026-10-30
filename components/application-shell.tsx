import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PageOrnaments } from "@/components/ui/page-ornaments";
import { PageTransition } from "@/components/ui/page-transition";
import { MobileSidebarController } from "@/components/mobile-sidebar-controller";

export interface ApplicationShellProps {
  sidebar?: ReactNode;
  mobileNavigation?: ReactNode;
  children: ReactNode;
  overlays?: ReactNode;
  ornamentsVariant?: "testimonial" | "plans" | "about";
  showOrnaments?: boolean;
  className?: string;
  mainClassName?: string;
}

export function ApplicationShell({
  sidebar,
  mobileNavigation,
  children,
  overlays,
  ornamentsVariant = "about",
  showOrnaments = true,
  className,
  mainClassName,
}: ApplicationShellProps) {
  return (
    <div
      className={cn(
        "relative flex min-h-screen flex-col overflow-x-clip bg-background md:flex-row",
        className,
      )}
    >
      <MobileSidebarController />
      {showOrnaments && (
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-30">
          <PageOrnaments variant={ornamentsVariant} />
        </div>
      )}
      {sidebar}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        {mobileNavigation}
        <main
          id="main-content"
          tabIndex={-1}
          className={cn("relative min-w-0 flex-1 focus:outline-none", mainClassName)}
        >
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
      {overlays}
    </div>
  );
}
