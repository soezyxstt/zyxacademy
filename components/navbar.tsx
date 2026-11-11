"use client";

import { useState } from "react";
import { useEffect } from "react";
import Link from "next/link";
import { Menu, Search, X, Tag, Info, Star, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
 Sheet,
 SheetContent,
 SheetTrigger,
 SheetTitle,
 SheetDescription,
 SheetClose,
} from "@/components/ui/sheet";
import { Logo } from "@/components/logo";
import { NavProfileOrSignIn } from "@/components/nav-profile-or-sign-in";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { useCommandMenu } from "@/components/command-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";
import { useSwipe } from "@/hooks/use-swipe";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { LanguageMenu } from "@/components/language-menu";
import { localizedPublicPath } from "@/lib/public-locale-routes";

const navLinks = [
 { key: "nav.plans", href: "/plans", icon: Tag },
 { key: "nav.about", href: "/about", icon: Info },
 { key: "nav.testimonials", href: "/testimonial", icon: Star },
 { key: "nav.blog", href: "/blog", icon: BookOpen },
];

export function Navbar() {
 const t = useTranslations("marketing");
 const { locale } = useAppLocale();
 const navHref = (href: string) => localizedPublicPath(locale, href) ?? href;
 const [mobileOpen, setMobileOpen] = useState(false);
 const { setOpen: setSearchOpen } = useCommandMenu();
 const [isScrolled, setIsScrolled] = useState(false);
 const [modKeyHint, setModKeyHint] = useState("Ctrl + K");

 useEffect(() => {
 const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
 setModKeyHint(/Mac|iPhone|iPod|iPad/i.test(ua) ? "⌘K" : "Ctrl + K");
 }, []);

 useEffect(() => {
 const onScroll = () => setIsScrolled(window.scrollY > 40);
 onScroll();
 window.addEventListener("scroll", onScroll, { passive: true });
 return () => window.removeEventListener("scroll", onScroll);
 }, []);

 useSwipe({
    onSwipeLeft: (startX) => {
      const edge = window.innerWidth - Math.max(60, window.innerWidth * 0.15);
      if (!mobileOpen && startX >= edge) {
        setMobileOpen(true);
      }
    },
    onSwipeRight: () => {
      if (mobileOpen) {
        setMobileOpen(false);
      }
    }
  });

 return (
 <header className="fixed top-0 left-0 right-0 z-50">
 <nav
 className={cn(
 "w-full border-b transition-all duration-200",
 isScrolled ? "backdrop-blur-md bg-background/80 border-border/40" : "bg-transparent border-transparent"
 )}
 aria-label={t("nav.primary")}
 >
 {/* Below lg: search + compact profile + drawer. lg+: centered links + Lihat paket + full profile. */}
 <div className="relative mx-auto flex min-h-14 min-w-0 w-full max-w-7xl items-center gap-2 px-4 py-3 sm:px-6 md:min-h-16 md:gap-3 md:py-3.5 lg:px-8">
 <Link
 href={navHref("/")}
 prefetch={false}
 className="relative z-10 -m-px flex shrink-0 items-center p-px"
 >
 <Logo variant="symbol" className="lg:hidden [--logo-height:2rem]" />
 <Logo variant="horizontal" className="hidden lg:flex [--logo-height:2rem]" />
 </Link>

 {/* Never use unconditional `hidden` + `md:flex` ; if `hidden` wins in CSS order, desktop links disappear. Prefer max-lg:hidden. */}
 <nav
 className="max-lg:hidden lg:pointer-events-none lg:absolute lg:inset-x-0 lg:top-0 lg:bottom-0 lg:flex lg:items-center lg:justify-center"
 aria-label={t("nav.mainMenu")}
 >
 <ul className="flex items-center gap-4 text-body-sm font-medium leading-none tracking-tight lg:pointer-events-auto lg:leading-normal xl:gap-5">
 {navLinks.map((link) => (
 <li key={link.href} className="flex shrink-0 items-center">
 <Link
 href={navHref(link.href)}
 prefetch={false}
 className="text-foreground/90 hover:text-brand-primary inline-flex items-center justify-center px-px py-0 transition-colors lg:min-h-10"
 >
 {t(link.key)}
 </Link>
 </li>
 ))}
 </ul>
 </nav>

 <div className="relative z-10 ml-auto flex min-w-0 shrink-0 items-center justify-end gap-1.5 md:gap-2.5">
  <button
  type="button"
  onClick={() => setSearchOpen(true)}
  title={t("nav.search")}
  aria-label={t("nav.searchShortcut")}
  className="max-lg:hidden flex items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/40 p-2 text-muted-foreground transition-all hover:bg-muted/70 hover:text-foreground cursor-pointer xl:px-2.5 xl:py-1.5"
  >
  <Search className="size-4 shrink-0" aria-hidden />
  <kbd className="hidden xl:inline-block bg-muted px-1.5 py-0.5 rounded border border-border text-[10px] font-mono leading-none font-semibold">
  {modKeyHint}
  </kbd>
  </button>

  <ThemeToggle />

  <LanguageMenu />

  <NotificationBell variant="navbar" />

  <NavProfileOrSignIn variant="toolbar" callbackURL="/dashboard" />

 <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
 <SheetTrigger asChild>
 <Button
 variant="ghost"
 className="inline-flex size-10 shrink-0 rounded-full lg:hidden"
 aria-expanded={mobileOpen}
 aria-controls="mobile-navigation"
 type="button"
 >
 {mobileOpen ? (
 <X className="size-6" strokeWidth={2} />
 ) : (
 <Menu className="size-6" strokeWidth={2} />
 )}
 <span className="sr-only">{mobileOpen ? t("nav.closeMenu") : t("nav.openMenu")}</span>
 </Button>
 </SheetTrigger>
 <SheetContent
 id="mobile-navigation"
 side="right"
 showCloseButton={false}
 className={cn(
 "gap-0 p-0",
 "flex h-full max-h-dvh w-[clamp(248px,80vw,300px)] flex-col border-l border-border bg-card shadow-xl",
 "pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]",
 )}
 >
 {/* sr-only title/description required by Radix for accessibility */}
 <SheetTitle className="sr-only">{t("nav.navigationMenu")}</SheetTitle>
 <SheetDescription className="sr-only">{t("nav.navigationDescription")}</SheetDescription>

 {/* Header: logo + close button ; mirrors student sidebar */}
 <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3">
 <SheetClose asChild>
 <Link href={navHref("/")} prefetch={false} className="flex items-center" aria-label={t("nav.home")}>
 <Logo variant="horizontal" className="[--logo-height:1.25rem]" />
 </Link>
 </SheetClose>
 <SheetClose asChild>
 <button
 type="button"
 aria-label={t("nav.closeMenu")}
 className="flex size-8 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground transition-colors"
 >
 <X className="size-4" />
 </button>
 </SheetClose>
 </div>

 {/* Search bar */}
 <div className="px-3 pt-3 shrink-0">
 <button
 type="button"
 onClick={() => {
 setMobileOpen(false);
 setSearchOpen(true);
 }}
 className="flex w-full items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 text-muted-foreground transition-all hover:bg-muted/70 hover:text-foreground cursor-pointer"
 >
 <Search className="size-4 shrink-0" aria-hidden />
 <span className="flex-1 text-left text-body-sm">{t("nav.searchPlaceholder")}</span>
 <kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[10px] font-mono leading-none font-semibold">
 {modKeyHint}
 </kbd>
 </button>
 </div>

 {/* Nav links */}
 <nav className="flex flex-1 flex-col gap-1 px-3 py-4 overflow-y-auto" aria-label={t("nav.mobileMenu")}>
 {navLinks.map(({ key, href, icon: Icon }) => (
 <SheetClose key={href} asChild>
 <Link
 href={navHref(href)}
 prefetch={false}
 className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
 >
 <Icon className="size-5 shrink-0" aria-hidden />
 {t(key)}
 </Link>
 </SheetClose>
 ))}
 </nav>

  {/* Profile / sign-in */}
  <div className="flex min-w-0 shrink-0 flex-col gap-3 border-t border-border px-3 py-3">
  <div className="flex min-w-0 items-center justify-end gap-1.5">
    <ThemeToggle />
    <LanguageMenu />
  </div>
  <NavProfileOrSignIn
  variant="sheet"
  callbackURL="/dashboard"
  onNavigate={() => setMobileOpen(false)}
  />
  </div>
 </SheetContent>
 </Sheet>
 </div>
 </div>
 </nav>
 </header>
 );
}
