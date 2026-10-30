"use client";

import { Flame, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/i18n/client";

interface StreakCalendarStripProps {
  current: number;
  weeklyActivity?: boolean[];
}

export function StreakCalendarStrip({ current, weeklyActivity = [] }: StreakCalendarStripProps) {
  const t = useTranslations("student");
  const hasStreak = current > 0;
  
  // Day initials for Monday - Sunday (Senin, Selasa, Rabu, Kamis, Jumat, Sabtu, Minggu)
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

  const currentDayIndex = (new Date().getDay() + 6) % 7; // Monday = 0, Sunday = 6

  return (
    <div className="rounded-xl border border-border/70 bg-card p-3.5 select-none">
      <div className="flex items-center justify-between mb-2">
        <span className="font-heading text-body-xs font-semibold text-foreground">{t("dashboard.weeklyStreak")}</span>
        <div className="flex items-center gap-1">
          <Flame
            className={cn(
              "size-4 shrink-0 animate-pulse",
              hasStreak ? "text-brand-secondary fill-brand-secondary/20" : "text-muted-foreground"
            )}
          />
          <span className="font-sans text-body-xs font-bold tabular-nums text-foreground">
            {t("dashboard.streakDays", { count: current })}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, idx) => {
          const isActive = weeklyActivity[idx] || false;
          const isToday = idx === currentDayIndex;

          return (
            <div key={idx} className="flex flex-col items-center gap-1.5 min-w-0">
              <span className="font-sans text-body-xs font-bold text-foreground leading-none" title={t(`dashboard.weekdays.${day}`)}>
                {t(`dashboard.weekdaysShort.${day}`)}
              </span>
              <div
                title={`${t(`dashboard.weekdays.${day}`)}: ${isActive ? t("dashboard.dayDone") : t("dashboard.dayNotDone")}`}
                className={cn(
                  "flex w-full aspect-square max-w-[24px] items-center justify-center rounded-md text-[10px] font-bold transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/60 text-muted-foreground/40 border border-border/50",
                  isToday && "ring-1.5 ring-brand-primary ring-offset-1 ring-offset-background"
                )}
              >
                {isActive ? (
                  <Check className="size-3.5 stroke-[2.5]" />
                ) : (
                  <span className="size-1 rounded-full bg-muted-foreground/30" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
