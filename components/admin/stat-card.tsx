import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatTone = "default" | "brand" | "brand-secondary" | "info" | "success" | "warning" | "error";

const toneClasses: Record<StatTone, string> = {
  default: "text-foreground",
  brand: "text-brand-primary",
  "brand-secondary": "text-brand-secondary",
  info: "text-status-info",
  success: "text-status-success",
  warning: "text-status-warning",
  error: "text-status-error",
};

/* ------------------------------------------------------------------ */
/*  AdminStatCard  (legacy standalone card, kept for untouched callers) */
/* ------------------------------------------------------------------ */

export type AdminStatCardProps = {
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  tone?: StatTone;
  size?: "sm" | "md";
  className?: string;
};

export function AdminStatCard({
  label,
  value,
  caption,
  icon: Icon,
  iconClassName,
  tone = "default",
  className,
}: AdminStatCardProps) {
  return (
    <div
      className={cn(
        "inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 py-1 text-body-xs",
        className
      )}
    >
      {Icon && <Icon className={cn("size-3.5 shrink-0 text-muted-foreground/70", iconClassName)} aria-hidden />}
      <span className="min-w-0 text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 font-semibold tabular-nums", toneClasses[tone])}>
        {value}
      </span>
      {caption && <span className="text-body-2xs text-muted-foreground/80">({caption})</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AdminStatStrip  (minimal key-value list / inline metadata strip)  */
/* ------------------------------------------------------------------ */

export type AdminStatStripItemProps = {
  label: ReactNode;
  value: ReactNode;
  caption?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  iconClassName?: string;
  tone?: StatTone;
  compact?: boolean;
};

export type AdminStatStripProps = {
  children: ReactNode;
  className?: string;
};

export function AdminStatStrip({ children, className }: AdminStatStripProps) {
  return (
    <dl
      className={cn(
        "flex flex-col divide-y divide-border/40 border-y border-border/40 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-6 sm:gap-y-1.5 sm:divide-y-0 sm:py-2",
        className
      )}
    >
      {children}
    </dl>
  );
}

export function AdminStatStripItem({
  label,
  value,
  caption,
  icon: Icon,
  iconClassName,
  tone = "default",
}: AdminStatStripItemProps) {
  return (
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5 sm:inline-flex sm:justify-start sm:gap-x-1.5 sm:py-0">
      <dt className="flex min-w-0 items-center gap-1.5 text-body-xs text-muted-foreground">
        {Icon && <Icon className={cn("size-3.5 shrink-0 text-muted-foreground/75", iconClassName)} aria-hidden />}
        <span className="min-w-0 wrap-break-word">{label}</span>
      </dt>
      <dd className="flex min-w-0 flex-wrap items-baseline justify-end gap-x-1.5 text-right sm:justify-start sm:text-left">
        <span className={cn("wrap-break-word text-body-sm font-semibold tabular-nums", toneClasses[tone])}>
          {value}
        </span>
        {caption && <span className="wrap-break-word text-body-xs text-muted-foreground">({caption})</span>}
      </dd>
    </div>
  );
}
