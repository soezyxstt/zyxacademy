"use client";

import { useEffect } from "react";
import { setMobileNavTitle } from "@/components/mobile-navbar";

export function MobileNavTitle({ title }: { title: string }) {
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMobileNavTitle(title);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.dispatchEvent(new Event("zyx:clear-mobile-title"));
    };
  }, [title]);

  return null;
}
