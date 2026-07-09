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
import { useCommandMenu } from "@/components/command-menu";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const navLinks = [
 { name: "Paket", href: "/plans", icon: Tag },
 { name: "Tentang kami", href: "/about", icon: Info },
 { name: "Testimoni", href: "/testimonial", icon: Star },
 { name: "Blog", href: "/blog", icon: BookOpen },
];

export function Navbar() {
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

 return (
 <header className="fixed top-0 left-0 right-0 z-50">
 <nav
 className={cn(
 "w-full border-b transition-all duration-200",
 isScrolled ? "backdrop-blur-md bg-background/80 border-border/40" : "bg-transparent border-transparent"
 )}
 aria-label="Primary"
 >
 {/* Below lg: search + compact profile + drawer. lg+: centered links + Lihat paket + full profile. */}
 <div className="relative mx-auto flex min-h-14 min-w-0 w-full max-w-7xl items-center gap-2 px-4 py-3 sm:px-6 md:min-h-16 md:gap-3 md:py-3.5 lg:px-8">
 <Link
 href="/"
 prefetch={true}
 className="relative z-10 -m-px flex shrink-0 items-center p-px [&_img]:block [&_img]:align-middle [&_svg]:block"
 >
 <Logo className="[--logo-height:2rem] md:[--logo-height:2.25rem]" />
 </Link>

 {/* Never use unconditional `hidden` + `md:flex` ; if `hidden` wins in CSS order, desktop links disappear. Prefer max-lg:hidden. */}
 <nav
 className="max-lg:hidden lg:pointer-events-none lg:absolute lg:inset-x-0 lg:top-0 lg:bottom-0 lg:flex lg:items-center lg:justify-center"
 aria-label="Main menu"
 >
 <ul className="flex items-center gap-5 text-body-sm font-medium leading-none tracking-tight lg:pointer-events-auto lg:leading-normal">
 {navLinks.map((link) => (
 <li key={link.href} className="flex shrink-0 items-center">
 <Link
 href={link.href}
 prefetch={true}
 className="text-foreground/90 hover:text-brand-primary inline-flex items-center justify-center px-px py-0 transition-colors lg:min-h-10"
 >
 {link.name}
 </Link>
 </li>
 ))}
 </ul>
 </nav>

 <div className="relative z-10 ml-auto flex min-w-0 shrink-0 items-center justify-end gap-1.5 md:gap-2.5">
  <button
  type="button"
  onClick={() => setSearchOpen(true)}
  title="Search"
  aria-label="Cari di situs (pintasan Ctrl+K atau ⌘K)"
  className="max-lg:hidden flex items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-muted-foreground transition-all hover:bg-muted/70 hover:text-foreground cursor-pointer"
  >
  <Search className="size-4 shrink-0" aria-hidden />
  <kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[10px] font-mono leading-none font-semibold">
  {modKeyHint}
  </kbd>
  </button>

  <ThemeToggle />

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
 <span className="sr-only">{mobileOpen ? "Tutup menu" : "Buka menu"}</span>
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
 <SheetTitle className="sr-only">Menu navigasi</SheetTitle>
 <SheetDescription className="sr-only">Menu navigasi utama situs</SheetDescription>

 {/* Header: logo + close button ; mirrors student sidebar */}
 <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-3">
 <SheetClose asChild>
 <Link href="/" prefetch={true} className="flex items-center" aria-label="Beranda">
 <Logo className="[--logo-height:1.75rem]" />
 </Link>
 </SheetClose>
 <SheetClose asChild>
 <button
 type="button"
 aria-label="Tutup menu"
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
 <span className="flex-1 text-left text-body-sm">Cari di situs…</span>
 <kbd className="bg-muted px-1.5 py-0.5 rounded border border-border text-[10px] font-mono leading-none font-semibold">
 {modKeyHint}
 </kbd>
 </button>
 </div>

 {/* Nav links */}
 <nav className="flex flex-1 flex-col gap-1 px-3 py-4 overflow-y-auto" aria-label="Mobile menu">
 {navLinks.map(({ name, href, icon: Icon }) => (
 <SheetClose key={href} asChild>
 <Link
 href={href}
 prefetch={true}
 className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-body-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
 >
 <Icon className="size-5 shrink-0" aria-hidden />
 {name}
 </Link>
 </SheetClose>
 ))}
 </nav>

  {/* Profile / sign-in */}
  <div className="border-t border-border px-3 py-3 shrink-0 flex items-center justify-between gap-2">
  <ThemeToggle mode="sidebar" />
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
