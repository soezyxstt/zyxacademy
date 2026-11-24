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
/*  AdminStatStrip  (grouped metrics on the page surface)             */
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
    <div
      className={cn(
        "grid grid-cols-2 gap-x-(--related-gap) gap-y-(--compact-gap) border-b border-border/40 pb-(--compact-gap) sm:grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))]",
        className
      )}
    >
      {children}
    </div>
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
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex min-w-0 items-start gap-1.5 text-body-sm text-muted-foreground">
        {Icon && <Icon className={cn("mt-0.5 size-3.5 shrink-0", iconClassName)} aria-hidden />}
        <span className="min-w-0 wrap-break-word">{label}</span>
      </div>
      <div className={cn("wrap-break-word font-heading text-h5 font-bold tabular-nums", toneClasses[tone])}>
        {value}
      </div>
      {caption && <div className="wrap-break-word text-body-xs text-muted-foreground">{caption}</div>}
    </div>
  );
}
