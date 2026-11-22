"use client";

import React, { useState, useEffect, useCallback, useRef, type ReactNode } from "react";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Search,
  PanelLeftOpen,
  PanelLeftClose,
  ChevronDown,
  Pin,
  Archive,
} from "lucide-react";
import { DropdownMenu, HoverCard } from "radix-ui";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { useCommandMenu } from "@/components/command-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { AppUpdateControl } from "@/components/native/app-update-control";
import { StudentAccountBoundary } from "@/components/student-account-boundary";
import { SidebarAccountMenu } from "@/components/auth/sidebar-account-menu";
import { useStudentExperience } from "@/components/student-experience-provider";
import { useTranslations } from "@/lib/i18n/client";
import { useSwipe } from "@/hooks/use-swipe";
import { isMaterialReaderPathname } from "@/lib/materials/reader-layout";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

export function SidebarTooltip({
  label,
  children,
  collapsed,
}: {
  label: string;
  children: ReactNode;
  collapsed: boolean;
}) {
  if (!collapsed) return <>{children}</>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {label}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function NavItem({
  href,
  icon: Icon,
  label,
  active,
  onClick,
  className,
  collapsed,
  isChild,
  prefetch,
  trailing,
  badge,
  onPin,
  onArchive,
  isPinned,
}: {
  href?: string;
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  collapsed: boolean;
  isChild?: boolean;
  prefetch?: boolean;
  trailing?: ReactNode;
  badge?: ReactNode;
  onPin?: (e: React.MouseEvent) => void;
  onArchive?: (e: React.MouseEvent) => void;
  isPinned?: boolean;
}) {
  const baseClass = cn(
    "group/item relative flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-body-sm font-medium transition-colors w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active
      ? "bg-muted/80 text-foreground"
      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
    collapsed && "justify-center px-0 size-10 shrink-0 mx-auto",
    isChild && !collapsed && "rounded-lg px-2.5 py-1.5 gap-2",
    className
  );

  const content = (
    <>
      <Icon className={cn("shrink-0", isChild ? "size-3.5" : "size-4")} />
      {!collapsed && (
        <span className="truncate whitespace-nowrap flex-1 text-left min-w-0">
          <span className="hover-marquee">{label}</span>
        </span>
      )}
      {!collapsed && (
        <div className="flex items-center gap-1 shrink-0">
          {badge && (
            typeof badge === "string" ? (
              <span
                className={cn(
                  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider leading-none select-none shrink-0 border transition-colors",
                  active
                    ? "border-brand-primary/30 bg-brand-primary/15 text-brand-primary"
                    : "border-border/60 bg-muted/60 text-muted-foreground group-hover/item:text-foreground group-hover/item:border-border/90"
                )}
              >
                {badge}
              </span>
            ) : (
              badge
            )
          )}
          {trailing}
          {onPin && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onPin(e);
              }}
              title={isPinned ? "Lepas sematan" : "Sematkan tab"}
              className={cn(
                "p-1 rounded-md transition-all cursor-pointer",
                isPinned
                  ? "opacity-100 text-brand-primary hover:bg-brand-primary/10"
                  : "opacity-0 group-hover/item:opacity-100 text-muted-foreground/60 hover:text-foreground hover:bg-muted"
              )}
            >
              <Pin className="size-3.5 fill-current" />
            </button>
          )}
          {onArchive && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onArchive(e);
              }}
              title="Arsipkan tab"
              className="opacity-0 group-hover/item:opacity-100 p-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-all cursor-pointer"
            >
              <Archive className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </>
  );

  const tooltipLabel =
    collapsed && badge && typeof badge === "string" ? `${label} (${badge})` : label;

  const inner = href ? (
    <Link href={href} prefetch={prefetch} onClick={onClick as undefined} className={baseClass} aria-label={collapsed ? tooltipLabel : undefined} aria-current={active ? "page" : undefined}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={collapsed ? tooltipLabel : undefined} className={cn(baseClass, "cursor-pointer")}>
      {content}
    </button>
  );

  return (
    <SidebarTooltip label={tooltipLabel} collapsed={collapsed}>
      {inner}
    </SidebarTooltip>
  );
}

interface SidebarContextValue {
  isMobile: boolean;
  collapsed: boolean;
  activePopoverId: string | null;
  setActivePopoverId: (id: string | null) => void;
}

const SidebarContext = React.createContext<SidebarContextValue>({
  isMobile: false,
  collapsed: false,
  activePopoverId: null,
  setActivePopoverId: () => {},
});

export function useSidebar() {
  return React.useContext(SidebarContext);
}

