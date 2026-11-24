"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowDownToLine, ArrowUpRight, Menu, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Logo } from "@/components/logo";
import { NavProfileOrSignIn } from "@/components/nav-profile-or-sign-in";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useCommandMenu } from "@/components/command-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { LanguageMenu } from "@/components/language-menu";
import { localizedPublicPath } from "@/lib/public-locale-routes";
import { useSwipe } from "@/hooks/use-swipe";
import { cn } from "@/lib/utils";

const links = [
  ["nav.plans", "/plans"], ["nav.about", "/about"],
  ["nav.testimonials", "/testimonial"], ["nav.blog", "/blog"],
] as const;

export function Navbar() {
  const t = useTranslations("marketing");
  const pathname = usePathname();
  const { locale } = useAppLocale();
  const hrefFor = (path: string) => localizedPublicPath(locale, path) ?? path;
  const { setOpen: setSearchOpen } = useCommandMenu();
  const [open, setOpen] = useState(false);
  const [desktopNav, setDesktopNav] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const header = useRef<HTMLElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useSwipe({
    onSwipeLeft: x => { if (window.innerWidth < 1024 && x >= window.innerWidth - 48) setOpen(true); },
    onSwipeRight: () => setOpen(false),
  });

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      setDesktopNav(query.matches);
      if (query.matches) setOpen(false);
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector("a")?.focus();
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) { setOpen(false); toggle.current?.focus(); }
    };
    const outside = (e: Event) => {
      if (e.target instanceof Element && !header.current?.contains(e.target) &&
          !e.target.closest('[role="menu"], [role="dialog"]')) setOpen(false);
    };
    window.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    return () => {
      window.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
    };
  }, [open]);

  const searchButton = (
    <TooltipProvider><Tooltip><TooltipTrigger asChild>
      <Button variant="ghost" size="icon" className="size-9" aria-label={t("nav.search")} onClick={() => { setOpen(false); setSearchOpen(true); }}>
        <Search aria-hidden />
      </Button>
    </TooltipTrigger><TooltipContent>{t("nav.search")}</TooltipContent></Tooltip></TooltipProvider>
  );
  const downloadButton = (
    <Button variant="marketingPrimary" asChild className="h-10 gap-2 px-4 no-underline! max-lg:mb-1 max-lg:h-14 max-lg:w-full max-lg:justify-between max-lg:px-5">
      <Link href={hrefFor("/download")} onClick={() => setOpen(false)}>{t("nav.download")}<ArrowDownToLine aria-hidden /></Link>
    </Button>
  );

  return (
    <header ref={header} className="fixed inset-x-0 top-0 z-50 border-b border-border/70 bg-background/95 backdrop-blur-md">
      {open && <div aria-hidden="true" className="fixed inset-x-0 top-full -z-10 h-dvh bg-black/25 lg:hidden" onClick={() => { setOpen(false); toggle.current?.focus(); }} />}
      <nav aria-label={t("nav.primary")} className="marketing-container flex min-h-14 items-center justify-between gap-2 md:min-h-16 lg:justify-start lg:gap-0">
        <Link href={hrefFor("/")} onClick={() => setOpen(false)} aria-label={t("nav.homeBrand")} className="flex min-h-10 shrink-0 items-center">
          <Logo className="[--logo-height:0.95rem] sm:[--logo-height:1.15rem]" />
        </Link>
        <div id="mobile-navigation" ref={panel} className={cn(
          "flex-col lg:contents",
          "max-lg:absolute max-lg:inset-x-0 max-lg:top-full max-lg:max-h-[calc(100dvh-4rem)] max-lg:overflow-y-auto max-lg:overscroll-contain max-lg:border-b max-lg:border-border max-lg:bg-background max-lg:px-5 max-lg:pb-4 max-lg:shadow-lg",
          open ? "flex" : "max-lg:hidden",
        )}>
          <ul className="flex flex-col lg:mx-auto lg:flex-row lg:items-center lg:gap-5 xl:gap-6">
            {links.map(([key, path]) => (
              <li key={path} className="max-lg:border-b max-lg:border-border">
                <Link href={hrefFor(path)} onClick={() => setOpen(false)} aria-current={pathname === hrefFor(path) || pathname === path ? "page" : undefined}
                  className="flex min-h-14 items-center justify-between text-body-base font-medium no-underline! hover:text-primary aria-[current=page]:text-primary lg:min-h-10 lg:text-body-sm">
                  {t(key)}<ArrowUpRight className="size-4 text-muted-foreground lg:hidden" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-1 max-lg:flex-wrap max-lg:pt-4">
            {!desktopNav && downloadButton}
            <div className="flex items-center gap-1 lg:mr-2 lg:border-r lg:border-border lg:pr-3">
              {desktopNav && searchButton}
              <LanguageMenu /><ThemeToggle />
            </div>
            {desktopNav && downloadButton}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 sm:gap-1 lg:ml-2">
          {!desktopNav && searchButton}
          <NotificationBell variant="navbar" />
          <NavProfileOrSignIn variant="marketing" callbackURL="/dashboard" />
          <Button ref={toggle} variant="ghost" size="icon" className="size-10 lg:hidden" aria-expanded={open} aria-controls="mobile-navigation"
            aria-label={t(open ? "nav.closeMenu" : "nav.openMenu")} onClick={() => setOpen(!open)}>
            {open ? <X aria-hidden /> : <Menu aria-hidden />}
          </Button>
        </div>
      </nav>
    </header>
  );
}
