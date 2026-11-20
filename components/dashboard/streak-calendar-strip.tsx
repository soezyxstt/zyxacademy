"use client";

import { useEffect, useState } from "react";
import { Flame, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { localWeekdayIndex } from "@/lib/date-utils";
import { useTranslations } from "@/lib/i18n/client";

interface StreakCalendarStripProps {
  current: number;
  weeklyActivity?: boolean[];
}

export function StreakCalendarStrip({ current, weeklyActivity = [] }: StreakCalendarStripProps) {
  const t = useTranslations("student");
  const hasStreak = current > 0;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  
  // Day initials for Monday - Sunday (Senin, Selasa, Rabu, Kamis, Jumat, Sabtu, Minggu)
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

  const currentDayIndex = mounted ? localWeekdayIndex(new Date()) : null;

  return (
    <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2 select-none">
      <div className="flex items-center gap-1 shrink-0" title={t("dashboard.weeklyStreak")}>
        <Flame
          className={cn(
            "size-3.5 shrink-0",
            hasStreak ? "text-brand-secondary fill-brand-secondary/20" : "text-muted-foreground"
          )}
        />
        <span className="font-sans text-body-xs font-semibold tabular-nums text-foreground">
          {t("dashboard.streakDays", { count: current })}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {days.map((day, idx) => {
          const isActive = weeklyActivity[idx] || false;
          const isToday = idx === currentDayIndex;

          return (
            <div
              key={idx}
              title={`${t(`dashboard.weekdays.${day}`)}: ${isActive ? t("dashboard.dayDone") : t("dashboard.dayNotDone")}`}
              className="flex flex-col items-center gap-0.5"
            >
              <span className="font-sans text-[9px] font-medium leading-none text-muted-foreground">
                {t(`dashboard.weekdaysShort.${day}`)}
              </span>
              <span
                className={cn(
                  "flex size-3.5 items-center justify-center rounded-full transition-colors",
                  isActive
                    ? "bg-brand-secondary text-white"
                    : "bg-muted/70 text-muted-foreground/40",
                  isToday && "ring-1 ring-brand-secondary/80 ring-offset-1 ring-offset-card"
                )}
              >
                {isActive ? (
                  <Check className="size-2.5 stroke-[3]" />
                ) : (
                  <span className="size-1 rounded-full bg-muted-foreground/35" />
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