export function NavCollapsible({
  id,
  icon: Icon,
  label,
  active,
  defaultOpen,
  collapsed,
  children,
  trailing,
  previewItems,
}: {
  id?: string;
  icon: React.ElementType;
  label: string;
  active?: boolean;
  defaultOpen?: boolean;
  collapsed: boolean;
  children: ReactNode;
  trailing?: ReactNode;
  previewItems?: string[];
}) {
  const { isMobile, activePopoverId, setActivePopoverId } = useSidebar();
  const [isOpen, setIsOpen] = useState(defaultOpen || active);

  const itemId = id || label.toLowerCase().replace(/[^a-z0-9]/g, "-");
  const isPopoverOpen = activePopoverId === itemId;

  useEffect(() => {
    if (active) {
      setIsOpen(true);
    }
  }, [active]);

  const expandedChildren = React.Children.map(children, (child) => {
    if (React.isValidElement(child)) {
      const childProps = child.props as { onClick?: (e: React.MouseEvent) => void };
      return React.cloneElement(child, {
        collapsed: false,
        isChild: false,
        onClick: (e: React.MouseEvent) => {
          childProps.onClick?.(e);
          setActivePopoverId(null);
        },
      } as Record<string, unknown>);
    }
    return child;
  });

  const triggerButton = (
    <button
      type="button"
      aria-expanded={isOpen}
      onClick={() => {
        if (!collapsed) setIsOpen(!isOpen);
      }}
      className={cn(
        "group/collapsible flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-body-sm font-medium transition-colors w-full cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && !isOpen
          ? "bg-brand-primary/10 text-brand-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        collapsed && "justify-center px-0 size-10 mx-auto"
      )}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && (
        <>
          <span className="truncate whitespace-nowrap flex-1 text-left min-w-0">
            <span className="hover-marquee">{label}</span>
          </span>
          {trailing}
          <ChevronDown
            className={cn(
              "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
              !isOpen && "-rotate-90"
            )}
            aria-hidden="true"
          />
        </>
      )}
    </button>
  );

  return (
    <div className="flex flex-col gap-0.5 w-full">
      {collapsed ? (
        <DropdownMenu.Root
          open={isPopoverOpen}
          onOpenChange={(open) => setActivePopoverId(open ? itemId : null)}
          modal={false}
        >
          <SidebarTooltip label={label} collapsed={collapsed && !isPopoverOpen}>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label={label}
                className={cn(
                  "group/collapsible flex items-center justify-center rounded-xl size-10 mx-auto text-body-sm font-medium transition-colors cursor-pointer",
                  active || isPopoverOpen
                    ? "bg-brand-primary/10 text-brand-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Icon className="size-4 shrink-0" />
              </button>
            </DropdownMenu.Trigger>
          </SidebarTooltip>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              side="right"
              align="start"
              sideOffset={12}
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest("a, button")) {
                  setActivePopoverId(null);
                }
              }}
              className="z-50 min-w-56 max-w-72 rounded-xl border border-border bg-popover p-2 text-popover-foreground shadow-md focus:outline-none"
            >
              <div className="flex items-center gap-2.5 px-2.5 py-2 pb-2.5 border-b border-border/60 mb-1.5">
                <div className="flex size-7 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary shrink-0">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm font-semibold text-foreground truncate">{label}</p>
                </div>
              </div>
              <div className="flex flex-col gap-0.5 max-h-80 overflow-y-auto ds-scrollbar">
                {expandedChildren}
              </div>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      ) : !isOpen && !isMobile ? (
        <HoverCard.Root openDelay={250} closeDelay={150}>
          <HoverCard.Trigger asChild>
            {triggerButton}
          </HoverCard.Trigger>
          <HoverCard.Portal>
            <HoverCard.Content
              side="right"
              align="start"
              sideOffset={14}
              className="z-50 w-64 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-md"
            >
              <div className="flex items-center gap-2.5 pb-2.5 border-b border-border/60">
                <div className="flex size-7 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary shrink-0">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm font-semibold text-foreground truncate">{label}</p>
                  <p className="text-body-xs text-muted-foreground">Kategori modul</p>
                </div>
              </div>
              {previewItems && previewItems.length > 0 && (
                <div className="mt-2.5 flex flex-col gap-1.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">
                    Modul di dalamnya:
                  </p>
                  <div className="flex flex-col gap-1">
                    {previewItems.map((item, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 text-body-xs text-foreground/80 px-1.5 py-1 rounded-md bg-muted/40"
                      >
                        <span className="size-1.5 rounded-full bg-brand-primary/70 shrink-0" />
                        <span className="truncate">{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </HoverCard.Content>
          </HoverCard.Portal>
        </HoverCard.Root>
      ) : (
        triggerButton
      )}
      {!collapsed && (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
          <CollapsibleContent>
            <div className="flex flex-col gap-0.5 pl-1.5 border-l border-border/60 ml-4.5 my-0.5 min-w-0">
              {children}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}



export function NavGroup({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) {
    return <div className="h-2 w-full" />;
  }
  return (
    <div className="px-2.5 pt-2.5 pb-1">
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase font-sans">
        {label}
      </p>
    </div>
  );
}

function SidebarUserMenu({ collapsed }: { collapsed: boolean }) {
  return <StudentAccountBoundary>{({ data }) => data?.user ? <SidebarAccountMenu collapsed={collapsed} session={data} /> : null}</StudentAccountBoundary>;
}

interface SidebarShellProps {
  collapsedKey: string;
  logoHref: string;
  logoLabel: string;
  nav: (collapsed: boolean) => ReactNode;
  headerActions?: (collapsed: boolean) => ReactNode;
  topSection?: (collapsed: boolean) => ReactNode;
  bottomSection?: (collapsed: boolean) => ReactNode;
  showAccountTools?: boolean;
}

export function SidebarShell({
  collapsedKey,
  logoHref,
  logoLabel,
  nav,
  headerActions,
  topSection,
  bottomSection,
  showAccountTools = true,
}: SidebarShellProps) {
  const t = useTranslations("common");
  const actualPathname = usePathname();
  const experience = useStudentExperience();
  const pathname = experience.pathname ?? actualPathname;
  const { setOpen: setSearchOpen } = useCommandMenu();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [modKeyHint, setModKeyHint] = useState("Ctrl + K");
  const [activePopoverId, setActivePopoverId] = useState<string | null>(null);
  const isMaterialReaderRoute = isMaterialReaderPathname(pathname);
  const [readerCollapsed, setReaderCollapsed] = useState(isMaterialReaderRoute);

  const sidebarRef = useRef<HTMLElement>(null);

  useSwipe({
    onSwipeRight: (startX) => {
      const edge = Math.max(60, window.innerWidth * 0.15);
      if (isMobile && !mobileOpen && startX <= edge) setMobileOpen(true);
    },
    onSwipeLeft: () => {
      if (isMobile && mobileOpen) setMobileOpen(false);
    },
  });

  useEffect(() => {
    setMounted(true);
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    setModKeyHint(/Mac|iPhone|iPod|iPad/i.test(ua) ? "\u2318K" : "Ctrl + K");

    const stored = localStorage.getItem(collapsedKey);
    if (stored !== null) {
      setCollapsed(stored === "true");
    } else {
      setCollapsed(window.innerWidth < 768);
    }

    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [collapsedKey]);

  useEffect(() => {
    setMobileOpen(false);
    setActivePopoverId(null);
    setReaderCollapsed(isMaterialReaderRoute);
  }, [isMaterialReaderRoute, pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const isPortal = (e.target as HTMLElement)?.closest?.(
        '[data-radix-portal], [role="listbox"], [role="dialog"], [role="combobox"]'
      );
      if (!isPortal && sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [mobileOpen]);

  useEffect(() => {
    if (!mounted) return;
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen, mounted]);

  const isCollapsed = isMobile ? false : readerCollapsed || collapsed;

  useEffect(() => {
    setActivePopoverId(null);
  }, [isCollapsed]);

  useEffect(() => {
    const handleOpen = () => setMobileOpen(true);
    const handleClose = () => setMobileOpen(false);
    const handleToggle = () => setMobileOpen((prev) => !prev);

    window.addEventListener("zyx:open-mobile-sidebar", handleOpen);
    window.addEventListener("zyx:close-mobile-sidebar", handleClose);
    window.addEventListener("zyx:toggle-mobile-sidebar", handleToggle);

    return () => {
      window.removeEventListener("zyx:open-mobile-sidebar", handleOpen);
      window.removeEventListener("zyx:close-mobile-sidebar", handleClose);
      window.removeEventListener("zyx:toggle-mobile-sidebar", handleToggle);
    };
  }, []);

  const toggleCollapsed = useCallback(() => {
    if (readerCollapsed) {
      setReaderCollapsed(false);
      return;
    }
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(collapsedKey, String(next));
      return next;
    });
  }, [collapsedKey, readerCollapsed]);

  return (
    <SidebarContext.Provider
      value={{
        isMobile,
        collapsed: isCollapsed,
        activePopoverId,
        setActivePopoverId,
      }}
    >
      {mounted && mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden cursor-pointer"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        ref={sidebarRef}
        data-sidebar-ready={mounted ? "true" : undefined}
        aria-hidden={mounted && isMobile && !mobileOpen ? true : undefined}
        inert={mounted && isMobile && !mobileOpen}
        style={{
          top: 0,
          height: "100svh",
          ...(isMobile
            ? { translate: mobileOpen ? "0 0" : "-100% 0" }
            : {}),
        }}
        className={cn(
          "flex flex-col shrink-0 overflow-hidden",
          "border-r border-border bg-card",
          "transition-[translate,width] duration-300 ease-in-out",
          "fixed inset-y-0 left-0 z-50 shadow-xl w-[clamp(248px,80vw,300px)] -translate-x-full",
          "md:sticky md:top-0 md:self-start md:translate-x-0 md:z-30 md:shadow-none",
          isCollapsed ? "md:w-[64px]" : "md:w-[248px]"
        )}
      >
        {/* Top Header Bar */}
        <div
          className={cn(
            "flex h-11 shrink-0 items-center border-b border-border/60 gap-0.5",
            isCollapsed ? "justify-center px-1.5" : "px-2.5"
          )}
        >
          {!isCollapsed ? (
            <>
              <Link href={logoHref} aria-label={logoLabel} className="flex flex-1 min-w-0 items-center pl-1">
                <Logo variant="symbol" className="[--logo-height:1.25rem]" />
              </Link>

              <SidebarTooltip label="Back" collapsed={false}>
                <button
                  type="button"
                  onClick={() => window.history.back()}
                  aria-label="Back"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors cursor-pointer"
                >
                  <ArrowLeft className="size-4" />
                </button>
              </SidebarTooltip>

              <SidebarTooltip label="Forward" collapsed={false}>
                <button
                  type="button"
                  onClick={() => window.history.forward()}
                  aria-label="Forward"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors cursor-pointer"
                >
                  <ArrowRight className="size-4" />
                </button>
              </SidebarTooltip>

              {headerActions?.(false)}

              {showAccountTools && <NotificationBell variant="sidebar" />}
              <AppUpdateControl variant="sidebar" />

              {showAccountTools && <SidebarTooltip label={t("searchWithShortcut", { shortcut: modKeyHint })} collapsed={false}>
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  aria-label={t("searchWithShortcut", { shortcut: modKeyHint })}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors cursor-pointer"
                >
                  <Search className="size-4" />
                </button>
              </SidebarTooltip>}

              <SidebarTooltip label={t("closeSidebar")} collapsed={false}>
                <button
                  type="button"
                  onClick={isMobile ? () => setMobileOpen(false) : toggleCollapsed}
                  aria-label={t("closeSidebar")}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors cursor-pointer"
                >
                  <PanelLeftClose className="size-4" />
                </button>
              </SidebarTooltip>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1 py-1">
              <SidebarTooltip label={t("openSidebar")} collapsed={true}>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  aria-label={t("openSidebar")}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors cursor-pointer"
                >
                  <PanelLeftOpen className="size-4" />
                </button>
              </SidebarTooltip>
            </div>
          )}
        </div>

        {/* Optional Top Section (e.g. Streak strip) */}
        {topSection?.(isCollapsed)}

        {/* Collapsed quick navigation, search & header actions */}
        {isCollapsed && (
          <div className="px-1 py-1.5 shrink-0 flex flex-col items-center gap-1 border-b border-border/60">
            <div className="flex items-center gap-0.5">
              <SidebarTooltip label="Back" collapsed={true}>
                <button
                  type="button"
                  onClick={() => window.history.back()}
                  aria-label="Back"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors cursor-pointer"
                >
                  <ArrowLeft className="size-3.5" />
                </button>
              </SidebarTooltip>
              <SidebarTooltip label="Forward" collapsed={true}>
                <button
                  type="button"
                  onClick={() => window.history.forward()}
                  aria-label="Forward"
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors cursor-pointer"
                >
                  <ArrowRight className="size-3.5" />
                </button>
              </SidebarTooltip>
            </div>
            {showAccountTools && <SidebarTooltip label={t("searchWithShortcut", { shortcut: modKeyHint })} collapsed={true}>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label={t("searchWithShortcut", { shortcut: modKeyHint })}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors cursor-pointer"
              >
                <Search className="size-4" />
              </button>
            </SidebarTooltip>}
            {headerActions?.(true)}
          </div>
        )}

        {/* Main Navigation */}
        {nav(isCollapsed)}

        {/* Optional Bottom Section */}
        {bottomSection?.(isCollapsed)}

        {/* Bottom User Profile Section (Gambar 3 style) */}
        <div
          className={cn(
            "border-t border-border/70 p-2 shrink-0 bg-card/50",
            isCollapsed && "flex justify-center p-1.5"
          )}
        >
          {showAccountTools && <SidebarUserMenu collapsed={isCollapsed} />}
        </div>
      </aside>
    </SidebarContext.Provider>
  );
}

export function openMobileSidebar() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("zyx:open-mobile-sidebar"));
  }
}

export function closeMobileSidebar() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("zyx:close-mobile-sidebar"));
  }
}

export function toggleMobileSidebar() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("zyx:toggle-mobile-sidebar"));
  }
}
