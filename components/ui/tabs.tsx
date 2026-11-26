"use client";

import { useOnboardingTour } from "@/components/onboarding/tour-context";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { hapticSelection } from "@/lib/native/haptics";
import { registerMobileTabSwipe } from "@/lib/navigation/mobile-tab-swipe";
import { useUrlTab } from "@/hooks/use-url-tab";
import { useTranslations } from "@/lib/i18n/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  tabListClassName,
  tabListPageBarClassName,
  tabListStickyBarClassName,
  tabTriggerClassName,
  tabTriggerActiveClassName,
  tabOverflowItemClassName,
  tabOverflowItemActiveClassName,
} from "@/components/ui/tab-styles";

type TabsContextValue = {
  activeValue?: string;
  selectTab?: (value: string) => void;
  rootRef?: React.RefObject<HTMLDivElement | null>;
};

const TabsContext = React.createContext<TabsContextValue>({});

// Keep the tab strip's width independent of the triggers it moves into More.
const tabsRootClassName = "w-full min-w-0 max-w-full";

type TabsProps = React.ComponentProps<typeof TabsPrimitive.Root> & {
  paramKey?: string;
  syncUrl?: boolean;
};

function TabsInner({
  value,
  onValueChange,
  defaultValue,
  paramKey = "tab",
  syncUrl = true,
  className,
  ...props
}: TabsProps) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const isControlled = value !== undefined;
  const [urlTab, setUrlTab] = useUrlTab(
    paramKey,
    typeof defaultValue === "string" ? defaultValue : "default"
  );
  const [localTab, setLocalTab] = React.useState<string | undefined>(
    typeof defaultValue === "string" ? defaultValue : undefined
  );

  const activeValue = isControlled
    ? value
    : syncUrl && defaultValue
    ? urlTab
    : localTab;

  const handleValueChange = React.useCallback(
    (newVal: string) => {
      void hapticSelection();
      if (!isControlled) {
        if (syncUrl && defaultValue) {
          setUrlTab(newVal);
        } else {
          setLocalTab(newVal);
        }
      }
      onValueChange?.(newVal);
    },
    [isControlled, syncUrl, defaultValue, setUrlTab, onValueChange]
  );

  const ctxValue = React.useMemo(
    () => ({ activeValue, selectTab: handleValueChange, rootRef }),
    [activeValue, handleValueChange]
  );

  return (
    <TabsContext.Provider value={ctxValue}>
      <TabsPrimitive.Root
        ref={rootRef}
        data-slot="tabs"
        value={activeValue}
        onValueChange={handleValueChange}
        defaultValue={activeValue !== undefined ? undefined : defaultValue}
        className={cn(tabsRootClassName, className)}
        {...props}
      />
    </TabsContext.Provider>
  );
}

function TabsStatic({
  value,
  onValueChange,
  defaultValue,
  className,
  ...props
}: Omit<TabsProps, "paramKey" | "syncUrl">) {
  const rootRef = React.useRef<HTMLDivElement>(null);
  const isControlled = value !== undefined;
  const [localTab, setLocalTab] = React.useState<string | undefined>(
    typeof defaultValue === "string" ? defaultValue : undefined
  );

  const activeValue = isControlled ? value : localTab;

  const handleValueChange = React.useCallback(
    (newVal: string) => {
      void hapticSelection();
      if (!isControlled) {
        setLocalTab(newVal);
      }
      onValueChange?.(newVal);
    },
    [isControlled, onValueChange]
  );

  const ctxValue = React.useMemo(
    () => ({ activeValue, selectTab: handleValueChange, rootRef }),
    [activeValue, handleValueChange]
  );

  return (
    <TabsContext.Provider value={ctxValue}>
      <TabsPrimitive.Root
        ref={rootRef}
        data-slot="tabs"
        value={activeValue}
        onValueChange={handleValueChange}
        defaultValue={activeValue !== undefined ? undefined : defaultValue}
        className={cn(tabsRootClassName, className)}
        {...props}
      />
    </TabsContext.Provider>
  );
}

function Tabs({ paramKey, syncUrl, ...props }: TabsProps) {
  if (syncUrl === false || (props.value !== undefined && props.onValueChange !== undefined)) {
    return <TabsStatic {...props} />;
  }

  return (
    <React.Suspense fallback={<TabsStatic {...props} />}>
      <TabsInner {...props} paramKey={paramKey} syncUrl={syncUrl} />
    </React.Suspense>
  );
}

