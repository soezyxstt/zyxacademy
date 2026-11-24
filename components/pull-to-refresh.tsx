"use client";

/**
 * components/pull-to-refresh.tsx
 *
 * Reusable, accessible smartphone pull-to-refresh wrapper.
 * Refreshes active React Query queries and Next.js router data by default
 * while preserving URL params, active filters, drafts, and tab state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2, RefreshCw, X } from "lucide-react";
import { useAppReducedMotion } from "@/components/appearance-preferences";
import { Button } from "@/components/ui/button";
import {
  PULL_THRESHOLD_PX,
  usePullToRefresh,
  type PullToRefreshStatus,
} from "@/hooks/use-pull-to-refresh";
import { useTranslations } from "@/lib/i18n/client";
import { cn } from "@/lib/utils";

type Refresh = () => Promise<void> | void;
const RefreshContext = createContext<((refresh: Refresh) => () => void) | null>(null);

export interface PullToRefreshLabels {
  pull: string;
  release: string;
  refreshing: string;
  failed: string;
  retry: string;
  dismiss: string;
}

export interface PullToRefreshContextValue {
  status: PullToRefreshStatus;
  labels: PullToRefreshLabels;
  retry: () => void;
  dismissError: () => void;
  registerNavbarHost: (element: HTMLElement | null) => () => void;
}

const PullToRefreshContext = createContext<PullToRefreshContextValue | null>(null);

export function usePullToRefreshContext(): PullToRefreshContextValue | null {
  return useContext(PullToRefreshContext);
}

export function usePullToRefreshHandler(refresh: Refresh | null) {
  const register = useContext(RefreshContext);
  const latest = useRef(refresh);
  useEffect(() => { latest.current = refresh; }, [refresh]);
  const enabled = refresh !== null;
  useEffect(() => {
    if (enabled) return register?.(() => latest.current?.());
  }, [enabled, register]);
}

export interface PullToRefreshProps {
  children: ReactNode;
  onRefresh?: () => Promise<void> | void;
  disabled?: boolean;
  expectNavbarHost?: boolean;
  className?: string;
}

export function PullToRefresh({
  children,
  onRefresh,
  disabled = false,
  expectNavbarHost = false,
  className,
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const navbarHostRef = useRef<HTMLElement | null>(null);
  const scopedRefresh = useRef<Refresh | null>(null);
  const [navbarHostCount, setNavbarHostCount] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  const register = useCallback((refresh: Refresh) => {
    scopedRefresh.current = refresh;
    return () => { if (scopedRefresh.current === refresh) scopedRefresh.current = null; };
  }, []);

  const registerNavbarHost = useCallback((element: HTMLElement | null) => {
    let active = true;
    navbarHostRef.current = element;
    setNavbarHostCount((count) => count + 1);
    return () => {
      if (!active) return;
      active = false;
      if (navbarHostRef.current === element) {
        navbarHostRef.current = null;
      }
      setNavbarHostCount((count) => Math.max(0, count - 1));
    };
  }, []);

  const router = useRouter();
  const queryClient = useQueryClient();
  const reducedMotion = useAppReducedMotion();
  const t = useTranslations("common");

  const labels = useMemo<PullToRefreshLabels>(
    () => ({
      pull: t("pullToRefresh.pull"),
      release: t("pullToRefresh.release"),
      refreshing: t("pullToRefresh.refreshing"),
      failed: t("pullToRefresh.failed"),
      retry: t("pullToRefresh.retry"),
      dismiss: t("pullToRefresh.dismiss"),
    }),
    [t],
  );

  const handleDefaultRefresh = useCallback(async () => {
    await queryClient.refetchQueries({ type: "active" }, { throwOnError: true });
    router.refresh();
  }, [queryClient, router]);

  const refresh = useCallback(() => {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline");
    return (onRefresh ?? scopedRefresh.current ?? handleDefaultRefresh)();
  }, [onRefresh, handleDefaultRefresh]);

  const { status, retry, dismissError } = usePullToRefresh({
    onRefresh: refresh,
    disabled,
    threshold: PULL_THRESHOLD_PX,
    containerRef,
    indicatorRef,
    hostRef: navbarHostRef,
  });

  const contextValue = useMemo<PullToRefreshContextValue>(
    () => ({
      status,
      labels,
      retry,
      dismissError,
      registerNavbarHost,
    }),
    [status, labels, retry, dismissError, registerNavbarHost],
  );

  const hasNavbarHost = navbarHostCount > 0 || (expectNavbarHost && !hydrated);
  const dragging = status === "pulling" || status === "ready";
  const isIndicatorVisible = dragging || status === "refreshing";
  const distance = isIndicatorVisible
    ? dragging && !reducedMotion ? "var(--pull-distance, 0px)" : "48px"
    : "0px";

  const statusText =
    status === "refreshing"
      ? labels.refreshing
      : status === "ready"
        ? labels.release
        : status === "pulling"
          ? labels.pull
          : "";

  return (
    <div
      ref={containerRef}
      data-pull-to-refresh={status}
      className={cn("relative min-w-0 flex-1", className)}
    >
      {!hasNavbarHost && (
        <>
          <div
            ref={indicatorRef}
            data-pull-indicator=""
            role="status"
            aria-live="polite"
            className="pointer-events-none absolute inset-x-0 top-0 z-40 hidden h-10 items-center justify-center max-md:flex"
            style={{
              transform: `translate3d(0, calc(${distance} - 40px), 0)`,
              opacity: dragging && !reducedMotion ? "var(--pull-opacity, 0)" : Number(isIndicatorVisible),
              transition: reducedMotion || dragging ? "none" : "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out",
            }}
          >
            <span className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-body-xs font-medium text-muted-foreground shadow-sm">
              {status === "refreshing" ? (
                <Loader2 className={cn("size-3.5 text-primary", !reducedMotion && "animate-spin")} aria-hidden="true" />
              ) : (
                <RefreshCw
                  className="size-3.5 text-primary"
                  aria-hidden="true"
                  style={{ transform: reducedMotion ? undefined : "rotate(var(--pull-turn, 0deg))" }}
                />
              )}
              <span>{statusText}</span>
            </span>
          </div>

          {status === "error" && (
            <div
              role="alert"
              className="flex items-center justify-between gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2 text-body-xs text-destructive md:hidden"
            >
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="truncate">{labels.failed}</span>
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <Button type="button" variant="outline" size="sm" className="h-7 px-2" onClick={retry}>
                  {labels.retry}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7 text-destructive hover:text-destructive"
                  aria-label={labels.dismiss}
                  onClick={dismissError}
                >
                  <X className="size-3.5" aria-hidden="true" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <PullToRefreshContext.Provider value={contextValue}>
        <RefreshContext.Provider value={register}>{children}</RefreshContext.Provider>
      </PullToRefreshContext.Provider>
    </div>
  );
}
