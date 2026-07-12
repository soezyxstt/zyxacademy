"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Search, PanelLeftOpen, PanelLeftClose, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { useCommandMenu } from "@/components/command-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/lib/auth-client";
import { useSwipe } from "@/hooks/use-swipe";
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
        <TooltipContent side="right">{label}</TooltipContent>
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
  prefetch = true,
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
}) {
  const baseClass = cn(
    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-sm font-medium transition-colors w-full",
    active
      ? "bg-brand-primary/10 text-brand-primary font-semibold"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
    collapsed && "justify-center px-0 size-10 mx-auto",
    isChild && !collapsed && "pl-11", // Indent children
    className
  );

  const content = (
    <>
      <Icon className={cn("shrink-0", isChild ? "size-4" : "size-5")} />
      {!collapsed && <span className="truncate whitespace-nowrap">{label}</span>}
    </>
  );

  const inner = href ? (
    <Link href={href} prefetch={prefetch} onClick={onClick as undefined} className={baseClass}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cn(baseClass, "cursor-pointer")}>
      {content}
    </button>
  );

  return (
    <SidebarTooltip label={label} collapsed={collapsed}>
      {inner}
    </SidebarTooltip>
  );
}

export function NavCollapsible({
  icon: Icon,
  label,
  active,
  defaultOpen,
  collapsed,
  children,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  defaultOpen?: boolean;
  collapsed: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen || active);

  // If sidebar is collapsed, we hide children completely and clicking it could just expand the sidebar.
  // But wait, the toggle function for sidebar is in SidebarShell, we don't have it here.
  // We'll just let the user expand sidebar manually, or we can just ignore clicks if collapsed.

  return (
    <div className="flex flex-col gap-1 w-full">
      <SidebarTooltip label={label} collapsed={collapsed}>
        <button
          type="button"
          onClick={() => {
            if (!collapsed) setIsOpen(!isOpen);
          }}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-sm font-medium transition-colors w-full cursor-pointer",
            active && !isOpen
              ? "bg-brand-primary/10 text-brand-primary font-semibold"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
            collapsed && "justify-center px-0 size-10 mx-auto"
          )}
        >
          <Icon className="size-5 shrink-0" />
          {!collapsed && (
            <>
              <span className="truncate whitespace-nowrap flex-1 text-left">{label}</span>
              {isOpen ? (
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              )}
            </>
          )}
        </button>
      </SidebarTooltip>
      {!collapsed && isOpen && (
        <div className="flex flex-col gap-1 w-full animate-in slide-in-from-top-1 fade-in-50 duration-150">
          {children}
        </div>
      )}
    </div>
  );
}

export function NavGroup({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) {
    return <div className="h-4 w-full" />; // Spacer
  }
  return (
    <div className="px-3 pt-4 pb-1">
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
    </div>
  );
}

interface SidebarShellProps {
  collapsedKey: string;
  logoHref: string;
  logoLabel: string;
  nav: (collapsed: boolean) => ReactNode;
  topSection?: (collapsed: boolean) => ReactNode;
  bottomSection?: (collapsed: boolean) => ReactNode;
}

export function SidebarShell({
  collapsedKey,
  logoHref,
  logoLabel,
  nav,
  topSection,
  bottomSection,
}: SidebarShellProps) {
  const pathname = usePathname();
  const { setOpen: setSearchOpen } = useCommandMenu();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [modKeyHint, setModKeyHint] = useState("Ctrl + K");

  const sidebarRef = useRef<HTMLElement>(null);

  useSwipe({
    onSwipeRight: (startX) => {
      const edge = Math.max(60, window.innerWidth * 0.15);
      if (isMobile && !mobileOpen && startX <= edge) setMobileOpen(true);
    },
    onSwipeLeft: () => {
      if (isMobile && mobileOpen) setMobileOpen(false);
    }
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
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [mobileOpen]);

  useEffect(() => {
    if (!mounted) return;
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen, mounted]);

  const isCollapsed = isMobile ? false : collapsed;

  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(collapsedKey, String(next));
      return next;
    });
  }, [collapsedKey]);

  const handleLogout = async () => {
    await signOut();
    window.location.href = "/";
  };

  return (
    <>
      {mounted && mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden cursor-pointer"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {mounted && !mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="flex size-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground shadow-sm fixed top-3 left-3 z-40 md:hidden"
        >
          <PanelLeftOpen className="size-4" />
        </button>
      )}

      <aside
        ref={sidebarRef}
        style={{
          top: 0,
          height: "100svh",
          ...(isMobile
            ? { transform: mobileOpen ? "translateX(0)" : "translateX(-100%)" }
            : {}),
        }}
        className={cn(
          "flex flex-col shrink-0 overflow-hidden",
          "border-r border-border bg-card",
          "transition-transform duration-300 ease-in-out",
          "fixed inset-y-0 left-0 z-50 shadow-xl w-[clamp(248px,80vw,300px)] -translate-x-full",
          "md:sticky md:top-0 md:self-start md:translate-x-0 md:z-30 md:shadow-none",
          isCollapsed ? "md:w-[64px]" : "md:w-[248px]"
        )}
      >
        <div className="flex h-14 shrink-0 items-center border-b border-border px-3 gap-2">
          {!isCollapsed && (
            <Link href={logoHref} aria-label={logoLabel} className="flex flex-1 min-w-0 items-center">
              <Logo className="[--logo-height:1.75rem]" />
            </Link>
          )}
          {isCollapsed && <div className="flex-1" />}

          <SidebarTooltip label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} collapsed={isCollapsed}>
            <button
              type="button"
              onClick={isMobile ? () => setMobileOpen(false) : toggleCollapsed}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
            >
              {isCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          </SidebarTooltip>

          {!isCollapsed && <ThemeToggle mode="sidebar" />}
        </div>

        {topSection?.(isCollapsed)}

        <div className="px-3 pt-3 shrink-0">
          <SidebarTooltip label={`Search ${modKeyHint}`} collapsed={isCollapsed}>
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-muted-foreground transition-all hover:bg-muted/70 hover:text-foreground cursor-pointer",
                isCollapsed ? "size-10 mx-auto px-0" : "w-full"
              )}
            >
              <Search className="size-4 shrink-0" />
              {!isCollapsed && (
                <kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[10px] font-mono leading-none font-semibold">
                  {modKeyHint}
                </kbd>
              )}
            </button>
          </SidebarTooltip>
        </div>

        {nav(isCollapsed)}

        {bottomSection?.(isCollapsed)}

        {isCollapsed && (
          <div className="flex justify-center pb-2">
            <ThemeToggle mode="sidebar" />
          </div>
        )}

        <SidebarTooltip label="Keluar" collapsed={isCollapsed}>
          <button
            type="button"
            onClick={handleLogout}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer shrink-0 mx-3 mb-3",
              isCollapsed && "justify-center size-10 mx-auto px-0"
            )}
          >
            <LogOut className="size-5 shrink-0" />
            {!isCollapsed && <span>Keluar</span>}
          </button>
        </SidebarTooltip>
      </aside>
    </>
  );
}
