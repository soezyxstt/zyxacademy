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
/*  AdminStatStrip  (compact inline metadata bar, zero stat cards)     */
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
        "flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-border/40 pb-3.5",
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
    <div className="inline-flex min-w-0 items-center gap-1.5 text-body-xs">
      {Icon && <Icon className={cn("size-3.5 shrink-0 text-muted-foreground/70", iconClassName)} aria-hidden />}
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular-nums", toneClasses[tone])}>
        {value}
      </span>
      {caption && <span className="text-body-2xs text-muted-foreground/80">({caption})</span>}
    </div>
  );
}
