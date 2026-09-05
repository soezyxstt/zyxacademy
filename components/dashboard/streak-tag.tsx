"use client";

import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";

interface StreakTagProps {
  current: number;
}

export function StreakTag({ current }: StreakTagProps) {
  const hasStreak = current > 0;
  return (
    <div className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1">
      <Flame
        className={cn(
          "size-4 shrink-0",
          hasStreak ? "text-brand-secondary" : "text-muted-foreground"
        )}
      />
      <span className="text-body-sm font-semibold tabular-nums text-foreground">
        {hasStreak ? `${current} hari` : "Mulai hari ini"}
      </span>
    </div>
  );
}
