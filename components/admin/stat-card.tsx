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
        "bg-card border border-border rounded-xl shadow-sm space-y-1",
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
