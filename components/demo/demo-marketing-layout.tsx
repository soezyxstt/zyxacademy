"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { SiteMain } from "@/components/site-main";
import { CommandMenuProvider } from "@/components/command-menu";
import { isNativeApp } from "@/lib/native/runtime";
import {
  ENTRY_REDIRECT_ROUTE,
  isNativeMarketingRedirectPath,
} from "@/lib/auth/dashboard-entry";

export function DemoAwareMarketingLayout({ children, footer }: { children: ReactNode; footer: ReactNode }) {
  const pathname = usePathname();
  const [redirectingNative, setRedirectingNative] = useState(false);

  useEffect(() => {
    if (!isNativeApp() || !isNativeMarketingRedirectPath(pathname)) {
      setRedirectingNative(false);
      return;
    }
    setRedirectingNative(true);
    window.location.replace(`${ENTRY_REDIRECT_ROUTE}?native=1`);
  }, [pathname]);

  if (redirectingNative) {
    return <div className="min-h-dvh bg-background" aria-busy="true" />;
  }

  const demo = /^\/(?:en\/|id\/)?demo(?:\/|$)/.test(pathname);
  if (demo) return <>{children}</>;
  return (
    <CommandMenuProvider>
      <div className="contents [--marketing-navbar-height:3.5rem] md:[--marketing-navbar-height:4rem]">
        <Navbar />
        <SiteMain>{children}</SiteMain>
        {footer}
      </div>
    </CommandMenuProvider>
  );
}
