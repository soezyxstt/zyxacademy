"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Search, PanelLeftOpen, PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { useCommandMenu } from "@/components/command-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/lib/auth-client";
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
}: {
  href?: string;
  icon: React.ElementType;
  label: string;
  active?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  collapsed: boolean;
}) {
  const baseClass = cn(
    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-sm font-medium transition-colors w-full",
    active
      ? "bg-brand-primary/10 text-brand-primary font-semibold"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
    collapsed && "justify-center px-0 size-10 mx-auto",
    className,
  );

  const content = (
    <>
      <Icon className="size-5 shrink-0" />
      {!collapsed && <span>{label}</span>}
    </>
  );

  const inner = href ? (
    <Link href={href} onClick={onClick as undefined} className={baseClass}>
      {content}
    </Link>
  ) : (
    <button
      type="button"
      onClick={onClick}
      className={cn(baseClass, "cursor-pointer")}
    >
      {content}
    </button>
  );

  return (
    <SidebarTooltip label={label} collapsed={collapsed}>
      {inner}
    </SidebarTooltip>
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
      if (
        sidebarRef.current &&
        !sidebarRef.current.contains(e.target as Node)
      ) {
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

  // Touch gestures (mobile only): swipe right from the left edge to open,
  // swipe left while open to close.
  useEffect(() => {
    if (!isMobile) return;

    const EDGE_ZONE = 24; // px from the left edge where an opening swipe may start
    const THRESHOLD = 60; // px of horizontal travel needed to trigger
    let startX = 0;
    let startY = 0;
    let tracking = false;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      // Only bother tracking if this gesture could act: near the left edge
      // (to open) or the panel is already open (to close).
      tracking = mobileOpen || startX <= EDGE_ZONE;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      // Ignore mostly-vertical swipes so page scrolling is unaffected.
      if (Math.abs(dx) < THRESHOLD || Math.abs(dx) < Math.abs(dy)) return;

      if (dx > 0 && !mobileOpen && startX <= EDGE_ZONE) {
        setMobileOpen(true);
      } else if (dx < 0 && mobileOpen) {
        setMobileOpen(false);
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [isMobile, mobileOpen]);

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
          "md:sticky md:top-0 md:translate-x-0 md:z-30 md:shadow-none",
          isCollapsed ? "md:w-[64px]" : "md:w-[248px]",
        )}
      >
        <div className="flex h-14 shrink-0 items-center border-b border-border px-3 gap-2">
          {!isCollapsed && (
            <Link
              href={logoHref}
              aria-label={logoLabel}
              className="flex flex-1 min-w-0 items-center"
            >
              <Logo className="[--logo-height:1.75rem]" />
            </Link>
          )}
          {isCollapsed && <div className="flex-1" />}

          <SidebarTooltip
            label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            collapsed={isCollapsed}
          >
            <button
              type="button"
              onClick={isMobile ? () => setMobileOpen(false) : toggleCollapsed}
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
            >
              {isCollapsed ? (
                <PanelLeftOpen className="size-4" />
              ) : (
                <PanelLeftClose className="size-4" />
              )}
            </button>
          </SidebarTooltip>

          {!isCollapsed && <ThemeToggle mode="sidebar" />}
        </div>

        {topSection?.(isCollapsed)}

        <div className="px-3 pt-3 shrink-0">
          <SidebarTooltip
            label={`Search ${modKeyHint}`}
            collapsed={isCollapsed}
          >
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-muted-foreground transition-all hover:bg-muted/70 hover:text-foreground cursor-pointer",
                isCollapsed ? "size-10 mx-auto px-0" : "w-full",
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
              isCollapsed && "justify-center size-10 mx-auto px-0",
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
