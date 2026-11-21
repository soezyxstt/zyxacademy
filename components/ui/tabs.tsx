"use client";

import * as React from "react";
import { Tabs as TabsPrimitive } from "radix-ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUrlTab } from "@/hooks/use-url-tab";
import { useTranslations } from "next-intl";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  tabListClassName,
  tabListStickyBarClassName,
  tabTriggerClassName,
  tabTriggerActiveClassName,
  tabOverflowItemClassName,
  tabOverflowItemActiveClassName,
} from "@/components/ui/tab-styles";

type TabsContextValue = {
  activeValue?: string;
  selectTab?: (value: string) => void;
};

const TabsContext = React.createContext<TabsContextValue>({});

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
    () => ({ activeValue, selectTab: handleValueChange }),
    [activeValue, handleValueChange]
  );

  return (
    <TabsContext.Provider value={ctxValue}>
      <TabsPrimitive.Root
        value={activeValue}
        onValueChange={handleValueChange}
        defaultValue={activeValue !== undefined ? undefined : defaultValue}
        className={cn("max-w-full min-w-0", className)}
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
  const isControlled = value !== undefined;
  const [localTab, setLocalTab] = React.useState<string | undefined>(
    typeof defaultValue === "string" ? defaultValue : undefined
  );

  const activeValue = isControlled ? value : localTab;

  const handleValueChange = React.useCallback(
    (newVal: string) => {
      if (!isControlled) {
        setLocalTab(newVal);
      }
      onValueChange?.(newVal);
    },
    [isControlled, onValueChange]
  );

  const ctxValue = React.useMemo(
    () => ({ activeValue, selectTab: handleValueChange }),
    [activeValue, handleValueChange]
  );

  return (
    <TabsContext.Provider value={ctxValue}>
      <TabsPrimitive.Root
        value={activeValue}
        onValueChange={handleValueChange}
        defaultValue={activeValue !== undefined ? undefined : defaultValue}
        className={cn("max-w-full min-w-0", className)}
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
};

function extractTabMeta(node: React.ReactNode): ExtractedTabMeta | null {
  if (!React.isValidElement(node)) return null;
  const props = node.props as {
    value?: unknown;
    children?: React.ReactNode;
    disabled?: boolean;
    "aria-label"?: string;
    asChild?: boolean;
  };

  if (typeof props.value === "string") {
    let label: React.ReactNode = props.children;
    if (props.asChild && React.isValidElement(props.children)) {
      const innerProps = props.children.props as { children?: React.ReactNode };
      label = innerProps.children ?? props["aria-label"] ?? props.value;
    }
    return {
      value: props.value,
      label: label ?? props["aria-label"] ?? props.value,
      disabled: props.disabled,
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
  enabled: boolean,
  containerRef: React.RefObject<HTMLElement | null>,
  itemRefs: React.MutableRefObject<Array<HTMLElement | null>>,
  moreRef: React.RefObject<HTMLElement | null>,
  trailingRef: React.RefObject<HTMLElement | null>
) {
  const [visibleCount, setVisibleCount] = React.useState(itemCount);
  const widthsRef = React.useRef<number[]>([]);
  const prevCountRef = React.useRef(itemCount);

  if (prevCountRef.current !== itemCount) {
    prevCountRef.current = itemCount;
    widthsRef.current = [];
  }

  const recalculate = React.useCallback(() => {
    if (!enabled) {
      setVisibleCount(itemCount);
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

    for (let i = 0; i < itemCount; i++) {
      const el = itemRefs.current[i];
      if (el && el.offsetWidth > 0) {
        widthsRef.current[i] = Math.ceil(el.getBoundingClientRect().width);
      }
    }

    let totalWidth = trailingWidth;
    for (let i = 0; i < itemCount; i++) {
      const w = widthsRef.current[i] ?? 0;
      totalWidth += (i > 0 ? ITEM_GAP_PX : 0) + w;
    }

    if (totalWidth <= available + 1) {
      setVisibleCount((prev) => (prev === itemCount ? prev : itemCount));
      return;
    }

    const moreWidth = moreRef.current && moreRef.current.offsetWidth > 0
      ? Math.ceil(moreRef.current.getBoundingClientRect().width) + 4
      : MORE_BUTTON_FALLBACK_WIDTH;

    const budget = available - moreWidth - trailingWidth;
    let used = 0;
    let fit = 0;

    for (let i = 0; i < itemCount; i++) {
      const w = widthsRef.current[i] ?? 80;
      const next = fit === 0 ? w : used + ITEM_GAP_PX + w;
      if (next <= budget) {
        used = next;
        fit++;
      } else {
        break;
      }
    }

    setVisibleCount((prev) => (prev === fit ? prev : fit));
  }, [enabled, itemCount, containerRef, itemRefs, moreRef, trailingRef]);

  React.useLayoutEffect(() => {
    setVisibleCount(itemCount);
  }, [itemCount]);

  React.useLayoutEffect(() => {
    recalculate();
  }, [recalculate, itemCount]);

  React.useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      recalculate();
    });
    observer.observe(container);
    if (trailingRef.current) {
      observer.observe(trailingRef.current);
    }

    let cancelled = false;
    if (typeof document !== "undefined" && document.fonts?.ready) {
      document.fonts.ready.then(() => {
        if (!cancelled) recalculate();
      });
    }

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [enabled, recalculate, containerRef, trailingRef]);

  return visibleCount;
}

function useSafeMoreLabel(override?: string) {
  const t = useTranslations("ui");
  return override ?? t("moreTabs");
}

type TabsListProps = React.ComponentProps<typeof TabsPrimitive.List> & {
  /**
   * "page" (default): full-width sticky navbar-attached tab strip.
   * "inline": contained horizontal tab strip for dialogs, popovers, drawers, and nested panels.
   */
  variant?: "page" | "inline";
  /**
   * When variant="page", removes top ApplicationPage padding and merges seamlessly with MobileNavbar.
   * Set to false when intentional header/KPI content sits above the tabs.
   */
  flush?: boolean;
  /** Optional compact trailing control (e.g. an icon-only filter or refresh button). */
  trailing?: React.ReactNode;
  /** Override the localized label for the overflow popover button. */
  moreLabel?: string;
  /** Disable overflow collapsing (e.g. for intentional multi-row grids or palettes). */
  disableOverflow?: boolean;
};

function TabsList({
  className,
  children,
  variant = "page",
  flush = true,
  trailing,
  moreLabel: moreLabelProp,
  disableOverflow,
  ...props
}: TabsListProps) {
  const { activeValue, selectTab } = React.useContext(TabsContext);
  const moreLabel = useSafeMoreLabel(moreLabelProp);
  const [moreOpen, setMoreOpen] = React.useState(false);

  const listRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<Array<HTMLElement | null>>([]);
  const moreRef = React.useRef<HTMLDivElement>(null);
  const trailingRef = React.useRef<HTMLDivElement>(null);

  const items = React.useMemo(() => flattenTabChildren(children), [children]);
  const isCustomLayout = Boolean(
    disableOverflow || (variant === "inline" && className && /\b(grid|flex-wrap)\b/.test(className))
  );

  const visibleCount = useOverflowTabs(
    items.length,
    !isCustomLayout,
    listRef,
    itemRefs,
    moreRef,
    trailingRef
  );

  const overflowEntries = React.useMemo(() => {
    if (isCustomLayout || visibleCount >= items.length) return [];
    const result: Array<{ index: number; meta: ExtractedTabMeta }> = [];
    for (let i = visibleCount; i < items.length; i++) {
      const meta = extractTabMeta(items[i]);
      if (meta) {
        result.push({ index: i, meta });
      }
    }
    return result;
  }, [isCustomLayout, visibleCount, items]);

  const hasOverflow = overflowEntries.length > 0;
  const hasActiveOverflow = overflowEntries.some((entry) => entry.meta.value === activeValue);

  const handleOverflowSelect = (value: string, index: number) => {
    setMoreOpen(false);
    if (selectTab) {
      selectTab(value);
      return;
    }
    const el = itemRefs.current[index];
    const trigger = el?.querySelector<HTMLElement>('[role="tab"]');
    trigger?.click();
  };

  return (
    <TabsPrimitive.List
      ref={listRef}
      data-slot="tabs-list"
      data-tabs-variant={variant}
      data-sticky-tabs-bar={variant === "page" ? (flush ? "flush" : "inset") : undefined}
      className={cn(
        variant === "page" ? tabListStickyBarClassName : tabListClassName,
        className
      )}
      {...props}
    >
      {items.map((item, index) => {
        const isOverflowed = hasOverflow && index >= visibleCount;
        if (isCustomLayout) {
          return item;
        }
        return (
          <div
            key={item.key ?? index}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            className={cn("flex shrink-0 items-stretch", isOverflowed && "hidden")}
          >
            {item}
          </div>
        );
      })}

      {(hasOverflow || trailing) && !isCustomLayout && (
        <div className="ml-auto flex shrink-0 items-stretch">
          {hasOverflow && (
            <div ref={moreRef} className="flex shrink-0 items-center">
              <span aria-hidden className="my-2.5 h-4 w-px shrink-0 bg-border/70" />
              <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    data-slot="tabs-more-trigger"
                    data-state={moreOpen ? "open" : "closed"}
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
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  sideOffset={6}
                  className="w-56 rounded-xl border border-border bg-popover p-1.5 shadow-lg"
                >
                  <div className="flex flex-col gap-0.5" role="menu">
                    {overflowEntries.map(({ index, meta }) => {
                      const isActive = meta.value === activeValue;
                      return (
                        <button
                          key={meta.value}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isActive}
                          disabled={meta.disabled}
                          onClick={() => handleOverflowSelect(meta.value, index)}
                          className={cn(
                            tabOverflowItemClassName,
                            isActive && tabOverflowItemActiveClassName
                          )}
                        >
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {trailing && (
            <div
              ref={trailingRef}
              className="flex shrink-0 items-center gap-1 pr-2 pl-1.5 md:pr-0"
            >
              {trailing}
            </div>
          )}
        </div>
      )}
    </TabsPrimitive.List>
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        tabTriggerClassName,
        "data-[state=active]:text-foreground data-[state=active]:after:bg-primary data-[state=active]:hover:bg-transparent",
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
  flush = true,
  trailing,
  className,
}: {
  tabs: TabNavItem[];
  label?: string;
  variant?: "page" | "inline";
  flush?: boolean;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const t = useTranslations("ui");
  const [moreOpen, setMoreOpen] = React.useState(false);

  const navRef = React.useRef<HTMLDivElement>(null);
  const itemRefs = React.useRef<Array<HTMLElement | null>>([]);
  const moreRef = React.useRef<HTMLDivElement>(null);
  const trailingRef = React.useRef<HTMLDivElement>(null);

  const visibleCount = useOverflowTabs(
    tabs.length,
    true,
    navRef,
    itemRefs,
    moreRef,
    trailingRef
  );

  const resolvedTabs = tabs.map((tab) => ({
    ...tab,
    isActive:
      tab.active !== undefined
        ? tab.active
        : pathname === tab.href || pathname.startsWith(`${tab.href}/`),
  }));

  const overflowTabs = visibleCount < resolvedTabs.length ? resolvedTabs.slice(visibleCount) : [];
  const hasOverflow = overflowTabs.length > 0;
  const hasActiveOverflow = overflowTabs.some((tab) => tab.isActive);

  return (
    <nav
      aria-label={label ?? t("sectionNavigation")}
      data-tabs-variant={variant}
      data-sticky-tabs-bar={variant === "page" ? (flush ? "flush" : "inset") : undefined}
      className={cn(
        variant === "page" ? tabListStickyBarClassName : tabListClassName,
        className
      )}
      ref={navRef}
    >
      {resolvedTabs.map((tab, index) => {
        const isOverflowed = hasOverflow && index >= visibleCount;
        return (
          <div
            key={tab.href}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            className={cn("flex shrink-0 items-stretch", isOverflowed && "hidden")}
          >
            <Link
              href={tab.href}
              aria-current={tab.isActive ? "page" : undefined}
              className={cn(
                tabTriggerClassName,
                tab.isActive ? tabTriggerActiveClassName : "text-muted-foreground"
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.badge}
            </Link>
          </div>
        );
      })}

      {(hasOverflow || trailing) && (
        <div className="ml-auto flex shrink-0 items-stretch">
          {hasOverflow && (
            <div ref={moreRef} className="flex shrink-0 items-center">
              <span aria-hidden className="my-2.5 h-4 w-px shrink-0 bg-border/70" />
              <Popover open={moreOpen} onOpenChange={setMoreOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    data-slot="tabs-more-trigger"
                    data-state={moreOpen ? "open" : "closed"}
                    data-active={hasActiveOverflow ? "true" : undefined}
                    className={cn(
                      tabTriggerClassName,
                      hasActiveOverflow && tabTriggerActiveClassName
                    )}
                  >
                    <span>{t("moreTabs")}</span>
                    <ChevronDown
                      aria-hidden
                      className={cn(
                        "size-3.5 shrink-0 transition-transform duration-150",
                        moreOpen && "rotate-180"
                      )}
                    />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  sideOffset={6}
                  className="w-56 rounded-xl border border-border bg-popover p-1.5 shadow-lg"
                >
                  <div className="flex flex-col gap-0.5">
                    {overflowTabs.map((tab) => (
                      <Link
                        key={tab.href}
                        href={tab.href}
                        aria-current={tab.isActive ? "page" : undefined}
                        onClick={() => setMoreOpen(false)}
                        className={cn(
                          tabOverflowItemClassName,
                          tab.isActive && tabOverflowItemActiveClassName
                        )}
                      >
                        {tab.icon}
                        <span>{tab.label}</span>
                        {tab.badge}
                      </Link>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {trailing && (
            <div
              ref={trailingRef}
              className="flex shrink-0 items-center gap-1 pr-2 pl-1.5 md:pr-0"
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
  tabListStickyBarClassName,
  tabTriggerClassName,
  tabTriggerActiveClassName,
  tabOverflowItemClassName,
  tabOverflowItemActiveClassName,
};
export type { TabNavItem };
