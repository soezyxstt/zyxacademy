"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUpRight,
  Globe,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { useAppReducedMotion } from "@/components/appearance-preferences";
import { useMobileChrome } from "@/components/navigation/mobile-chrome-context";
import { usePullToRefreshContext } from "@/components/pull-to-refresh";

const PTR_RING_RADIUS = 8;
const PTR_RING_CIRCUMFERENCE = 2 * Math.PI * PTR_RING_RADIUS;

export interface MobileTopNavSearchLabels {
  placeholder?: string;
  searchGlobally?: string;
  searchGloballyQuery?: (query: string) => string;
  clear?: string;
  close?: string;
}

export interface MobileTopNavbarProps {
  title?: string;
  subtitle?: string;
  logoHref?: string;
  logoLabel?: string;
  backHref?: string;
  onBack?: () => void;
  backLabel?: string;
  leftSlot?: ReactNode;
  pageActions?: ReactNode;
  rightActions?: ReactNode;
  searchLabels?: MobileTopNavSearchLabels;
  onOpenGlobalSearch?: (query?: string) => void;
  className?: string;
}

export interface MobileTopNavActionButtonProps
  extends ComponentPropsWithoutRef<"button"> {
  label: string;
}

export const MOBILE_TOP_NAV_ICON_BUTTON_CLASS =
  "relative size-9 shrink-0 rounded-xl border-border/60 bg-card/85 text-muted-foreground shadow-xs backdrop-blur-md transition-all duration-150 hover:border-border hover:bg-muted/85 hover:text-foreground active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100 after:absolute after:-inset-1 after:content-['']";

interface MobileTopNavSearchControlValue {
  isSearchExpanded: boolean;
  hasPageSearch: boolean;
  hasActiveQuery: boolean;
  openSearch: () => void;
  registerTrigger: (node: HTMLButtonElement | null) => void;
}

const MobileTopNavSearchControlContext =
  createContext<MobileTopNavSearchControlValue | null>(null);

export function MobileTopNavActionButton({
  label,
  className,
  children,
  type = "button",
  ...props
}: MobileTopNavActionButtonProps) {
  return (
    <Button
      type={type}
      variant="outline"
      size="icon-lg"
      aria-label={label}
      className={cn(MOBILE_TOP_NAV_ICON_BUTTON_CLASS, className)}
      {...props}
    >
      {children}
    </Button>
  );
}

/**
 * Unified mobile top-navbar search icon trigger.
 * Expands the in-navbar page search when the active page registers a search bar,
 * or opens the global vector search dialog directly on pages without local search.
 */
export function MobileTopNavSearchTrigger({
  label,
  onFallbackClick,
  className,
}: {
  label: string;
  onFallbackClick?: () => void;
  className?: string;
}) {
  const control = useContext(MobileTopNavSearchControlContext);

  const handleClick = () => {
    if (control) {
      control.openSearch();
    } else {
      onFallbackClick?.();
    }
  };

  return (
    <Button
      ref={control?.registerTrigger}
      type="button"
      variant="outline"
      size="icon-lg"
      aria-label={label}
      aria-expanded={control?.hasPageSearch ? control.isSearchExpanded : undefined}
      data-mobile-search-trigger=""
      onClick={handleClick}
      className={cn(MOBILE_TOP_NAV_ICON_BUTTON_CLASS, className)}
    >
      <Search className="size-4" aria-hidden="true" />
      {control?.hasActiveQuery && !control.isSearchExpanded ? (
        <span
          aria-hidden="true"
          data-mobile-search-active-dot=""
          className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand-secondary ring-2 ring-background"
        />
      ) : null}
    </Button>
  );
}

const DEFAULT_SEARCH_LABELS: Required<MobileTopNavSearchLabels> = {
  placeholder: "Cari di halaman ini...",
  searchGlobally: "Cari di seluruh Zyx",
  searchGloballyQuery: (query) => `Cari "${query}" di seluruh Zyx`,
  clear: "Bersihkan pencarian",
  close: "Tutup pencarian",
};

/**
 * Shared mobile top navigation bar without hamburger menu triggers.
 * Supports declarative route overrides and unified animated page/global search
 * through MobileChromeContext.
 */
