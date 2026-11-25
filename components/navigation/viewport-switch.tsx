"use client";

import type { ReactNode } from "react";
import {
  useViewportMode,
  type ResolvedViewportMode,
} from "@/hooks/use-viewport-mode";

export type ViewportSlot = ReactNode | (() => ReactNode);

export interface ViewportSwitchProps {
  desktop: ViewportSlot;
  mobile: ViewportSlot;
  fallback?: ReactNode;
  initialHint?: ResolvedViewportMode;
}

function renderSlot(slot: ViewportSlot): ReactNode {
  return typeof slot === "function" ? slot() : slot;
}

/**
 * Single-mount viewport switcher that renders exclusively the desktop or mobile tree.
 * Avoids double-mounting heavy interactive trees across breakpoints.
 */
export function ViewportSwitch({
  desktop,
  mobile,
  fallback = null,
  initialHint,
}: ViewportSwitchProps) {
  const mode = useViewportMode(initialHint);

  if (mode === "desktop") {
    return <>{renderSlot(desktop)}</>;
  }

  if (mode === "mobile") {
    return <>{renderSlot(mobile)}</>;
  }

  return <>{fallback}</>;
}
