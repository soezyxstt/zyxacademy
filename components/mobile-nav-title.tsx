"use client";

import { useEffect } from "react";
import { setMobileNavTitle } from "@/components/mobile-navbar";

export function MobileNavTitle({ title }: { title: string }) {
  useEffect(() => {
    setMobileNavTitle(title);
    return () => {
      window.dispatchEvent(new Event("zyx:clear-mobile-title"));
    };
  }, [title]);

  return null;
}
