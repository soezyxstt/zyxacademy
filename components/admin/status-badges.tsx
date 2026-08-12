import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type StatusTone = "muted" | "info" | "success" | "warning" | "error" | "brand";

const statusToneClasses: Record<StatusTone, string> = {
  muted: "bg-muted text-muted-foreground border border-border",
  info: "bg-status-info/10 text-status-info border border-status-info/20",
  success: "bg-status-success/10 text-status-success border border-status-success/20",
  warning: "bg-status-warning/10 text-status-warning border border-status-warning/20",
  error: "bg-status-error/10 text-status-error border border-status-error/20",
  brand: "bg-brand-primary/10 text-brand-primary border border-brand-primary/10",
};

export type StatusBadgeProps = {
  tone?: StatusTone;
  className?: string;
  children: ReactNode;
};

export function StatusBadge({ tone = "muted", className, children }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        statusToneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export type DifficultyBadgeProps = {
  difficulty: string | number;
  className?: string;
  title?: string;
  prefix?: string;
};

const difficultyTone: Record<string, StatusTone> = {
  easy: "success",
  medium: "warning",
  hard: "error",
};

export function DifficultyBadge({ difficulty, className, title, prefix }: DifficultyBadgeProps) {
  const normalized =
    typeof difficulty === "number"
      ? difficulty >= 3
        ? "hard"
        : difficulty === 2
          ? "medium"
          : "easy"
      : String(difficulty);
  const tone = difficultyTone[normalized] ?? "muted";
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border",
        statusToneClasses[tone],
        className
      )}
    >
      {prefix ? `${prefix}: ${normalized}` : normalized}
    </span>
  );
}

export type CourseBadgeProps = {
  className?: string;
  children: ReactNode;
};

export function CourseBadge({ className, children }: CourseBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-brand-primary/8 border border-brand-primary/10 text-brand-primary",
        className
      )}
    >
      {children}
    </span>
  );
}
