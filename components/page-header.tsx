"use client";

import { useEffect, type ReactNode, type ComponentType } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMobileNav } from "@/components/mobile-nav-context";

export type PageHeaderProps = {
  title: ReactNode;
  /**
   * @deprecated Header descriptions have been removed to keep page headers compact and clean.
   */
  description?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  divider?: boolean;
  className?: string;
};

export function PageHeader({
  title,
  icon: Icon,
  actions,
  backHref,
  backLabel,
  divider = true,
  className,
}: PageHeaderProps) {
  const mobileNav = useMobileNav();

  useEffect(() => {
    if (mobileNav) {
      mobileNav.setTitle(title);
      mobileNav.setBackHref(backHref ?? null);
    }
  }, [mobileNav, title, backHref]);

  const hasExtraOnMobile = Boolean(backHref || actions);

  return (
    <header
      className={cn(
        "flex w-full min-w-0 flex-col items-stretch text-left",
        // When managed by MobileNav, divider/spacing on mobile applies only if extra mobile controls exist
        mobileNav
          ? cn(
              divider && "md:border-b md:border-border md:pb-2.5 md:mb-3.5",
              hasExtraOnMobile && divider && "border-b border-border pb-2 mb-3"
            )
          : cn(divider && "border-b border-border pb-2.5 mb-3.5"),
        className
      )}
    >
      {/* Desktop view (md and up) or unmanaged view */}
      <div className={cn("w-full min-w-0 flex-col items-stretch gap-2", mobileNav ? "hidden md:flex" : "flex")}>
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex w-fit items-center gap-1.5 text-body-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {backLabel ?? "Kembali"}
          </Link>
        )}
        <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {Icon && (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                <Icon className="size-4" aria-hidden />
              </span>
            )}
            <h1 className="font-heading text-h5 font-bold tracking-tight text-foreground leading-none">
              {title}
            </h1>
          </div>
          {actions && (
            <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      </div>

      {/* Mobile view when managed by MobileNav: only render secondary controls / actions */}
      {mobileNav && hasExtraOnMobile && (
        <div className="flex md:hidden w-full min-w-0 flex-wrap items-center justify-between gap-2">
          {backHref && (
            <Link
              href={backHref}
              className="inline-flex w-fit items-center gap-1.5 text-body-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" aria-hidden />
              {backLabel ?? "Kembali"}
            </Link>
          )}
          {actions && (
            <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2 ml-auto">
              {actions}
            </div>
          )}
        </div>
      )}
    </header>
  );
}
