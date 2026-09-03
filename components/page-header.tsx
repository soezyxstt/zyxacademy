import type { ReactNode, ComponentType } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileSidebarTrigger } from "@/components/mobile-sidebar-trigger";

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
  return (
    <header
      className={cn(
        "flex w-full min-w-0 flex-col items-stretch gap-2 text-left",
        divider && "border-b border-border pb-2.5 mb-3.5",
        className,
      )}
    >
      {/* Desktop view: exact original header */}
      <div className="hidden md:flex w-full min-w-0 flex-col items-stretch gap-2">
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

      {/* Mobile view: simple mobile navbar with 3-line hamburger icon and compact truncated header */}
      <div className="flex md:hidden w-full min-w-0 flex-col gap-2">
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex w-fit items-center gap-1.5 text-body-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {backLabel ?? "Kembali"}
          </Link>
        )}
        <div className="flex w-full min-w-0 items-center justify-between gap-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <MobileSidebarTrigger />
            {Icon && (
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary">
                <Icon className="size-3.5" aria-hidden />
              </span>
            )}
            <h1 className="font-heading text-body-base font-bold text-foreground truncate min-w-0 flex-1 leading-tight">
              {title}
            </h1>
          </div>
          {actions && (
            <div className="flex shrink-0 items-center gap-1.5">
              {actions}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
