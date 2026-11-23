"use client";

import type { ElementType } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { useMobileChrome } from "@/components/navigation/mobile-chrome-context";

export interface MobileBottomNavItem {
  id: string;
  label: string;
  icon: ElementType;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  badgeCount?: number;
  badgeDot?: boolean;
  badgeLabel?: string;
  prefetch?: boolean;
}

export interface MobileBottomNavProps {
  items: MobileBottomNavItem[];
  ariaLabel?: string;
  hidden?: boolean;
  className?: string;
}

const GRID_COLS_CLASS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
};

/**
 * Shared mobile bottom navigation bar (4 to 5 items).
 * Automatically unmounts when MobileChromeContext.hideBottomNav is true
 * so CSS --mobile-bottom-nav-height collapses to 0px.
 */
export function MobileBottomNav({
  items,
  ariaLabel = "Navigasi utama",
  hidden = false,
  className,
}: MobileBottomNavProps) {
  const { hideBottomNav } = useMobileChrome();

  if (hidden || hideBottomNav || items.length === 0) {
    return null;
  }

  const visibleItems = items.slice(0, 5);
  const gridColsClass = GRID_COLS_CLASS[visibleItems.length] ?? "grid-cols-5";

  return (
    <nav
      aria-label={ariaLabel}
      data-mobile-bottom-nav=""
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 bg-gradient-to-t from-background via-background/95 to-background/0 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur-md md:hidden",
        className
      )}
    >
      <div className={cn("grid h-15 w-full items-center gap-1 px-2", gridColsClass)}>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive = Boolean(item.active);
          const hasCount =
            typeof item.badgeCount === "number" && item.badgeCount > 0;
          const badgeText =
            hasCount && item.badgeCount! > 99 ? "99+" : String(item.badgeCount ?? "");

          const itemClass = cn(
            "relative flex min-h-[48px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-2xl px-1 text-center transition-all duration-150 active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            isActive
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          );

          const innerContent = (
            <>
              <span className="relative flex items-center justify-center">
                <Icon className="size-5 shrink-0" aria-hidden="true" />
                {hasCount ? (
                  <span
                    aria-label={item.badgeLabel}
                    className="pointer-events-none absolute -top-1.5 -right-2.5 flex h-4 min-w-4 items-center justify-center rounded-md bg-destructive px-1 text-body-2xs font-medium leading-none text-white"
                  >
                    {badgeText}
                  </span>
                ) : item.badgeDot ? (
                  <span
                    aria-label={item.badgeLabel}
                    className="pointer-events-none absolute -top-0.5 -right-1 size-2 rounded-full bg-destructive"
                  />
                ) : null}
              </span>
              <span className="max-w-full truncate text-body-2xs font-medium leading-none">
                {item.label}
              </span>
            </>
          );

          if (item.href) {
            return (
              <Link
                key={item.id}
                href={item.href}
                prefetch={item.prefetch}
                onClick={item.onClick}
                aria-current={isActive ? "page" : undefined}
                className={itemClass}
              >
                {innerContent}
              </Link>
            );
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              aria-current={isActive ? "page" : undefined}
              className={cn(itemClass, "cursor-pointer")}
            >
              {innerContent}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
