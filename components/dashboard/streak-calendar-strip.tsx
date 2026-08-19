"use client";

import { Flame, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StreakCalendarStripProps {
  current: number;
  weeklyActivity?: boolean[];
}

export function StreakCalendarStrip({ current, weeklyActivity = [] }: StreakCalendarStripProps) {
  const hasStreak = current > 0;
  
  // Day initials for Monday - Sunday (Senin, Selasa, Rabu, Kamis, Jumat, Sabtu, Minggu)
  const days = [
    { label: "S", name: "Senin" },
    { label: "S", name: "Selasa" },
    { label: "R", name: "Rabu" },
    { label: "K", name: "Kamis" },
    { label: "J", name: "Jumat" },
    { label: "S", name: "Sabtu" },
    { label: "M", name: "Minggu" },
  ];

  const currentDayIndex = (new Date().getDay() + 6) % 7; // Monday = 0, Sunday = 6

  return (
    <div className="rounded-xl border border-border bg-card/65 p-3.5 backdrop-blur-md shadow-xs select-none">
      <div className="flex items-center justify-between mb-2">
        <span className="font-heading text-body-xs font-semibold text-foreground">Streak Mingguan</span>
        <div className="flex items-center gap-1">
          <Flame
            className={cn(
              "size-4 shrink-0 animate-pulse",
              hasStreak ? "text-brand-secondary fill-brand-secondary/20" : "text-muted-foreground"
            )}
          />
          <span className="font-sans text-body-xs font-bold tabular-nums text-foreground">
            {current} Hari
          </span>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day, idx) => {
          const isActive = weeklyActivity[idx] || false;
          const isToday = idx === currentDayIndex;

          return (
            <div key={idx} className="flex flex-col items-center gap-1">
              <span className="font-sans text-body-xs font-bold text-foreground/80">
                {day.label}
              </span>
              <div
                title={`${day.name}: ${isActive ? "Selesai" : "Belum selesai"}`}
                className={cn(
                  "flex size-8 items-center justify-center rounded-lg text-[10px] font-bold transition-all duration-300",
                  isActive
                    ? "bg-brand-secondary text-white shadow-xs scale-105"
                    : "bg-muted text-muted-foreground/50 border border-border/40",
                  isToday && "ring-2 ring-brand-primary ring-offset-2 ring-offset-background"
                )}
              >
                {isActive ? (
                  <Check className="size-4 stroke-[3]" />
                ) : (
                  <span className="text-[10px] font-semibold opacity-80">{day.label}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