function flattenTabChildren(children: React.ReactNode): React.ReactElement[] {
  const result: React.ReactElement[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === React.Fragment) {
      const fragProps = child.props as { children?: React.ReactNode };
      result.push(...flattenTabChildren(fragProps.children));
    } else {
      result.push(child);
    }
  });
  return result;
}

type ExtractedTabMeta = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
  href?: string;
  tourTarget?: string;
};

function extractTextSignature(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractTextSignature).join("|");
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode; value?: unknown };
    return `${typeof props.value === "string" ? props.value : ""}:${extractTextSignature(props.children)}`;
  }
  return "";
}

function extractTabMeta(node: React.ReactNode): ExtractedTabMeta | null {
  if (!React.isValidElement(node)) return null;
  const props = node.props as {
    value?: unknown;
    children?: React.ReactNode;
    disabled?: boolean;
    "aria-label"?: string;
    "data-tour"?: string;
    asChild?: boolean;
  };

  if (typeof props.value === "string") {
    let label: React.ReactNode = props.children;
    let href: string | undefined;
    if (props.asChild && React.isValidElement(props.children)) {
      const innerProps = props.children.props as { children?: React.ReactNode; href?: unknown };
      label = innerProps.children ?? props["aria-label"] ?? props.value;
      if (typeof innerProps.href === "string") {
        href = innerProps.href;
      }
    }
    return {
      value: props.value,
      label: label ?? props["aria-label"] ?? props.value,
      disabled: props.disabled,
      tourTarget: props["data-tour"],
      href,
    };
  }

  if (props.children) {
    let found: ExtractedTabMeta | null = null;
    React.Children.forEach(props.children, (child) => {
      if (!found) {
        found = extractTabMeta(child);
      }
    });
    return found;
  }

  return null;
}

const MORE_BUTTON_FALLBACK_WIDTH = 96;
const ITEM_GAP_PX = 2;

function useOverflowTabs(
  itemCount: number,
  contentSignature: string,
  enabled: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  itemRefs: React.MutableRefObject<Array<HTMLElement | null>>,
  moreRef: React.RefObject<HTMLElement | null>,
  trailingRef: React.RefObject<HTMLElement | null>
) {
  const [visibleCount, setVisibleCount] = React.useState(itemCount);
  const [isMeasuring, setIsMeasuring] = React.useState(true);
  const widthsRef = React.useRef<number[]>([]);
  const prevSigRef = React.useRef(`${itemCount}:${contentSignature}`);

  const currentSig = `${itemCount}:${contentSignature}`;
  if (prevSigRef.current !== currentSig) {
    prevSigRef.current = currentSig;
    widthsRef.current = [];
  }

  const computeVisibleCount = React.useCallback(() => {
    if (!enabled) {
      setVisibleCount(itemCount);
      setIsMeasuring(false);
      return;
    }
    const container = containerRef.current;
    if (!container) return;

    const style = window.getComputedStyle(container);
    const padLeft = parseFloat(style.paddingLeft) || 0;
    const padRight = parseFloat(style.paddingRight) || 0;
    const available = container.clientWidth - padLeft - padRight;
    if (available <= 0) return;

    const trailingWidth = trailingRef.current
      ? Math.ceil(trailingRef.current.getBoundingClientRect().width) + ITEM_GAP_PX
      : 0;

    let missingWidth = false;
    for (let i = 0; i < itemCount; i++) {
      const el = itemRefs.current[i];
      if (el && el.offsetWidth > 0) {
        widthsRef.current[i] = Math.ceil(el.getBoundingClientRect().width);
      }
      if (widthsRef.current[i] === undefined) {
        missingWidth = true;
      }
    }

    if (missingWidth) {
      setVisibleCount(itemCount);
      setIsMeasuring(true);
      return;
    }

    let totalWidth = trailingWidth;
    for (let i = 0; i < itemCount; i++) {
      totalWidth += (i > 0 ? ITEM_GAP_PX : 0) + widthsRef.current[i];
    }

    if (totalWidth <= available + 1) {
      setVisibleCount((prev) => (prev === itemCount ? prev : itemCount));
      setIsMeasuring(false);
      return;
    }

    const moreWidth =
      moreRef.current && moreRef.current.offsetWidth > 0
        ? Math.ceil(moreRef.current.getBoundingClientRect().width) + 4
        : MORE_BUTTON_FALLBACK_WIDTH;

    const budget = available - moreWidth - trailingWidth;
    let used = 0;
    let fit = 0;

    for (let i = 0; i < itemCount; i++) {
      const w = widthsRef.current[i];
      const next = fit === 0 ? w : used + ITEM_GAP_PX + w;
      if (next <= budget) {
        used = next;
        fit++;
      } else {
        break;
      }
    }

    setVisibleCount((prev) => (prev === fit ? prev : fit));
    setIsMeasuring(false);
  }, [enabled, itemCount, containerRef, itemRefs, moreRef, trailingRef]);

  // Reset to a full measurement pass whenever item count or labels/badges change.
  React.useLayoutEffect(() => {
    if (!enabled) {
      setVisibleCount(itemCount);
      setIsMeasuring(false);
      return;
    }
    widthsRef.current = [];
    setVisibleCount(itemCount);
    setIsMeasuring(true);
  }, [enabled, itemCount, contentSignature]);

  // Measure immediately after the measuring render mounts all items.
  React.useLayoutEffect(() => {
    if (!enabled) return;
    if (isMeasuring) {
      computeVisibleCount();
    }
  }, [enabled, isMeasuring, computeVisibleCount]);

  React.useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      computeVisibleCount();
    });
    observer.observe(container);
    if (trailingRef.current) {
      observer.observe(trailingRef.current);
    }

    let cancelled = false;
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) {
          widthsRef.current = [];
          setVisibleCount(itemCount);
          setIsMeasuring(true);
        }
      });
    }

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [enabled, itemCount, computeVisibleCount, containerRef, trailingRef]);

  return isMeasuring ? itemCount : visibleCount;
}

