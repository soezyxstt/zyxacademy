"use client";

import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface OpsAiTriggerProps {
  className?: string;
  variant?: "header" | "floating" | "compact";
}

export function OpsAiTrigger({ className, variant = "header" }: OpsAiTriggerProps) {
  const handleToggle = () => {
    window.dispatchEvent(new CustomEvent("zyx:toggle-ops-ai"));
  };

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={handleToggle}
        title="Buka Zyx Ops AI (Cmd+/)"
        aria-label="Buka Zyx Ops AI"
        className={cn(
          "inline-flex size-9 items-center justify-center rounded-md border border-border bg-card text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary",
          className
        )}
      >
        <Sparkles className="size-4 text-primary" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label="Buka Zyx Ops AI"
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-border/80 bg-card px-3 py-1.5 text-body-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className
      )}
    >
      <Sparkles className="size-4 text-primary" />
      <span className="hidden sm:inline">Zyx Ops AI</span>
      <span className="hidden md:inline rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground">
        Cmd+/
      </span>
    </button>
  );
}

