"use client";

import { Flame } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

interface StreakTagProps {
  current: number;
}

export function StreakTag({ current }: StreakTagProps) {
  const t = useTranslations("student");
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
        {hasStreak ? t("dashboard.streak", { count: current }) : t("dashboard.startStreakToday")}
      </span>
    </div>
  );
}
