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
    <div className={cn("flex flex-col items-center justify-center gap-3 py-8 text-center", className)}>
      <div className="flex items-center gap-2">
        <TriangleAlert className="size-4 text-status-error" aria-hidden />
        <p className="text-body-sm text-status-error">{message}</p>
      </div>
      {onRetry && (
        <Button variant="ghost" size="sm" className="rounded-lg" onClick={onRetry}>
          {t("retry")}
        </Button>
      )}
    </div>
  );
}
