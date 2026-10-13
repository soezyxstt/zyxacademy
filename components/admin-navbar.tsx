"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { NavProfileOrSignIn } from "@/components/nav-profile-or-sign-in";
import { useCommandMenu } from "@/components/command-menu";

export function AdminNavbar() {
 const { setOpen: setSearchOpen } = useCommandMenu();

 return (
 <header className="supports-[backdrop-filter]:bg-background/80 fixed top-0 right-0 left-0 z-50 border-b border-border bg-background/95 backdrop-blur">
 <nav
 className="mx-auto flex w-full max-w-7xl min-w-0 items-center justify-between gap-4 px-3 py-3.5 sm:px-4 md:py-4 lg:px-5"
 aria-label="Admin"
 >
 <Link href="/admin" className="-m-px flex shrink-0 items-center p-px">
 <Logo variant="symbol" className="lg:hidden [--logo-height:2rem]" />
 <Logo variant="horizontal" className="hidden lg:flex [--logo-height:1.25rem]" />
 </Link>

 <div className="flex shrink-0 items-center gap-2 md:gap-3">
 <Button
 variant="ghost"
 size="icon"
 className="text-muted-foreground size-10 shrink-0 rounded-full"
 type="button"
 onClick={() => setSearchOpen(true)}
 aria-label="Cari situs"
 >
 <Search className="size-[1.125rem]" />
 </Button>
 <Button asChild variant="ghost" className="text-muted-foreground h-10 shrink-0 px-3">
 <Link href="/">Beranda</Link>
 </Button>
 {/* No Lihat paket / Sign In on admin ; logged-in admins still see profile. */}
 <NavProfileOrSignIn variant="toolbar" callbackURL="/dashboard" showSignIn={false} />
 </div>
 </nav>
 </header>
 );
}
