"use client";

import { useEffect, type ReactNode } from "react";
import { useMobileNav } from "@/components/mobile-nav-context";

export function PageHeaderSync({
  title,
  backHref,
}: {
  title: ReactNode;
  backHref?: string;
}) {
  const mobileNav = useMobileNav();

  useEffect(() => {
    if (mobileNav) {
      mobileNav.setTitle(title);
      mobileNav.setBackHref(backHref ?? null);
    }
  }, [mobileNav, title, backHref]);

  return null;
}