function useMoreLabel(override?: string) {
  const t = useTranslations("ui");
  return override ?? t("moreTabs");
}

function normalizeHrefPath(href: string): string {
  const withoutHash = href.split("#")[0] ?? href;
  const withoutQuery = withoutHash.split("?")[0] ?? withoutHash;
  return withoutQuery.length > 1 && withoutQuery.endsWith("/")
    ? withoutQuery.slice(0, -1)
    : withoutQuery;
}

type TabsListProps = React.ComponentProps<typeof TabsPrimitive.List> & {
  /**
   * "page" (default): full-width page tab strip.
   * "inline": contained horizontal tab strip for dialogs, popovers, drawers, and nested panels.
   */
  variant?: "page" | "inline";
  /**
   * Whether a page-level tab strip sticks to the top on scroll. Defaults to true.
   * Secondary page tab bars under a primary mobile tab nav automatically become non-sticky on mobile.
   */
  sticky?: boolean;
  /**
   * When variant="page", removes top ApplicationPage padding and merges seamlessly with MobileNavbar.
   * Set to false when intentional header/KPI content sits above the tabs.
   */
  flush?: boolean;
  /** Optional compact trailing control (e.g. an icon-only filter or refresh button). */
  trailing?: React.ReactNode;
  /** Override the localized label for the overflow menu button. */
  moreLabel?: string;
  /** Disable overflow collapsing (e.g. for intentional multi-row grids or palettes). */
  disableOverflow?: boolean;
};

