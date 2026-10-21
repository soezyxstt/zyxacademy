"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function TelemetryBoundary({ children }: { children: ReactNode }) {
  return ["/authoring-verification", "/v4"].includes(usePathname() ?? "") ? null : children;
}
