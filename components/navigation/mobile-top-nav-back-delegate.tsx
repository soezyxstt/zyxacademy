"use client";

import { useMemo } from "react";
import { useMobileTopNav } from "@/components/navigation/mobile-chrome-context";

export interface MobileTopNavBackDelegateProps {
  backHref?: string;
  backLabel?: string;
}

/**
 * Delegates a page-level fallback backHref to MobileTopNavbar without
 * overriding deeper screen controls or shell course switchers.
 */
export function MobileTopNavBackDelegate({
  backHref,
  backLabel,
}: MobileTopNavBackDelegateProps) {
  const config = useMemo(
    () =>
      backHref
        ? {
            fallbackBackHref: backHref,
            fallbackBackLabel: backLabel,
          }
        : null,
    [backHref, backLabel]
  );

  useMobileTopNav(config);
  return null;
}
