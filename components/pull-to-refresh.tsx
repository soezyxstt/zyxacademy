"use client";

/**
 * components/pull-to-refresh.tsx
 *
 * Reusable, accessible smartphone pull-to-refresh wrapper.
 * Refreshes active React Query queries and Next.js router data by default
 * while preserving URL params, active filters, drafts, and tab state.
 */

import { useCallback, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, RefreshCw, X } from "lucide-react";
import { useAppReducedMotion } from "@/components/appearance-preferences";
import { Button } from "@/components/ui/button";
import { PULL_THRESHOLD_PX, usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

export interface PullToRefreshProps {
  children: ReactNode;
  onRefresh?: () => Promise<void> | void;
  disabled?: boolean;
  className?: string;
}

export function PullToRefresh({
  children,
  onRefresh,
  disabled = false,
  className,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const queryClient = useQueryClient();
  const reducedMotion = useAppReducedMotion();
  const t = useTranslations("common");

  const handleDefaultRefresh = useCallback(async () => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new Error("offline");
    }
    await queryClient.invalidateQueries({ refetchType: "active" });
    router.refresh();
  }, [queryClient, router]);

  const { status, pullDistance, progress, retry, dismissError } = usePullToRefresh({
    onRefresh: onRefresh ?? handleDefaultRefresh,
    disabled,
    threshold: PULL_THRESHOLD_PX,
    containerRef,
  });

  const isIndicatorVisible =
    status === "pulling" || status === "ready" || status === "refreshing";

  const statusText =
    status === "refreshing"
      ? t("pullToRefresh.refreshing")
      : status === "ready"
        ? t("pullToRefresh.release")
        : status === "pulling"
          ? t("pullToRefresh.pull")
          : "";

  return (
    <div
      ref={containerRef}
      data-pull-to-refresh={status}
      className={cn("relative min-w-0 flex-1", className)}
    >
      {isIndicatorVisible && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center justify-center overflow-hidden border-b border-border/50 bg-muted/40 text-body-xs text-muted-foreground md:hidden"
          style={{
            height: `${Math.max(36, Math.min(pullDistance, 56))}px`,
            transition: reducedMotion ? "none" : "height 120ms ease-out",
          }}
        >
          <span className="inline-flex items-center gap-2 font-medium">
            {status === "refreshing" ? (
              <Loader2
                className={cn("size-3.5 text-primary", !reducedMotion && "animate-spin")}
                aria-hidden="true"
              />
            ) : (
              <RefreshCw
                className="size-3.5 text-primary"
                aria-hidden="true"
                style={{
                  transform: reducedMotion ? undefined : `rotate(${Math.round(progress * 180)}deg)`,
                }}
              />
            )}
            <span>{statusText}</span>
          </span>
        </div>
      )}

      {status === "error" && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-body-xs text-destructive md:hidden"
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{t("pullToRefresh.failed")}</span>
          </span>
          <div className="flex shrink-0 items-center gap-1">
            <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={retry}>
              {t("pullToRefresh.retry")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="size-7 text-destructive hover:text-destructive"
              aria-label={t("pullToRefresh.dismiss")}
              onClick={dismissError}
            >
              <X className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      {children}
    </div>
  );
}
