"use client";

import { Menu } from "lucide-react";
import { openMobileSidebar } from "@/components/sidebar-shell";
import { cn } from "@/lib/utils";

export function MobileSidebarTrigger({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openMobileSidebar}
      aria-label="Buka navigasi"
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground shadow-xs transition-colors hover:bg-muted hover:text-foreground active:scale-95 cursor-pointer",
        className
      )}
    >
      <Menu className="size-4" />
    </button>
  );
}
