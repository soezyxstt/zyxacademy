"use client";

import type { ReactNode } from "react";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type AdminErrorStateProps = {
  message: ReactNode;
  onRetry?: () => void;
  className?: string;
};

export function AdminErrorState({ message, onRetry, className }: AdminErrorStateProps) {
  const t = useTranslations("admin.states");
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-(--compact-gap) py-(--compact-gap)", className)}>
      <div className="flex min-w-0 items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-error" aria-hidden />
        <p className="wrap-break-word text-body-sm text-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="ghost" size="sm" className="min-h-9" onClick={onRetry}>
          {t("retry")}
        </Button>
      )}
    </div>
  );
}
