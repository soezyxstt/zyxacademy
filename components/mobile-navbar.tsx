"use client";

import { usePathname } from "next/navigation";
import { Menu, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileNav, getRouteTitle } from "@/components/mobile-nav-context";
import { openMobileSidebar } from "@/components/sidebar-shell";
import { useCommandMenu } from "@/components/command-menu";

export type MobileNavbarProps = {
  surface?: "admin" | "student" | "tutor";
  className?: string;
};

export function MobileNavbar({ surface, className }: MobileNavbarProps) {
  const pathname = usePathname();
  const mobileNav = useMobileNav();
  const { setOpen: setSearchOpen } = useCommandMenu();

  const fallbackTitle = getRouteTitle(pathname, surface);
  const displayTitle = mobileNav?.title ?? fallbackTitle;

  return (
    <header
      className={cn(
        "sticky top-0 z-30 flex h-13 w-full shrink-0 items-center justify-between gap-2.5 border-b border-border/80 bg-background/95 px-3 backdrop-blur-md transition-colors md:hidden sm:px-4",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <button
          type="button"
          onClick={openMobileSidebar}
          aria-label="Buka navigasi"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground active:scale-95 cursor-pointer"
        >
          <Menu className="size-4.5" />
        </button>

        <h1 className="font-heading text-body-base font-bold tracking-tight text-foreground truncate min-w-0 flex-1 leading-tight">
          {displayTitle}
        </h1>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Cari"
          className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground active:scale-95 cursor-pointer"
        >
          <Search className="size-4" />
        </button>
      </div>
    </header>
  );
}
