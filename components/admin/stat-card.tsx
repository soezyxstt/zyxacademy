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
  size = "md",
  className,
}: AdminStatCardProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-lg border border-border/70 bg-card/70 px-3 backdrop-blur-md",
        size === "sm" ? "min-h-9 py-1.5" : "min-h-11 py-2",
        className
      )}
    >
      {Icon && <Icon className={cn("size-3.5 shrink-0", toneClasses[tone], iconClassName)} aria-hidden />}
      <span className="min-w-0 truncate text-body-xs font-medium text-muted-foreground">{label}</span>
      <div className={cn("ml-auto shrink-0 font-heading text-body-base font-bold", toneClasses[tone])}>
        {value}
      </div>
      {caption && <span className="sr-only">{caption}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AdminStatStrip  (compact single-container KPI strip)               */
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
        "grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border/70 bg-border/60 backdrop-blur-md sm:grid-cols-2",
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
  compact,
}: AdminStatStripItemProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 bg-card/75 px-3 backdrop-blur-md",
        compact ? "min-h-9 py-1.5" : "min-h-11 py-2"
      )}
    >
      {Icon && <Icon className={cn("size-3.5 shrink-0", toneClasses[tone], iconClassName)} aria-hidden />}
      <span className="min-w-0 truncate text-body-xs font-medium text-muted-foreground">{label}</span>
      <div className={cn("ml-auto shrink-0 font-heading text-body-base font-bold", toneClasses[tone])}>
        {value}
      </div>
      {caption && <span className="sr-only">{caption}</span>}
    </div>
  );
}
