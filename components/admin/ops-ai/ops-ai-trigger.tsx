"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";

interface OpsAiTriggerProps {
  className?: string;
  variant?: "header" | "floating" | "sidebar" | "compact";
  collapsed?: boolean;
}

export function OpsAiTrigger({
  className,
  variant = "floating",
  collapsed = false,
}: OpsAiTriggerProps) {
  const [shortcutLabel, setShortcutLabel] = useState("Cmd+/");
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const isMac = typeof navigator !== "undefined" && /\b(Mac|iPhone|iPod|iPad)\b/i.test(navigator.userAgent);
    setShortcutLabel(isMac ? "Cmd+/" : "Ctrl+/");

    const onOpen = () => setDrawerOpen(true);
    const onClose = () => setDrawerOpen(false);
    const onToggle = () => setDrawerOpen((prev) => !prev);

    window.addEventListener("zyx:open-ops-ai", onOpen);
    window.addEventListener("zyx:close-ops-ai", onClose);
    window.addEventListener("zyx:toggle-ops-ai", onToggle);

    return () => {
      window.removeEventListener("zyx:open-ops-ai", onOpen);
      window.removeEventListener("zyx:close-ops-ai", onClose);
      window.removeEventListener("zyx:toggle-ops-ai", onToggle);
    };
  }, []);

  const handleToggle = () => {
    window.dispatchEvent(new CustomEvent("zyx:toggle-ops-ai"));
  };

  if (variant === "sidebar") {
    const button = (
      <button
        type="button"
        onClick={handleToggle}
        aria-label={`Zyx Ops AI (${shortcutLabel})`}
        className={cn(
          "flex shrink-0 items-center justify-center transition-colors cursor-pointer text-muted-foreground hover:text-foreground",
          collapsed
            ? "size-10 rounded-xl border border-border bg-muted/40 hover:bg-muted/80"
            : "size-8 rounded-lg border border-border bg-muted/40 hover:bg-muted/80",
          className
        )}
      >
        <Sparkles className="size-4 text-primary" />
      </button>
    );

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipContent side={collapsed ? "right" : "bottom"} sideOffset={8}>
            Zyx Ops AI ({shortcutLabel})
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (variant === "compact") {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={handleToggle}
              aria-label={`Zyx Ops AI (${shortcutLabel})`}
              className={cn(
                "inline-flex size-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary cursor-pointer",
                className
              )}
            >
              <Sparkles className="size-4 text-primary" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            Zyx Ops AI ({shortcutLabel})
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (variant === "floating") {
    if (drawerOpen) return null;

    return (
      <aside
        aria-label="Akses Cepat Zyx Ops AI"
        className={cn("fixed bottom-5 right-5 z-40 pointer-events-auto", className)}
      >
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleToggle}
                aria-label={`Buka Zyx Ops AI (${shortcutLabel})`}
                className="group flex items-center gap-2 rounded-xl border border-border/80 bg-card/95 px-3 py-2 text-body-sm font-medium text-foreground shadow-lg backdrop-blur-md transition-all hover:border-primary/50 hover:bg-primary/10 hover:text-primary hover:shadow-xl active:scale-95 cursor-pointer"
              >
                <div className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Sparkles className="size-3.5" />
                </div>
                <span className="text-body-sm font-semibold hidden sm:inline">Zyx Ops AI</span>
                <span className="hidden md:inline-flex rounded border border-border/80 bg-muted/80 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                  {shortcutLabel}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>
              Buka Asisten Zyx Ops AI ({shortcutLabel})
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </aside>
    );
  }

  // Default "header" variant
  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={`Buka Zyx Ops AI (${shortcutLabel})`}
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border border-border/80 bg-card px-2.5 py-1.5 text-body-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring cursor-pointer",
        className
      )}
    >
      <Sparkles className="size-4 text-primary" />
      <span className="hidden sm:inline">Zyx Ops AI</span>
      <span className="hidden md:inline rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground">
        {shortcutLabel}
      </span>
    </button>
  );
}

