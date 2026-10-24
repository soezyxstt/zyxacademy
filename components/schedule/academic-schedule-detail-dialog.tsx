"use client";

import { CalendarDays, Clock3, ExternalLink, MapPin, NotebookText } from "lucide-react";
import { useAppLocale, useTranslations } from "@/lib/i18n/client";
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

function asDate(value: Date | string | null | undefined) {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isHttpUrl(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value.trim()));
}

function formatDate(value: Date, locale: "id" | "en") {
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(value);
}

function formatTime(value: Date, locale: "id" | "en") {
  return new Intl.DateTimeFormat(locale === "id" ? "id-ID" : "en-US", {
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
  const t = useTranslations("schedule");
  const { locale } = useAppLocale();
  if (!schedule) return null;

  const start = asDate(schedule.startDate);
  const end = asDate(schedule.endDate);
  const courseTitle = schedule.course?.title || schedule.courseTitle || null;
  const typeKey = schedule.type && ["official_exam", "tryout", "quiz", "general"].includes(schedule.type) ? schedule.type : "general";
  const typeLabel = t(`academic.types.${typeKey}`);

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
              {t("academic.title")}
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-1 text-sm">
          {courseTitle ? (
            <div className="flex items-start gap-3">
              <NotebookText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t("academic.course")}</p>
                <p className="font-medium">{courseTitle}</p>
              </div>
            </div>
          ) : null}

          {start ? (
            <div className="flex items-start gap-3">
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t("academic.date")}</p>
                <p className="font-medium">{formatDate(start, locale)}</p>
              </div>
            </div>
          ) : null}

          {start ? (
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">{t("academic.time")}</p>
                <p className="font-medium">
                  {formatTime(start, locale)}{end ? ` - ${formatTime(end, locale)}` : ""} WIB
                </p>
              </div>
            </div>
          ) : null}

          {schedule.location ? (
            <div className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{t("academic.location")}</p>
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
            <div className="border-t border-border pt-3">
              <p className="mb-2 text-body-xs font-medium text-muted-foreground">
                {t("academic.notes")}
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
                {t("academic.openLink")}
                <ExternalLink className="h-4 w-4" />
              </a>
            </Button>
          ) : (
            <Button type="button" onClick={() => onOpenChange(false)}>
              {t("academic.close")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
