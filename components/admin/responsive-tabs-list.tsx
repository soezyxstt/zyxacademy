"use client";

import type * as React from "react";
import { TabsList } from "@/components/ui/tabs";
import { useViewportMode } from "@/hooks/use-viewport-mode";

/**
 * Renders an inline tab strip on mobile (<768px) to avoid double-stacking
 * under mobile sub-tab navigation bars, while preserving the sticky page-level
 * tab strip on desktop.
 */
export function ResponsiveTabsList(
  props: Omit<React.ComponentProps<typeof TabsList>, "variant">,
) {
  const viewportMode = useViewportMode();
  return (
    <TabsList
      {...props}
      variant={viewportMode === "mobile" ? "inline" : "page"}
    />
  );
}
