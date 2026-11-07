"use client";

import type { ReactNode } from "react";
import { catchError, type ErrorInfo } from "next/error";
import { AdminErrorState } from "@/components/admin/admin-error-state-client";
import { useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export type DashboardSectionErrorBoundaryProps = {
  sectionTitle?: ReactNode;
  variant?: "primary" | "secondary" | "silent";
  fallbackHeader?: ReactNode;
};

export function DashboardSectionErrorFallback(
  {
    sectionTitle,
    variant = "secondary",
    fallbackHeader,
  }: DashboardSectionErrorBoundaryProps,
  errorInfo: ErrorInfo,
) {
  const t = useTranslations("core");

  if (variant === "silent") {
    return null;
  }

  const message = sectionTitle ? (
    <>
      {t("error.title")}: <span className="font-semibold">{sectionTitle}</span>
    </>
  ) : (
    t("error.title")
  );

  return (
    <>
      {fallbackHeader}
      <div
        role="alert"
        data-error-variant={variant}
        className={cn(
          "rounded-xl border px-4",
          variant === "primary"
            ? "border-status-error/25 bg-status-error/5"
            : "border-border/60 bg-muted/15",
        )}
      >
        <AdminErrorState
          message={message}
          onRetry={errorInfo.retry}
          className={variant === "primary" ? "py-6" : "py-4"}
        />
      </div>
    </>
  );
}

export const DashboardSectionErrorBoundary = catchError(
  DashboardSectionErrorFallback,
);
