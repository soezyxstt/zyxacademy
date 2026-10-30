"use client";

import * as React from "react";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { CalendarDays, ChevronLeft, ChevronRight, Video } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface PkaCalendarSession {
  id: string;
  title: string;
  meetLink: string | null;
  sessionAt: string; // ISO string (serializable across the RSC boundary)
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** Opens on the month of the next upcoming session; falls back to the last session, then today. */
function initialView(sessions: PkaCalendarSession[]): { year: number; month: number } {
  const dates = sessions
    .map((s) => new Date(s.sessionAt))
    .sort((a, b) => a.getTime() - b.getTime());
  const target = dates.find((d) => d.getTime() >= Date.now()) ?? dates[dates.length - 1] ?? new Date();
  return { year: target.getFullYear(), month: target.getMonth() };
}

export function PkaScheduleCalendar({ sessions }: { sessions: PkaCalendarSession[] }) {
  const t = useTranslations("studentExtras.pka");
  const { locale } = useAppLocale();
  const weekdayLabels = t.raw("calendarWeekdays") as string[];
  const [initial] = React.useState(() => initialView(sessions));
  const [viewYear, setViewYear] = React.useState(initial.year);
  const [viewMonth, setViewMonth] = React.useState(initial.month);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(null);

  const sessionsByDay = React.useMemo(() => {
    const map = new Map<string, PkaCalendarSession[]>();
    for (const s of sessions) {
      const key = dayKey(new Date(s.sessionAt));
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.sessionAt).getTime() - new Date(b.sessionAt).getTime());
    }
    return map;
  }, [sessions]);

  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(locale === "id" ? "id-ID" : "en-US", {
    month: "long",
    year: "numeric",
  });

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  // Monday-first offset: JS getDay() is 0 = Sunday.
  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;

  const todayKey = dayKey(new Date());

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const selectedSessions = selectedKey ? (sessionsByDay.get(selectedKey) ?? []) : [];
  const selectedDate =
    selectedSessions.length > 0 ? new Date(selectedSessions[0].sessionAt) : null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h3 className="font-heading text-body-base font-bold text-foreground capitalize">{monthLabel}</h3>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => shiftMonth(-1)}
            aria-label={t("calendarPrevious")}
            className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => shiftMonth(1)}
            aria-label={t("calendarNext")}
            className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {weekdayLabels.map((label) => (
          <span
            key={label}
            className="py-1 text-center text-body-2xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            {label}
          </span>
        ))}

        {Array.from({ length: firstWeekday }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const dayNum = i + 1;
          const key = `${viewYear}-${viewMonth}-${dayNum}`;
          const daySessions = sessionsByDay.get(key) ?? [];
          const hasSessions = daySessions.length > 0;
          const isToday = key === todayKey;

          const cellClass = cn(
            "relative flex aspect-square w-full flex-col items-center justify-center rounded-lg text-body-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-colors duration-150",
            hasSessions
              ? "bg-brand-primary/10 font-bold text-brand-primary hover:bg-brand-primary/20 cursor-pointer"
              : "text-foreground/80",
            isToday && "ring-1 ring-brand-secondary",
          );

          return hasSessions ? (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedKey(key)}
              aria-label={t("calendarViewDay", { day: dayNum, month: monthLabel })}
              className={cellClass}
            >
              {dayNum}
              <span className="absolute bottom-1 size-1.5 rounded-full bg-brand-primary" />
            </button>
          ) : (
            <span key={key} className={cellClass}>
              {dayNum}
            </span>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-border pt-3 text-body-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-brand-primary" />
          {t("calendarHasSessions")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3 rounded-md ring-1 ring-brand-secondary" />
          {t("calendarToday")}
        </span>
      </div>

      <Dialog open={selectedKey !== null} onOpenChange={(open) => !open && setSelectedKey(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading text-body-base font-bold text-foreground">
              {selectedDate
                ? selectedDate.toLocaleDateString(locale === "id" ? "id-ID" : "en-US", { dateStyle: "full" })
                : t("calendarSessionTitle")}
            </DialogTitle>
            <DialogDescription className="text-body-xs text-muted-foreground">
              {t("sessionsOnDate", { count: selectedSessions.length })}
            </DialogDescription>
          </DialogHeader>

          <div className="divide-y divide-border/60">
            {selectedSessions.map((s) => (
              <div key={s.id} className="py-3 space-y-2">
                <div>
                  <p className="break-words text-body-base font-semibold text-foreground">{s.title}</p>
                </div>
                <p className="flex items-center gap-1.5 text-body-sm text-muted-foreground">
                  <CalendarDays className="size-3.5" />
                  {new Date(s.sessionAt).toLocaleString(locale === "id" ? "id-ID" : "en-US", { dateStyle: "medium", timeStyle: "short" })}
                </p>
                {s.meetLink ? (
                  <a
                    href={s.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-md bg-brand-primary px-3 py-1.5 text-body-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-primary/90"
                  >
                    <Video className="size-4" />
                    {t("joinMeetCalendar")}
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-muted px-3 py-1.5 text-body-sm font-semibold text-muted-foreground">
                    {t("calendarLinkMissing")}
                  </span>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
