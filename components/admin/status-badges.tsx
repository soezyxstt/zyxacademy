"use client";

import type { ReactNode } from "react";
import { useTranslations } from "@/lib/i18n/client";
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

const subtleStatusToneClasses: Record<StatusTone, string> = {
  muted: "bg-muted/35 text-muted-foreground border border-border/60",
  info: "bg-status-info/5 text-status-info/80 border border-status-info/10",
  success: "bg-status-success/5 text-status-success/80 border border-status-success/10",
  warning: "bg-status-warning/5 text-status-warning/80 border border-status-warning/10",
  error: "bg-status-error/5 text-status-error/80 border border-status-error/10",
  brand: "bg-brand-primary/5 text-brand-primary/80 border border-brand-primary/10",
};

const enumMessageKeys: Record<string, string> = {
  active: "active", inactive: "inactive", pending: "pending", approved: "approved",
  rejected: "rejected", published: "published", draft: "draft", failed: "failed",
  completed: "completed", processing: "processing", expired: "expired", cancelled: "cancelled",
  ready: "ready", stale: "stale", UP_TO_DATE: "upToDate", NEEDS_REVIEW: "needsReview",
};

export type StatusBadgeProps = {
  tone?: StatusTone;
  subtle?: boolean;
  className?: string;
  children: ReactNode;
};

export function StatusBadge({ tone = "muted", subtle = false, className, children }: StatusBadgeProps) {
  const t = useTranslations("admin.enums");
  const displayChildren = typeof children === "string" && enumMessageKeys[children]
    ? t(enumMessageKeys[children])
    : children;
  return (
    <span
      className={cn(
        subtle
          ? "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-normal"
          : "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        subtle ? subtleStatusToneClasses[tone] : statusToneClasses[tone],
        className
      )}
    >
      {displayChildren}
    </span>
  );
}

export type DifficultyBadgeProps = {
  difficulty: string | number;
  subtle?: boolean;
  className?: string;
  title?: string;
  prefix?: string;
};

const difficultyTone: Record<string, StatusTone> = {
  easy: "success",
  medium: "warning",
  hard: "error",
};

export function DifficultyBadge({ difficulty, subtle = false, className, title, prefix }: DifficultyBadgeProps) {
  const t = useTranslations("admin.states");
  const normalized =
    typeof difficulty === "number"
      ? difficulty >= 3
        ? "hard"
        : difficulty === 2
          ? "medium"
          : "easy"
      : String(difficulty);
  const tone = difficultyTone[normalized] ?? "muted";
  const localizedDifficulty = t(normalized === "easy" ? "easy" : normalized === "medium" ? "medium" : normalized === "hard" ? "hard" : "unknownDifficulty");
  return (
    <span
      title={title}
      className={cn(
        subtle
          ? "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-normal"
          : "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide border",
        subtle ? subtleStatusToneClasses[tone] : statusToneClasses[tone],
        className
      )}
    >
      {prefix ? `${prefix}: ${localizedDifficulty}` : localizedDifficulty}
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
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-brand-primary/8 border border-brand-primary/10 text-brand-primary",
        className
      )}
    >
      {children}
    </span>
  );
}
