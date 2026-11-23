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
import { useMobileChrome } from "@/components/navigation/mobile-chrome-context";

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
  const pathname = usePathname();

  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

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
        data-mobile-navbar=""
        data-mobile-search-expanded={activeSearchExpanded ? "true" : undefined}
        className={cn(
          "sticky top-0 z-30 w-full max-w-full shrink-0 pt-[env(safe-area-inset-top,0px)] backdrop-blur-md transition-colors duration-200 motion-reduce:transition-none md:hidden",
          activeSearchExpanded
            ? "bg-background/95 shadow-xs"
            : "bg-gradient-to-b from-background via-background/85 to-background/0",
          className
        )}
      >
        <div className="relative h-13 w-full max-w-full overflow-hidden px-3 sm:px-4">
          {/* Default Top Navbar Row */}
          <div
            aria-hidden={activeSearchExpanded || undefined}
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
            className={cn(
              "absolute inset-0 flex items-center gap-2 px-3 sm:px-4 transition-[opacity,transform] duration-250 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
              activeSearchExpanded
                ? "pointer-events-auto translate-x-0 scale-100 opacity-100"
                : "pointer-events-none translate-x-4 scale-[0.97] opacity-0"
            )}
          >
            <div className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded-full border border-border/80 bg-card/95 px-3.5 shadow-xs transition-[border-color,box-shadow] duration-200 focus-within:border-brand-secondary/70 focus-within:ring-2 focus-within:ring-brand-secondary/20">
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
                  className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Animated Global Vector Search Section directly below Top Nav */}
        <div
          data-mobile-global-search-section=""
          aria-hidden={!activeSearchExpanded || undefined}
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
      </header>
    </MobileTopNavSearchControlContext.Provider>
  );
}
