"use client";

import { CalendarDays, Clock3, ExternalLink, MapPin, NotebookText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type AcademicScheduleDetail = {
  id: string;
  title: string;
  type?: "official_exam" | "tryout" | "quiz" | "general" | string | null;
  startDate: Date | string;
  endDate?: Date | string | null;
  description?: string | null;
  location?: string | null;
  status?: string | null;
  course?: { id?: string; title?: string | null } | null;
  courseTitle?: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  official_exam: "Ujian ITB",
  tryout: "Tryout",
  quiz: "Kuis",
  general: "Akademik",
};

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isHttpUrl(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value.trim()));
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(value);
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  }).format(value);
}

export function AcademicScheduleDetailDialog({
  schedule,
  open,
  onOpenChange,
}: {
  schedule: AcademicScheduleDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!schedule) return null;

  const start = asDate(schedule.startDate);
  const end = asDate(schedule.endDate);
  const courseTitle = schedule.course?.title || schedule.courseTitle || null;
  const typeLabel = TYPE_LABELS[schedule.type || ""] || "Akademik";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="space-y-3 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{typeLabel}</Badge>
          </div>
          <div>
            <DialogTitle className="text-xl leading-snug">{schedule.title}</DialogTitle>
            <DialogDescription className="mt-1">
              Detail jadwal akademik
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-1 text-sm">
          {courseTitle ? (
            <div className="flex items-start gap-3">
              <NotebookText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Mata kuliah</p>
                <p className="font-medium">{courseTitle}</p>
              </div>
            </div>
          ) : null}

          {start ? (
            <div className="flex items-start gap-3">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Tanggal</p>
                <p className="font-medium">{formatDate(start)}</p>
              </div>
            </div>
          ) : null}

          {start ? (
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Waktu</p>
                <p className="font-medium">
                  {formatTime(start)}{end ? ` - ${formatTime(end)}` : ""} WIB
                </p>
              </div>
            </div>
          ) : null}

          {schedule.location ? (
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Lokasi / tautan</p>
                {isHttpUrl(schedule.location) ? (
                  <a
                    href={schedule.location}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex max-w-full items-center gap-1 break-all font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {schedule.location}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </a>
                ) : (
                  <p className="font-medium">{schedule.location}</p>
                )}
              </div>
            </div>
          ) : null}

          {schedule.description ? (
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Catatan
              </p>
              <p className="whitespace-pre-wrap break-words leading-relaxed">
                {schedule.description}
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          {schedule.location && isHttpUrl(schedule.location) ? (
            <Button asChild>
              <a href={schedule.location} target="_blank" rel="noreferrer">
                Buka tautan
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          ) : (
            <Button type="button" onClick={() => onOpenChange(false)}>
              Tutup
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
