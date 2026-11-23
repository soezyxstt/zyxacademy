"use client";

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useMobileChrome } from "@/components/navigation/mobile-chrome-context";

export interface MobileTopNavbarProps {
  title?: string;
  subtitle?: string;
  logoHref?: string;
  logoLabel?: string;
  backHref?: string;
  onBack?: () => void;
  backLabel?: string;
  leftSlot?: ReactNode;
  pageActions?: ReactNode;
  rightActions?: ReactNode;
  className?: string;
}

export interface MobileTopNavActionButtonProps
  extends ComponentPropsWithoutRef<"button"> {
  label: string;
}

export const MOBILE_TOP_NAV_ICON_BUTTON_CLASS =
  "relative size-9 shrink-0 rounded-xl border-border/60 bg-card/85 text-muted-foreground shadow-xs backdrop-blur-md transition-all duration-150 hover:border-border hover:bg-muted/85 hover:text-foreground active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 after:absolute after:-inset-1 after:content-['']";

export function MobileTopNavActionButton({
  label,
  className,
  children,
  type = "button",
  ...props
}: MobileTopNavActionButtonProps) {
  return (
    <Button
      type={type}
      variant="outline"
      size="icon-lg"
      aria-label={label}
      className={cn(MOBILE_TOP_NAV_ICON_BUTTON_CLASS, className)}
      {...props}
    >
      {children}
    </Button>
  );
}

/**
 * Shared mobile top navigation bar without hamburger menu triggers.
 * Supports declarative route overrides through MobileChromeContext.
 */
export function MobileTopNavbar({
  title = "",
  subtitle,
  logoHref,
  logoLabel = "Zyx",
  backHref,
  onBack,
  backLabel = "Kembali",
  leftSlot,
  pageActions,
  rightActions,
  className,
}: MobileTopNavbarProps) {
  const { topNav } = useMobileChrome();

  if (topNav.hideTopNav) {
    return null;
  }

  const resolvedTitle = topNav.title ?? title;
  const resolvedSubtitle = topNav.subtitle ?? subtitle;
  const resolvedBackLabel = topNav.backLabel ?? backLabel;
  const resolvedFallbackBackLabel = topNav.fallbackBackLabel ?? backLabel;
  const resolvedPageActions = topNav.pageActions ?? pageActions;
  const resolvedRightActions = topNav.rightActions ?? rightActions;

  let leftContent: ReactNode = null;
  if (topNav.leftSlot) {
    leftContent = topNav.leftSlot;
  } else if (topNav.onBack) {
    leftContent = (
      <MobileTopNavActionButton
        data-mobile-back-button=""
        label={resolvedBackLabel}
        onClick={topNav.onBack}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
      </MobileTopNavActionButton>
    );
  } else if (topNav.backHref) {
    leftContent = (
      <Button
        asChild
        variant="outline"
        size="icon-lg"
        className={MOBILE_TOP_NAV_ICON_BUTTON_CLASS}
      >
        <Link
          href={topNav.backHref}
          data-mobile-back-button=""
          aria-label={resolvedBackLabel}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    );
  } else if (leftSlot) {
    leftContent = leftSlot;
  } else if (onBack) {
    leftContent = (
      <MobileTopNavActionButton
        data-mobile-back-button=""
        label={resolvedBackLabel}
        onClick={onBack}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
      </MobileTopNavActionButton>
    );
  } else if (backHref) {
    leftContent = (
      <Button
        asChild
        variant="outline"
        size="icon-lg"
        className={MOBILE_TOP_NAV_ICON_BUTTON_CLASS}
      >
        <Link
          href={backHref}
          data-mobile-back-button=""
          aria-label={resolvedBackLabel}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    );
  } else if (topNav.fallbackBackHref) {
    leftContent = (
      <Button
        asChild
        variant="outline"
        size="icon-lg"
        className={MOBILE_TOP_NAV_ICON_BUTTON_CLASS}
      >
        <Link
          href={topNav.fallbackBackHref}
          data-mobile-back-button=""
          aria-label={resolvedFallbackBackLabel}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    );
  } else if (logoHref) {
    leftContent = (
      <Link
        href={logoHref}
        aria-label={logoLabel}
        className="relative flex size-9 shrink-0 items-center justify-center rounded-xl transition-opacity hover:opacity-85 focus-visible:outline-[2px] focus-visible:outline-[var(--zx-accent)] after:absolute after:-inset-1 after:content-['']"
      >
        <Logo variant="symbol" className="[--logo-height:1.25rem]" />
      </Link>
    );
  }

  return (
    <header
      data-mobile-navbar=""
      className={cn(
        "sticky top-0 z-30 w-full max-w-full shrink-0 bg-gradient-to-b from-background via-background/85 to-background/0 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md md:hidden",
        className
      )}
    >
      <div className="flex h-13 w-full max-w-full items-center justify-between gap-2 overflow-hidden px-3 sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
          {leftContent}
          {resolvedTitle ? (
            <div className="flex min-w-0 flex-1 flex-col justify-center overflow-hidden text-left">
              <span
                title={resolvedTitle}
                className="block min-w-0 truncate font-heading text-body-sm font-semibold leading-tight tracking-tight text-foreground"
              >
                {resolvedTitle}
              </span>
              {resolvedSubtitle ? (
                <span
                  title={resolvedSubtitle}
                  data-mobile-navbar-subtitle=""
                  className="block min-w-0 truncate text-body-2xs font-medium leading-tight text-muted-foreground"
                >
                  {resolvedSubtitle}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        {resolvedPageActions || resolvedRightActions ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {resolvedPageActions ? (
              <div data-mobile-navbar-page-actions="" className="flex shrink-0 items-center gap-1.5">
                {resolvedPageActions}
              </div>
            ) : null}
            {resolvedRightActions}
          </div>
        ) : null}
      </div>
    </header>
  );
}
