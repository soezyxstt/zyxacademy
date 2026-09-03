"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  ClipboardList,
  GraduationCap,
  Users,
  Clock,
  ArrowRight,
  Video,
  CheckCircle2,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CalendarEventItem = {
  id: string;
  title: string;
  courseTitle: string;
  category: "quiz" | "tryout" | "tutorial";
  categoryLabel: string;
  dateStr: string;
  timeStr: string;
  actionUrl: string;
  actionLabel: string;
  isOnlineMeet?: boolean;
  meetUrl?: string | null;
  status: "upcoming" | "today" | "past";
};

export function CalendarAgendaClient({
  events,
}: {
  events: CalendarEventItem[];
}) {
  const [filter, setFilter] = useState<"all" | "quiz_tryout" | "tutorial">("all");

  const filteredEvents = events.filter((ev) => {
    if (filter === "quiz_tryout") return ev.category === "quiz" || ev.category === "tryout";
    if (filter === "tutorial") return ev.category === "tutorial";
    return true;
  });

  const upcomingEvents = filteredEvents.filter((e) => e.status === "today" || e.status === "upcoming");
  const pastEvents = filteredEvents.filter((e) => e.status === "past");

  return (
    <div className="space-y-6">
      {/* Category filter chips */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-body-sm font-medium transition-all cursor-pointer border",
              filter === "all"
                ? "border-brand-primary bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary/20"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            Semua Agenda ({events.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("quiz_tryout")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-body-sm font-medium transition-all cursor-pointer border",
              filter === "quiz_tryout"
                ? "border-brand-primary bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary/20"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            Kuis & Tryout ({events.filter((e) => e.category !== "tutorial").length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("tutorial")}
            className={cn(
              "rounded-lg px-3 py-1.5 text-body-sm font-medium transition-all cursor-pointer border",
              filter === "tutorial"
                ? "border-brand-primary bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary/20"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            Sesi Tutorial ({events.filter((e) => e.category === "tutorial").length})
          </button>
        </div>

        <Link
          href="/dashboard/schedule"
          className="text-body-xs font-semibold text-brand-primary hover:underline flex items-center gap-1"
        >
          Kelola slot tutorial
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      {/* Events list */}
      {filteredEvents.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border/80 bg-card/60 p-8 sm:p-12 text-center">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-brand-primary/10 text-brand-primary">
            <Calendar className="size-6" />
          </div>
          <h3 className="font-heading text-body-base font-bold text-foreground">
            Belum ada agenda terjadwal
          </h3>
          <p className="mx-auto mt-1 max-w-md text-body-sm text-muted-foreground">
            Tenggat waktu kuis kelas, tryout, dan sesi bimbingan tutorial kelompok akan otomatis tercatat di kalender akademik ini.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
            <Button asChild size="sm" className="rounded-lg text-body-sm">
              <Link href="/courses">Jelajahi Kelas</Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="rounded-lg text-body-sm">
              <Link href="/dashboard/schedule">Jadwal Tutorial</Link>
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Upcoming / Today Section */}
          {upcomingEvents.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-heading text-body-sm font-bold text-foreground flex items-center gap-2">
                <Clock className="size-4 text-brand-primary" />
                Mendatang & Hari Ini ({upcomingEvents.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {upcomingEvents.map((item) => (
                  <EventCard key={item.id} event={item} />
                ))}
              </div>
            </div>
          )}

          {/* Past Events Section */}
          {pastEvents.length > 0 && (
            <div className="space-y-3 pt-2">
              <h2 className="font-heading text-body-sm font-bold text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="size-4 text-muted-foreground/60" />
                Selesai & Riwayat ({pastEvents.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 opacity-80 hover:opacity-100 transition-opacity">
                {pastEvents.map((item) => (
                  <EventCard key={item.id} event={item} isPast />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EventCard({
  event,
  isPast = false,
}: {
  event: CalendarEventItem;
  isPast?: boolean;
}) {
  const categoryIcon = {
    quiz: ClipboardList,
    tryout: GraduationCap,
    tutorial: Users,
  }[event.category];

  const IconComponent = categoryIcon || CalendarDays;

  return (
    <div
      className={cn(
        "group flex flex-col justify-between rounded-xl border p-4 transition-all bg-card",
        event.status === "today"
          ? "border-brand-primary/40 bg-brand-primary/5 ring-1 ring-brand-primary/20 shadow-xs"
          : "border-border/70 hover:border-border",
        isPast && "bg-muted/20"
      )}
    >
      <div>
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
              event.category === "tutorial"
                ? "bg-brand-secondary/10 text-brand-secondary ring-1 ring-brand-secondary/20"
                : "bg-brand-primary/10 text-brand-primary ring-1 ring-brand-primary/20"
            )}
          >
            <IconComponent className="size-3" />
            {event.categoryLabel}
          </span>

          <span className="text-[11px] font-medium text-muted-foreground">
            {event.dateStr}
          </span>
        </div>

        <h3 className="mt-2.5 font-heading text-body-sm font-bold text-foreground group-hover:text-brand-primary transition-colors line-clamp-2">
          {event.title}
        </h3>

        <p className="mt-1 text-body-xs text-muted-foreground truncate">
          {event.courseTitle}
        </p>

        <div className="mt-3 flex items-center gap-2 text-body-xs font-medium text-foreground">
          <Clock className="size-3.5 text-muted-foreground shrink-0" />
          <span>{event.timeStr}</span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between gap-2">
        {event.isOnlineMeet && event.meetUrl && (
          <a
            href={event.meetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-body-xs font-semibold text-status-success hover:underline"
          >
            <Video className="size-3.5" />
            Google Meet
          </a>
        )}

        <Button
          asChild
          size="sm"
          variant={event.status === "today" ? "default" : "outline"}
          className="ml-auto rounded-md text-body-xs h-7 px-3"
        >
          <Link href={event.actionUrl}>
            {event.actionLabel}
            <ArrowRight className="ml-1 size-3" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
