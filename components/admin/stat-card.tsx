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
        "bg-card/70 border border-border/70 rounded-xl shadow-xs backdrop-blur-md space-y-1",
        size === "sm" ? "p-4" : "p-5",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 text-muted-foreground">
        <span className={cn("font-medium", size === "sm" ? "text-body-xs" : "text-body-sm")}>{label}</span>
        {Icon && <Icon className={cn("size-4 shrink-0", toneClasses[tone], iconClassName)} aria-hidden />}
      </div>
      <div className={cn("font-heading font-bold", size === "sm" ? "text-h5" : "text-h4", toneClasses[tone])}>
        {value}
      </div>
      {caption && <p className="text-body-xs text-muted-foreground">{caption}</p>}
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
        "grid grid-cols-2 gap-px border border-border/70 rounded-xl bg-border/60 backdrop-blur-md overflow-hidden",
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
  if (compact) {
    return (
      <div className="flex items-center justify-between gap-2 p-2.5 px-3.5 bg-card/75 backdrop-blur-md min-w-0">
        <div className="flex items-center gap-2 text-muted-foreground min-w-0">
          {Icon && <Icon className={cn("size-4 shrink-0", toneClasses[tone], iconClassName)} aria-hidden />}
          <span className="font-medium text-body-sm text-foreground truncate">{label}</span>
        </div>
        <div className={cn("font-heading font-bold text-body-base shrink-0", toneClasses[tone])}>
          {value}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-3.5 bg-card/75 backdrop-blur-md min-w-0">
      <div className="flex items-center justify-between gap-1.5 text-muted-foreground">
        <span className="font-medium text-body-sm truncate">{label}</span>
        {Icon && <Icon className={cn("size-3.5 shrink-0", toneClasses[tone], iconClassName)} aria-hidden />}
      </div>
      <div className={cn("font-heading font-bold text-h5 leading-tight", toneClasses[tone])}>
        {value}
      </div>
      {caption && <p className="text-body-xs text-muted-foreground truncate">{caption}</p>}
    </div>
  );
}
