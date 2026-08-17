"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LogOut,
  Search,
  PanelLeftOpen,
  PanelLeftClose,
  ChevronDown,
  ChevronRight,
  User,
  LayoutDashboard,
  ShieldCheck,
  GraduationCap,
  Sun,
  Moon,
  Monitor,
  ChevronsUpDown,
  Pin,
  Archive,
} from "lucide-react";
import { DropdownMenu, HoverCard } from "radix-ui";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/logo";
import { useCommandMenu } from "@/components/command-menu";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { signOut, useSession } from "@/lib/auth-client";
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
  prefetch = true,
  trailing,
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
  onPin?: (e: React.MouseEvent) => void;
  onArchive?: (e: React.MouseEvent) => void;
  isPinned?: boolean;
}) {
  const baseClass = cn(
    "group/item relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-body-sm font-medium transition-colors w-full",
    active
      ? "bg-brand-primary/10 text-brand-primary font-semibold"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
    collapsed && "justify-center px-0 size-10 mx-auto",
    isChild && !collapsed && "pl-8 text-body-xs py-1.5",
    className
  );

  const content = (
    <>
      <Icon className={cn("shrink-0", isChild ? "size-3.5" : "size-4.5")} />
      {!collapsed && (
        <span className="truncate whitespace-nowrap flex-1 text-left min-w-0">
          <span className="hover-marquee">{label}</span>
        </span>
      )}
      {!collapsed && (
        <div className="flex items-center gap-0.5 shrink-0">
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
  trailing,
  previewItems,
}: {
  icon: React.ElementType;
  label: string;
  active?: boolean;
  defaultOpen?: boolean;
  collapsed: boolean;
  children: ReactNode;
  trailing?: ReactNode;
  previewItems?: string[];
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen || active);

  useEffect(() => {
    if (active) {
      setIsOpen(true);
    }
  }, [active]);

  const triggerButton = (
    <button
      type="button"
      onClick={() => {
        if (!collapsed) setIsOpen(!isOpen);
      }}
      className={cn(
        "group/collapsible flex items-center gap-2.5 rounded-xl px-3 py-2 text-body-sm font-medium transition-colors w-full cursor-pointer",
        active && !isOpen
          ? "bg-brand-primary/10 text-brand-primary font-semibold"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
        collapsed && "justify-center px-0 size-10 mx-auto"
      )}
    >
      <Icon className="size-4.5 shrink-0" />
      {!collapsed && (
        <>
          <span className="truncate whitespace-nowrap flex-1 text-left min-w-0">
            <span className="hover-marquee">{label}</span>
          </span>
          {trailing}
          {isOpen ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground transition-transform" />
          )}
        </>
      )}
    </button>
  );

  return (
    <div className="flex flex-col gap-0.5 w-full">
      {collapsed ? (
        <SidebarTooltip label={label} collapsed={collapsed}>
          {triggerButton}
        </SidebarTooltip>
      ) : (
        <HoverCard.Root openDelay={250} closeDelay={150}>
          <HoverCard.Trigger asChild>
            {triggerButton}
          </HoverCard.Trigger>
          <HoverCard.Portal>
            <HoverCard.Content
              side="right"
              align="start"
              sideOffset={14}
              className="z-50 w-64 rounded-xl border border-border/80 bg-popover/95 p-3.5 text-popover-foreground shadow-lg backdrop-blur-md animate-in fade-in-0 zoom-in-95 data-[side=right]:slide-in-from-left-2"
            >
              <div className="flex items-center gap-2.5 pb-2.5 border-b border-border/60">
                <div className="flex size-7 items-center justify-center rounded-lg bg-brand-primary/10 text-brand-primary shrink-0">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-body-sm font-semibold text-foreground truncate">{label}</p>
                  <p className="text-[11px] text-muted-foreground">Kategori modul</p>
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
                        className="flex items-center gap-2 text-[12px] text-foreground/80 px-1.5 py-1 rounded-md bg-muted/40"
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
      )}
      {!collapsed && isOpen && (
        <div className="flex flex-col gap-0.5 w-full animate-in slide-in-from-top-1 fade-in-50 duration-150 pl-1 border-l border-border/50 ml-4 my-0.5">
          {children}
        </div>
      )}
    </div>
  );
}


export function NavGroup({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) {
    return <div className="h-2 w-full" />;
  }
  return (
    <div className="px-3 pt-3 pb-1">
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase font-sans">
        {label}
      </p>
    </div>
  );
}

function SidebarUserMenu({ collapsed }: { collapsed: boolean }) {
  const { data: session } = useSession();
  const { theme, setTheme } = useTheme();

  if (!session?.user) return null;

  const name = session.user.name?.trim() || "Pengguna";
  const email = session.user.email || "";
  const role = (session.user as { role?: string | null }).role;

  const handleLogout = async () => {
    await signOut();
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/";
  };

  const trigger = collapsed ? (
    <button
      type="button"
      className="flex size-10 items-center justify-center rounded-xl hover:bg-muted/80 text-foreground transition-colors cursor-pointer mx-auto shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Akun (${name})`}
    >
      {session.user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={session.user.image}
          alt={name}
          className="size-8 rounded-full object-cover ring-1 ring-border"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </button>
  ) : (
    <button
      type="button"
      className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-muted/80 transition-colors cursor-pointer group shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {session.user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={session.user.image}
          alt={name}
          className="size-8 rounded-full object-cover ring-1 ring-border shrink-0"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-body-xs font-semibold text-foreground group-hover:text-foreground">
          {name}
        </p>
        <p className="truncate text-[11px] text-muted-foreground">
          {email}
        </p>
      </div>
      <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground transition-colors" />
    </button>
  );

  return (
    <DropdownMenu.Root>
      <SidebarTooltip label={name} collapsed={collapsed}>
        <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      </SidebarTooltip>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="top"
          align={collapsed ? "center" : "start"}
          sideOffset={8}
          className={cn(
            "z-50 min-w-56 overflow-hidden rounded-xl border border-border bg-popover p-1.5 shadow-xl",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2"
          )}
        >
          <div className="flex items-center gap-3 px-2 py-2">
            {session.user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt={name}
                className="size-9 rounded-full object-cover ring-1 ring-border shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-bold text-white">
                {name.charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-semibold text-foreground">
                {name}
              </p>
              <p className="truncate text-body-xs text-muted-foreground">
                {email}
              </p>
            </div>
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-border/60" />

          <DropdownMenu.Item asChild>
            <Link
              href="/profile"
              prefetch={true}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-body-sm text-foreground outline-none transition-colors hover:bg-muted data-[highlighted]:bg-muted"
            >
              <User className="size-4 shrink-0 text-muted-foreground" />
              <span>Pengaturan Profil</span>
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <Link
              href="/dashboard"
              prefetch={true}
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-body-sm text-foreground outline-none transition-colors hover:bg-muted data-[highlighted]:bg-muted"
            >
              <LayoutDashboard className="size-4 shrink-0 text-muted-foreground" />
              <span>Dashboard Siswa</span>
            </Link>
          </DropdownMenu.Item>

          {(role === "teacher" || role === "admin") && (
            <DropdownMenu.Item asChild>
              <Link
                href="/tutor"
                prefetch={true}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-body-sm text-foreground outline-none transition-colors hover:bg-muted data-[highlighted]:bg-muted"
              >
                <GraduationCap className="size-4 shrink-0 text-muted-foreground" />
                <span>Panel Pengajar</span>
              </Link>
            </DropdownMenu.Item>
          )}

          {role === "admin" && (
            <DropdownMenu.Item asChild>
              <Link
                href="/admin"
                prefetch={true}
                className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-body-sm text-foreground outline-none transition-colors hover:bg-muted data-[highlighted]:bg-muted"
              >
                <ShieldCheck className="size-4 shrink-0 text-muted-foreground" />
                <span>Panel Admin</span>
              </Link>
            </DropdownMenu.Item>
          )}

          <DropdownMenu.Separator className="my-1 h-px bg-border/60" />

          <div className="px-2.5 py-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 font-sans">
              Tema Tampilan
            </p>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => setTheme("light")}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium border transition-colors cursor-pointer",
                  theme === "light"
                    ? "border-brand-primary bg-brand-primary/10 text-brand-primary font-semibold"
                    : "border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <Sun className="size-3.5" />
                <span>Terang</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme("dark")}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium border transition-colors cursor-pointer",
                  theme === "dark"
                    ? "border-brand-primary bg-brand-primary/10 text-brand-primary font-semibold"
                    : "border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <Moon className="size-3.5" />
                <span>Gelap</span>
              </button>
              <button
                type="button"
                onClick={() => setTheme("system")}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium border transition-colors cursor-pointer",
                  theme === "system"
                    ? "border-brand-primary bg-brand-primary/10 text-brand-primary font-semibold"
                    : "border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                <Monitor className="size-3.5" />
                <span>Sistem</span>
              </button>
            </div>
          </div>

          <DropdownMenu.Separator className="my-1 h-px bg-border/60" />

          <DropdownMenu.Item
            onSelect={handleLogout}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-body-sm text-status-error outline-none transition-colors hover:bg-status-error/10 data-[highlighted]:bg-status-error/10"
          >
            <LogOut className="size-4 shrink-0" />
            <span className="font-semibold">Keluar</span>
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
  }, [pathname]);

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

  const isCollapsed = isMobile ? false : collapsed;

  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      localStorage.setItem(collapsedKey, String(next));
      return next;
    });
  }, [collapsedKey]);

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
          className="flex size-9 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground hover:text-foreground shadow-sm fixed top-3 left-3 z-40 md:hidden cursor-pointer"
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
          "transition-[transform,width] duration-300 ease-in-out",
          "fixed inset-y-0 left-0 z-50 shadow-xl w-[clamp(248px,80vw,300px)] -translate-x-full",
          "md:sticky md:top-0 md:self-start md:translate-x-0 md:z-30 md:shadow-none",
          isCollapsed ? "md:w-[64px]" : "md:w-[248px]"
        )}
      >
        {/* Top Header Bar */}
        <div
          className={cn(
            "flex h-14 shrink-0 items-center border-b border-border gap-1.5",
            isCollapsed ? "justify-center px-1.5" : "px-3"
          )}
        >
          {!isCollapsed ? (
            <>
              <Link href={logoHref} aria-label={logoLabel} className="flex flex-1 min-w-0 items-center">
                <Logo className="[--logo-height:1.75rem]" />
              </Link>

              <NotificationBell variant="sidebar" />

              <SidebarTooltip label={`Cari (${modKeyHint})`} collapsed={false}>
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  aria-label={`Cari (${modKeyHint})`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors cursor-pointer"
                >
                  <Search className="size-4" />
                </button>
              </SidebarTooltip>

              <SidebarTooltip label="Tutup sidebar" collapsed={false}>
                <button
                  type="button"
                  onClick={isMobile ? () => setMobileOpen(false) : toggleCollapsed}
                  aria-label="Tutup sidebar"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <PanelLeftClose className="size-4" />
                </button>
              </SidebarTooltip>
            </>
          ) : (
            <div className="flex flex-col items-center gap-1.5 py-1">
              <SidebarTooltip label="Buka sidebar" collapsed={true}>
                <button
                  type="button"
                  onClick={toggleCollapsed}
                  aria-label="Buka sidebar"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
                >
                  <PanelLeftOpen className="size-4" />
                </button>
              </SidebarTooltip>
            </div>
          )}
        </div>

        {/* Optional Top Section (e.g. Streak strip) */}
        {topSection?.(isCollapsed)}

        {/* Collapsed quick search button */}
        {isCollapsed && (
          <div className="px-1 pt-2 shrink-0 flex justify-center">
            <SidebarTooltip label={`Cari (${modKeyHint})`} collapsed={true}>
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label={`Cari (${modKeyHint})`}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-muted/40 text-muted-foreground hover:bg-muted/80 hover:text-foreground transition-colors cursor-pointer"
              >
                <Search className="size-4" />
              </button>
            </SidebarTooltip>
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
          <SidebarUserMenu collapsed={isCollapsed} />
        </div>
      </aside>
    </>
  );
}