export function MobileTopNavbar({
  title = "",
  subtitle,
  logoHref,
  logoLabel = "Zyx",
  backHref,
  onBack,
  backLabel = "Kembali",
  leftSlot,
  pageActions,
  rightActions,
  searchLabels,
  onOpenGlobalSearch,
  className,
}: MobileTopNavbarProps) {
  const { topNav, pageSearch } = useMobileChrome();
  const pull = usePullToRefreshContext();
  const reducedMotion = useAppReducedMotion();
  const pathname = usePathname();

  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const [lastActivePullStatus, setLastActivePullStatus] = useState<
    "pulling" | "ready" | "refreshing"
  >("pulling");
  const headerRef = useRef<HTMLElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const registerNavbarHost = pull?.registerNavbarHost;
  const isHiddenTopNav = Boolean(topNav.hideTopNav);

  useEffect(() => {
    if (!registerNavbarHost || isHiddenTopNav) return;
    return registerNavbarHost(headerRef.current);
  }, [isHiddenTopNav, registerNavbarHost]);

  const pullStatus = pull?.status ?? "idle";
  const isPullDragging = pullStatus === "pulling" || pullStatus === "ready";
  const isPullActive = pullStatus !== "idle";
  const isPullStripVisible = isPullDragging || pullStatus === "refreshing";

  useEffect(() => {
    if (
      pullStatus === "pulling" ||
      pullStatus === "ready" ||
      pullStatus === "refreshing"
    ) {
      setLastActivePullStatus(pullStatus);
    }
  }, [pullStatus]);

  const displayPullStatus = isPullStripVisible
    ? pullStatus
    : lastActivePullStatus;
  const pullLabels = pull?.labels;
  const pullDisplayText = pullLabels
    ? displayPullStatus === "refreshing"
      ? pullLabels.refreshing
      : displayPullStatus === "ready"
        ? pullLabels.release
        : pullLabels.pull
    : "";
  const pullLiveAnnouncement =
    pullLabels && isPullStripVisible ? pullDisplayText : "";

  const labels = {
    placeholder: searchLabels?.placeholder ?? DEFAULT_SEARCH_LABELS.placeholder,
    searchGlobally:
      searchLabels?.searchGlobally ?? DEFAULT_SEARCH_LABELS.searchGlobally,
    searchGloballyQuery:
      searchLabels?.searchGloballyQuery ??
      DEFAULT_SEARCH_LABELS.searchGloballyQuery,
    clear: searchLabels?.clear ?? DEFAULT_SEARCH_LABELS.clear,
    close: searchLabels?.close ?? DEFAULT_SEARCH_LABELS.close,
  };

  const hasPageSearch = Boolean(pageSearch);
  const activeSearchExpanded = isSearchExpanded && hasPageSearch;
  const query = pageSearch?.value ?? "";
  const trimmedQuery = query.trim();
  const hasActiveQuery = hasPageSearch && trimmedQuery.length > 0;

  // Collapse top-nav search cleanly on navigation or when page search unmounts
  useEffect(() => {
    setIsSearchExpanded(false);
  }, [pathname, hasPageSearch]);

  // Focus input when expanded
  useEffect(() => {
    if (!activeSearchExpanded) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [activeSearchExpanded]);

  const registerTrigger = useCallback((node: HTMLButtonElement | null) => {
    triggerRef.current = node;
  }, []);

  const openSearch = useCallback(() => {
    if (pageSearch) {
      setIsSearchExpanded(true);
    } else {
      onOpenGlobalSearch?.();
    }
  }, [onOpenGlobalSearch, pageSearch]);

  const closeSearch = useCallback((restoreFocus = true) => {
    setIsSearchExpanded(false);
    if (restoreFocus) {
      requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });
    }
  }, []);

  const handleOpenGlobalSearch = useCallback(() => {
    const queryToPass = trimmedQuery;
    setIsSearchExpanded(false);
    onOpenGlobalSearch?.(queryToPass || undefined);
  }, [onOpenGlobalSearch, trimmedQuery]);

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeSearch(true);
    }
  };

  const searchControlValue = useMemo<MobileTopNavSearchControlValue>(
    () => ({
      isSearchExpanded: activeSearchExpanded,
      hasPageSearch,
      hasActiveQuery,
      openSearch,
      registerTrigger,
    }),
    [
      activeSearchExpanded,
      hasActiveQuery,
      hasPageSearch,
      openSearch,
      registerTrigger,
    ]
  );

  if (topNav.hideTopNav) {
    return null;
  }

  const resolvedTitle = topNav.title ?? title;
  const resolvedSubtitle = topNav.subtitle ?? subtitle;
  const resolvedBackLabel = topNav.backLabel ?? backLabel;
  const resolvedFallbackBackLabel = topNav.fallbackBackLabel ?? backLabel;
  const resolvedPageActions = topNav.pageActions ?? pageActions;
  const resolvedRightActions = topNav.rightActions ?? rightActions;

  let leftContent: ReactNode = null;
  if (topNav.leftSlot) {
    leftContent = topNav.leftSlot;
  } else if (topNav.onBack) {
    leftContent = (
      <MobileTopNavActionButton
        data-mobile-back-button=""
        label={resolvedBackLabel}
        onClick={topNav.onBack}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
      </MobileTopNavActionButton>
    );
  } else if (topNav.backHref) {
    leftContent = (
      <Button
        asChild
        variant="outline"
        size="icon-lg"
        className={MOBILE_TOP_NAV_ICON_BUTTON_CLASS}
      >
        <Link
          href={topNav.backHref}
          data-mobile-back-button=""
          aria-label={resolvedBackLabel}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    );
  } else if (leftSlot) {
    leftContent = leftSlot;
  } else if (onBack) {
    leftContent = (
      <MobileTopNavActionButton
        data-mobile-back-button=""
        label={resolvedBackLabel}
        onClick={onBack}
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
      </MobileTopNavActionButton>
    );
  } else if (backHref) {
    leftContent = (
      <Button
        asChild
        variant="outline"
        size="icon-lg"
        className={MOBILE_TOP_NAV_ICON_BUTTON_CLASS}
      >
        <Link
          href={backHref}
          data-mobile-back-button=""
          aria-label={resolvedBackLabel}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    );
  } else if (topNav.fallbackBackHref) {
    leftContent = (
      <Button
        asChild
        variant="outline"
        size="icon-lg"
        className={MOBILE_TOP_NAV_ICON_BUTTON_CLASS}
      >
        <Link
          href={topNav.fallbackBackHref}
          data-mobile-back-button=""
          aria-label={resolvedFallbackBackLabel}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    );
  } else if (logoHref) {
    leftContent = (
      <Link
        href={logoHref}
        aria-label={logoLabel}
        className="relative flex size-9 shrink-0 items-center justify-center rounded-xl transition-opacity hover:opacity-85 focus-visible:outline-[2px] focus-visible:outline-[var(--zx-accent)] after:absolute after:-inset-1 after:content-['']"
      >
        <Logo variant="symbol" className="[--logo-height:1.25rem]" />
      </Link>
    );
  }

  return (
    <MobileTopNavSearchControlContext.Provider value={searchControlValue}>
      <header
        ref={headerRef}
        data-mobile-navbar=""
        data-mobile-search-expanded={activeSearchExpanded ? "true" : undefined}
        data-pull-state={isPullActive ? pullStatus : undefined}
        className={cn(
          "sticky top-0 z-30 w-full max-w-full shrink-0 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md transition-colors duration-200 motion-reduce:transition-none md:hidden",
          activeSearchExpanded || isPullActive
            ? "bg-background/95 shadow-xs"
            : "bg-gradient-to-b from-background via-background/85 to-background/0",
          className
        )}
        style={
          pull
            ? {
                paddingTop:
                  isPullDragging && !reducedMotion
                    ? "calc(env(safe-area-inset-top, 0px) + var(--pull-distance, 0px) * 0.35)"
                    : "env(safe-area-inset-top, 0px)",
                transition:
                  reducedMotion || isPullDragging
                    ? "none"
                    : "padding-top 240ms cubic-bezier(0.22, 1, 0.36, 1), background-color 200ms ease",
              }
            : undefined
        }
      >
        <div className="relative h-13 w-full max-w-full overflow-hidden px-3 sm:px-4">
          {/* Default Top Navbar Row */}
          <div
            aria-hidden={activeSearchExpanded || undefined}
            inert={activeSearchExpanded || undefined}
            className={cn(
              "flex h-full w-full items-center justify-between gap-2 transition-[opacity,transform] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              activeSearchExpanded
                ? "pointer-events-none scale-[0.98] opacity-0"
                : "scale-100 opacity-100"
            )}
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5 overflow-hidden">
              {leftContent}
              {resolvedTitle ? (
                <div className="flex min-w-0 flex-1 flex-col justify-center overflow-hidden text-left">
                  <span
                    title={resolvedTitle}
                    className="block min-w-0 truncate font-heading text-body-sm font-semibold leading-tight tracking-tight text-foreground"
                  >
                    {resolvedTitle}
                  </span>
                  {resolvedSubtitle ? (
                    <span
                      title={resolvedSubtitle}
                      data-mobile-navbar-subtitle=""
                      className="block min-w-0 truncate text-body-2xs font-medium leading-tight text-muted-foreground"
                    >
                      {resolvedSubtitle}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>

            {resolvedPageActions || resolvedRightActions ? (
              <div className="flex shrink-0 items-center gap-1.5">
                {resolvedPageActions ? (
                  <div
                    data-mobile-navbar-page-actions=""
                    className="flex shrink-0 items-center gap-1.5"
                  >
                    {resolvedPageActions}
                  </div>
                ) : null}
                {resolvedRightActions}
              </div>
            ) : null}
          </div>

          {/* Animated Expanded Search Row */}
          <div
            data-mobile-search-bar=""
            aria-hidden={!activeSearchExpanded || undefined}
            inert={!activeSearchExpanded || undefined}
            className={cn(
              "absolute inset-0 flex items-center gap-2 px-3 sm:px-4 transition-[opacity,transform] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              activeSearchExpanded
                ? "pointer-events-auto translate-x-0 scale-100 opacity-100"
                : "pointer-events-none translate-x-4 scale-[0.97] opacity-0"
            )}
          >
            <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-xl border border-border/80 bg-card/95 px-3.5 shadow-xs transition-[border-color,box-shadow] duration-200 focus-within:border-brand-secondary/70 focus-within:ring-2 focus-within:ring-brand-secondary/20">
              {pageSearch?.isLoading ? (
                <Loader2
                  className="size-4 shrink-0 animate-spin text-brand-secondary"
                  aria-hidden="true"
                />
              ) : (
                <Search
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              )}
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(event) => pageSearch?.onChange(event.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={pageSearch?.placeholder || labels.placeholder}
                aria-label={
                  pageSearch?.ariaLabel ||
                  pageSearch?.placeholder ||
                  labels.placeholder
                }
                tabIndex={activeSearchExpanded ? 0 : -1}
                className="min-w-0 flex-1 bg-transparent font-sans text-body-sm text-foreground placeholder:text-muted-foreground/65 focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
              />
              {query.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (pageSearch?.onClear) {
                      pageSearch.onClear();
                    } else {
                      pageSearch?.onChange("");
                    }
                    inputRef.current?.focus();
                  }}
                  tabIndex={activeSearchExpanded ? 0 : -1}
                  aria-label={labels.clear}
                  className="relative flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring after:absolute after:-inset-1.5 after:content-['']"
                >
                  <X className="size-3.5" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => closeSearch(true)}
              tabIndex={activeSearchExpanded ? 0 : -1}
              aria-label={labels.close}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Animated Global Vector Search Section directly below Top Nav */}
        <div
          data-mobile-global-search-section=""
          aria-hidden={!activeSearchExpanded || undefined}
          inert={!activeSearchExpanded || undefined}
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
            activeSearchExpanded
              ? "grid-rows-[1fr] opacity-100"
              : "pointer-events-none grid-rows-[0fr] opacity-0"
          )}
        >
          <div className="overflow-hidden">
            <div className="border-b border-border/60 px-3 pb-1.5 pt-0.5 sm:px-4">
              <button
                type="button"
                data-mobile-global-search-button=""
                tabIndex={activeSearchExpanded ? 0 : -1}
                onClick={handleOpenGlobalSearch}
                className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left text-body-sm text-foreground/90 transition-colors hover:bg-muted/70 active:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Globe
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {trimmedQuery
                      ? labels.searchGloballyQuery(trimmedQuery)
                      : labels.searchGlobally}
                  </span>
                </span>
                <ArrowUpRight
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>
        </div>
        {/* Integrated Pull-to-Refresh Expansion inside Navbar */}
        {pull && pullLabels ? (
          <>
            <span className="sr-only" role="status" aria-live="polite">
              {pullLiveAnnouncement}
            </span>
            <div
              data-pull-indicator=""
              aria-hidden="true"
              className="pointer-events-none flex w-full items-center justify-center overflow-hidden px-3 sm:px-4"
              style={{
                height: isPullStripVisible
                  ? isPullDragging && !reducedMotion
                    ? "calc(var(--pull-distance, 0px) * 0.65)"
                    : "32px"
                  : "0px",
                opacity:
                  isPullDragging && !reducedMotion
                    ? "var(--pull-opacity, 0)"
                    : Number(isPullStripVisible),
                transition:
                  reducedMotion || isPullDragging
                    ? "none"
                    : "height 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out",
              }}
            >
              <span
                className={cn(
                  "inline-flex items-center gap-2 text-body-xs transition-colors duration-150 motion-reduce:transition-none",
                  displayPullStatus === "ready"
                    ? "font-semibold text-primary"
                    : "font-medium text-muted-foreground"
                )}
              >
                {displayPullStatus === "refreshing" ? (
                  <Loader2
                    className={cn(
                      "size-3.5 shrink-0 text-primary",
                      !reducedMotion && "animate-spin"
                    )}
                    aria-hidden="true"
                  />
                ) : (
                  <span
                    className={cn(
                      "relative inline-flex size-5 shrink-0 items-center justify-center",
                      displayPullStatus === "ready" &&
                        !reducedMotion &&
                        "animate-[ptr-ready-pop_260ms_cubic-bezier(0.34,1.56,0.64,1)]"
                    )}
                    aria-hidden="true"
                  >
                    <svg
                      viewBox="0 0 20 20"
                      className="size-5 -rotate-90"
                      fill="none"
                    >
                      <circle
                        cx="10"
                        cy="10"
                        r={PTR_RING_RADIUS}
                        stroke="currentColor"
                        strokeWidth="1.75"
                        className="text-border"
                      />
                      <circle
                        cx="10"
                        cy="10"
                        r={PTR_RING_RADIUS}
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeDasharray={PTR_RING_CIRCUMFERENCE}
                        className={cn(
                          "transition-colors duration-150 motion-reduce:transition-none",
                          displayPullStatus === "ready"
                            ? "text-primary"
                            : "text-muted-foreground/75"
                        )}
                        style={{
                          strokeDashoffset:
                            displayPullStatus === "ready"
                              ? 0
                              : reducedMotion
                                ? PTR_RING_CIRCUMFERENCE * 0.5
                                : `calc(${PTR_RING_CIRCUMFERENCE} * (1 - var(--pull-progress, 0)))`,
                        }}
                      />
                    </svg>
                    <ArrowDown
                      className={cn(
                        "absolute size-2.5 transition-colors duration-150 motion-reduce:transition-none",
                        displayPullStatus === "ready"
                          ? "text-primary"
                          : "text-muted-foreground"
                      )}
                      style={{
                        transform: reducedMotion
                          ? displayPullStatus === "ready"
                            ? "rotate(180deg)"
                            : undefined
                          : "rotate(var(--pull-turn, 0deg))",
                      }}
                    />
                  </span>
                )}
                <span>{pullDisplayText}</span>
              </span>
            </div>

            {pullStatus === "error" ? (
              <div
                role="alert"
                className="flex items-center justify-between gap-2 border-y border-destructive/30 bg-destructive/10 px-3 py-1.5 text-body-xs text-destructive sm:px-4"
              >
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
                  <span className="truncate">{pullLabels.failed}</span>
                </span>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="relative h-7 px-2 after:absolute after:-inset-1.5 after:content-['']"
                    onClick={pull.retry}
                  >
                    {pullLabels.retry}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="relative size-7 text-destructive hover:text-destructive after:absolute after:-inset-1.5 after:content-['']"
                    aria-label={pullLabels.dismiss}
                    onClick={pull.dismissError}
                  >
                    <X className="size-3.5" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : null}

            <div
              aria-hidden="true"
              data-pull-progress-bar=""
              className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 w-full overflow-hidden bg-border/40"
              style={{
                opacity:
                  isPullDragging && !reducedMotion
                    ? "var(--pull-opacity, 0)"
                    : Number(isPullStripVisible),
                transition:
                  reducedMotion || isPullDragging
                    ? "none"
                    : "opacity 180ms ease-out",
              }}
            >
              {displayPullStatus === "refreshing" ? (
                <div
                  className={cn(
                    "h-full rounded-full",
                    reducedMotion
                      ? "w-full bg-primary/60"
                      : "w-1/2 bg-primary animate-[ptr-indeterminate_1.1s_ease-in-out_infinite]"
                  )}
                />
              ) : (
                <div
                  className={cn(
                    "h-full w-full origin-center transition-colors duration-150 motion-reduce:transition-none",
                    displayPullStatus === "ready"
                      ? "bg-primary"
                      : "bg-muted-foreground/45"
                  )}
                  style={{
                    transform:
                      displayPullStatus === "ready"
                        ? "scaleX(1)"
                        : reducedMotion
                          ? "scaleX(0.5)"
                          : "scaleX(var(--pull-progress, 0))",
                  }}
                />
              )}
            </div>
          </>
        ) : null}
      </header>
    </MobileTopNavSearchControlContext.Provider>
  );
}
