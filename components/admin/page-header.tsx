import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type AdminPageHeaderProps = {
  title: ReactNode;
  /**
   * @deprecated Header descriptions have been removed to keep admin page headers compact.
   */
  description?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
};

export function AdminPageHeader({
  title,
  icon: Icon,
  actions,
  backHref,
  backLabel,
  className,
}: AdminPageHeaderProps) {
  return (
    <header
      className={cn(
        "flex w-full min-w-0 flex-col items-stretch gap-2.5 border-b border-border pb-3 text-left",
        className,
      )}
    >
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
    </header>
  );
}

