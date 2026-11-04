"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { SiteMain } from "@/components/site-main";
import { CommandMenuProvider } from "@/components/command-menu";

export function DemoAwareMarketingLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const demo = /^\/(?:en\/|id\/)?demo(?:\/|$)/.test(pathname);
  if (demo) return <>{children}</>;
  return <CommandMenuProvider><Navbar /><SiteMain>{children}</SiteMain><Footer /></CommandMenuProvider>;
}