function TabsList({
  className,
  children,
  variant = "page",
  sticky = true,
  flush = true,
  trailing,
  moreLabel: moreLabelProp,
  disableOverflow,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...props
}: TabsListProps) {
  const { activeValue, selectTab, rootRef } = React.useContext(TabsContext);
  const moreLabel = useMoreLabel(moreLabelProp);
  const [moreOpen, setMoreOpen] = React.useState(false);
  const tour = useOnboardingTour();
  React.useEffect(() => {
    const closeForTourNavigation = () => setMoreOpen(false);
    document.addEventListener("zyx:tour-navigate", closeForTourNavigation);
    return () => document.removeEventListener("zyx:tour-navigate", closeForTourNavigation);
  }, []);

  const barRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<Array<HTMLElement | null>>([]);
  const moreRef = React.useRef<HTMLDivElement>(null);
  const trailingRef = React.useRef<HTMLDivElement>(null);

  const items = React.useMemo(() => flattenTabChildren(children), [children]);
  const itemMetas = React.useMemo(() => items.map((item) => extractTabMeta(item)), [items]);
  const enabledValues = React.useMemo(
    () => itemMetas.flatMap((meta) => (meta && !meta.disabled ? [meta.value] : [])),
    [itemMetas]
  );
  const swipeStateRef = React.useRef({
    values: enabledValues,
    activeValue,
    selectTab,
  });
  React.useEffect(() => {
    swipeStateRef.current = { values: enabledValues, activeValue, selectTab };
  }, [enabledValues, activeValue, selectTab]);

  React.useEffect(() => {
    return registerMobileTabSwipe({
      getContainer: () => {
        const root = rootRef?.current ?? barRef.current?.closest<HTMLElement>("[data-slot='tabs']") ?? null;
        if (!root) return barRef.current?.parentElement ?? null;
        return root.querySelector("[role='tabpanel']") ? root : root.parentElement ?? root;
      },
      getNavElement: () => barRef.current,
      getState: () => {
        const { values, activeValue: current } = swipeStateRef.current;
        return {
          count: values.length,
          activeIndex: current !== undefined ? values.indexOf(current) : -1,
        };
      },
      navigate: (nextIndex) => {
        const { values, selectTab: select } = swipeStateRef.current;
        const target = values[nextIndex];
        if (target && select) select(target);
      },
    });
  }, [rootRef]);
  const contentSignature = React.useMemo(
    () => items.map((item) => extractTextSignature(item)).join("||"),
    [items]
  );

  const isCustomLayout = Boolean(
    disableOverflow || (variant === "inline" && className && /\b(grid|flex-wrap)\b/.test(className))
  );

  const rawVisibleCount = useOverflowTabs(
    items.length,
    contentSignature,
    !isCustomLayout,
    barRef,
    itemRefs,
    moreRef,
    trailingRef
  );

  // Never hide items whose metadata could not be extracted for the overflow menu.
  const overflowEntries = React.useMemo(() => {
    if (isCustomLayout || rawVisibleCount >= items.length) return [];
    const result: Array<{ index: number; meta: ExtractedTabMeta }> = [];
    for (let i = rawVisibleCount; i < items.length; i++) {
      const meta = itemMetas[i];
      if (meta) {
        result.push({ index: i, meta });
      }
    }
    return result;
  }, [isCustomLayout, rawVisibleCount, items.length, itemMetas]);

  const overflowIndexSet = React.useMemo(
    () => new Set(overflowEntries.map((entry) => entry.index)),
    [overflowEntries]
  );

  const hasOverflow = overflowEntries.length > 0;
  const hasActiveOverflow = overflowEntries.some((entry) => entry.meta.value === activeValue);

  if (isCustomLayout) {
    return (
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-tabs-variant={variant}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cn(tabListClassName, className)}
        {...props}
      >
        {children}
      </TabsPrimitive.List>
    );
  }

  return (
    <div
      ref={barRef}
      data-slot="tabs-list"
      data-tabs-variant={variant}
      data-sticky-tabs-bar={variant === "page" ? (flush ? "flush" : "inset") : undefined}
      data-tabs-sticky={variant === "page" ? (sticky ? "true" : "false") : undefined}
      className={cn(
        variant === "page"
          ? sticky
            ? tabListStickyBarClassName
            : tabListPageBarClassName
          : tabListClassName,
        className
      )}
    >
      <TabsPrimitive.List
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className="flex min-w-0 flex-nowrap items-stretch gap-0.5"
        {...props}
      >
        {items.map((item, index) => {
          if (overflowIndexSet.has(index)) return null;
          return (
            <div
              key={item.key ?? index}
              role="none"
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              className="flex shrink-0 items-stretch"
            >
              {item}
            </div>
          );
        })}
      </TabsPrimitive.List>

      {(hasOverflow || trailing) && (
        <div className="ml-auto flex shrink-0 items-stretch">
          {hasOverflow && (
            <div ref={moreRef} className="flex shrink-0 items-center">
              <span aria-hidden className="my-2.5 h-4 w-px shrink-0 bg-border/70" />
              <DropdownMenu modal={!tour.active} open={moreOpen} onOpenChange={setMoreOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    data-slot="tabs-more-trigger"
                    data-active={hasActiveOverflow ? "true" : undefined}
                    className={cn(
                      tabTriggerClassName,
                      hasActiveOverflow && tabTriggerActiveClassName
                    )}
                  >
                    <span>{moreLabel}</span>
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        "size-3.5 shrink-0 transition-transform duration-150",
                        moreOpen && "rotate-180"
                      )}
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  onInteractOutside={event => { if (tour.active) event.preventDefault(); }}
                  align="end"
                  sideOffset={6}
                  className="w-56 rounded-xl border border-border bg-popover p-1.5 shadow-lg"
                >
                  {overflowEntries.map(({ meta }) => {
                    const isActive = meta.value === activeValue;
                    if (meta.href) {
                      return (
                        <DropdownMenuItem
                          key={meta.value}
                          asChild
                          disabled={meta.disabled}
                          className={cn(
                            tabOverflowItemClassName,
                            isActive && tabOverflowItemActiveClassName
                          )}
                        >
                          <Link
                            href={meta.href}
                            aria-current={isActive ? "page" : undefined}
                            onClick={() => setMoreOpen(false)}
                          >
                            {meta.label}
                          </Link>
                        </DropdownMenuItem>
                      );
                    }
                    return (
                      <DropdownMenuItem
                        key={meta.value}
                        disabled={meta.disabled}
                        data-tour={meta.tourTarget}
                        aria-current={isActive ? "true" : undefined}
                        onSelect={() => {
                          selectTab?.(meta.value);
                        }}
                        className={cn(
                          tabOverflowItemClassName,
                          isActive && tabOverflowItemActiveClassName
                        )}
                      >
                        {meta.label}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {trailing && (
            <div
              ref={trailingRef}
              className={cn(
                "flex shrink-0 items-center gap-1 pl-1.5",
                variant === "page" && "pr-2 md:pr-0"
              )}
            >
              {trailing}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        tabTriggerClassName,
        "data-[state=active]:text-foreground data-[state=active]:after:bg-[var(--workspace-tab-indicator,var(--primary))] data-[state=active]:hover:bg-transparent",
        className
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("mt-4 min-w-0 outline-hidden", className)} {...props} />;
}

type TabNavItem = {
  href: string;
  label: React.ReactNode;
  active?: boolean;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
};

function TabNav({
  tabs,
  label,
  variant = "page",
  sticky = true,
  flush = true,
  primaryMobileNav = false,
  activeTone = "primary",
  trailing,
  moreLabel: moreLabelProp,
  disableOverflow,
  className,
}: {
  tabs: TabNavItem[];
  label?: string;
  variant?: "page" | "inline";
  sticky?: boolean;
  flush?: boolean;
  primaryMobileNav?: boolean;
  activeTone?: "primary" | "neutral";
  trailing?: React.ReactNode;
  moreLabel?: string;
  disableOverflow?: boolean;
  className?: string;
}) {
  const activeTriggerClass = cn(tabTriggerActiveClassName, activeTone === "neutral" && "after:bg-foreground");
  const activeOverflowClass = cn(tabOverflowItemActiveClassName, activeTone === "neutral" && "before:bg-foreground");
  const pathname = usePathname();
  const router = useRouter();
  const t = useTranslations("ui");
  const moreLabel = moreLabelProp ?? t("moreTabs");
  const [moreOpen, setMoreOpen] = React.useState(false);
  const tour = useOnboardingTour();
  React.useEffect(() => {
    const closeForTourNavigation = () => setMoreOpen(false);
    document.addEventListener("zyx:tour-navigate", closeForTourNavigation);
    return () => document.removeEventListener("zyx:tour-navigate", closeForTourNavigation);
  }, []);

  const navRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<Array<HTMLElement | null>>([]);
  const moreRef = React.useRef<HTMLDivElement>(null);
  const trailingRef = React.useRef<HTMLDivElement>(null);

  const contentSignature = React.useMemo(
    () => tabs.map((tab) => `${tab.href}:${extractTextSignature(tab.label)}`).join("||"),
    [tabs]
  );

  const visibleCount = useOverflowTabs(
    tabs.length,
    contentSignature,
    !disableOverflow,
    navRef,
    itemRefs,
    moreRef,
    trailingRef
  );

  // Longest-prefix matching when explicit `active` flags are not provided.
  const resolvedTabs = React.useMemo(() => {
    const hasExplicitActive = tabs.some((tab) => tab.active !== undefined);
    if (hasExplicitActive) {
      return tabs.map((tab) => ({ ...tab, isActive: Boolean(tab.active) }));
    }
    const normalizedPath = normalizeHrefPath(pathname);
    let bestIndex = -1;
    let bestLength = -1;
    tabs.forEach((tab, index) => {
      const target = normalizeHrefPath(tab.href);
      const matches = normalizedPath === target || normalizedPath.startsWith(`${target}/`);
      if (matches && target.length > bestLength) {
        bestLength = target.length;
        bestIndex = index;
      }
    });
    return tabs.map((tab, index) => ({ ...tab, isActive: index === bestIndex }));
  }, [tabs, pathname]);

  const swipeTabsRef = React.useRef(resolvedTabs);
  const routerRef = React.useRef(router);
  React.useEffect(() => {
    swipeTabsRef.current = resolvedTabs;
    routerRef.current = router;
  }, [resolvedTabs, router]);

  React.useEffect(() => {
    return registerMobileTabSwipe({
      getContainer: () => navRef.current?.parentElement ?? null,
      getNavElement: () => navRef.current,
      getState: () => {
        const current = swipeTabsRef.current;
        return {
          count: current.length,
          activeIndex: current.findIndex((tab) => tab.isActive),
        };
      },
      navigate: (nextIndex) => {
        const target = swipeTabsRef.current[nextIndex];
        if (target && !target.isActive) {
          void hapticSelection();
          routerRef.current?.push?.(target.href);
        }
      },
    });
  }, []);

  const overflowTabs =
    !disableOverflow && visibleCount < resolvedTabs.length
      ? resolvedTabs.slice(visibleCount)
      : [];
  const hasOverflow = overflowTabs.length > 0;
  const hasActiveOverflow = overflowTabs.some((tab) => tab.isActive);

  return (
    <nav
      aria-label={label ?? t("sectionNavigation")}
      data-slot="tabs-list"
      data-tabs-variant={variant}
      data-sticky-tabs-bar={variant === "page" ? (flush ? "flush" : "inset") : undefined}
      data-tabs-sticky={variant === "page" ? (sticky ? "true" : "false") : undefined}
      data-primary-mobile-tabs={primaryMobileNav ? "" : undefined}
      className={cn(
        variant === "page"
          ? sticky
            ? tabListStickyBarClassName
            : tabListPageBarClassName
          : tabListClassName,
        className
      )}
      ref={navRef}
    >
      <div className="flex min-w-0 flex-nowrap items-stretch gap-0.5">
        {resolvedTabs.map((tab, index) => {
          if (hasOverflow && index >= visibleCount) return null;
          return (
            <div
              key={tab.href}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              className="flex shrink-0 items-stretch"
            >
              <Link
                href={tab.href}
                aria-current={tab.isActive ? "page" : undefined}
                onClick={() => {
                  if (!tab.isActive) void hapticSelection();
                }}
                className={cn(
                  tabTriggerClassName,
                  tab.isActive ? activeTriggerClass : "text-muted-foreground"
                )}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {tab.badge}
              </Link>
            </div>
          );
        })}
      </div>

      {(hasOverflow || trailing) && (
        <div className="ml-auto flex shrink-0 items-stretch">
          {hasOverflow && (
            <div ref={moreRef} className="flex shrink-0 items-center">
              <span aria-hidden className="my-2.5 h-4 w-px shrink-0 bg-border/70" />
              <DropdownMenu modal={!tour.active} open={moreOpen} onOpenChange={setMoreOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    data-slot="tabs-more-trigger"
                    data-active={hasActiveOverflow ? "true" : undefined}
                    className={cn(
                      tabTriggerClassName,
                      hasActiveOverflow && activeTriggerClass
                    )}
                  >
                    <span>{moreLabel}</span>
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        "size-3.5 shrink-0 transition-transform duration-150",
                        moreOpen && "rotate-180"
                      )}
                    />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  onInteractOutside={event => { if (tour.active) event.preventDefault(); }}
                  align="end"
                  sideOffset={6}
                  className="w-56 rounded-xl border border-border bg-popover p-1.5 shadow-lg"
                >
                  {overflowTabs.map((tab) => (
                    <DropdownMenuItem
                      key={tab.href}
                      asChild
                      className={cn(
                        tabOverflowItemClassName,
                        tab.isActive && activeOverflowClass
                      )}
                    >
                      <Link
                        href={tab.href}
                        aria-current={tab.isActive ? "page" : undefined}
                        onClick={() => {
                          if (!tab.isActive) void hapticSelection();
                          setMoreOpen(false);
                        }}
                      >
                        {tab.icon}
                        <span>{tab.label}</span>
                        {tab.badge}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          {trailing && (
            <div
              ref={trailingRef}
              className={cn(
                "flex shrink-0 items-center gap-1 pl-1.5",
                variant === "page" && "pr-2 md:pr-0"
              )}
            >
              {trailing}
            </div>
          )}
        </div>
      )}
    </nav>
  );
}

export {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  TabNav,
  tabListClassName,
  tabListPageBarClassName,
  tabListStickyBarClassName,
  tabTriggerClassName,
  tabTriggerActiveClassName,
  tabOverflowItemClassName,
  tabOverflowItemActiveClassName,
};
export type { TabNavItem };
