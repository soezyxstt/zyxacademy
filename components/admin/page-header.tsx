import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type AdminPageHeaderProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
};

export function AdminPageHeader({
  title,
  description,
  icon: Icon,
  actions,
  backHref,
  backLabel,
  className,
}: AdminPageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-5", className)}>
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-1.5 text-body-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {backLabel ?? "Kembali"}
        </Link>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          {Icon && (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
              <Icon className="size-5" aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="font-heading text-h4 font-bold tracking-tight text-foreground leading-tight">
              {title}
            </h1>
            {description && (
              <p className="mt-1.5 text-body-sm leading-normal text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
      </div>
      <div className="border-b border-border" aria-hidden />
    </header>
  );
}
