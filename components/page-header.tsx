import type { ReactNode, ComponentType } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

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
  const hasMobileControls = Boolean(backHref || actions);

  return (
    <>
      <h1 className="sr-only md:hidden">{title}</h1>

      <header
        className={cn(
          "w-full min-w-0 flex-col items-stretch gap-2 text-left",
          hasMobileControls ? "flex mb-3 md:mb-0" : "hidden md:flex",
          divider && "md:border-b md:border-border md:pb-2.5 md:mb-3.5",
          className,
        )}
      >
        {backHref && (
          <Link
            href={backHref}
            className="inline-flex w-fit shrink-0 items-center gap-1.5 text-body-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            {backLabel ?? "Kembali"}
          </Link>
        )}

        <div
          className={cn(
            "w-full min-w-0 flex-wrap items-center justify-between gap-2 md:flex md:gap-3",
            actions ? "flex" : "hidden",
          )}
        >
          <div className="hidden min-w-0 items-center gap-2.5 md:flex">
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
            <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2 md:shrink-0">
              {actions}
            </div>
          )}
        </div>
      </header>
    </>
  );
}
