"use client";

import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import type { WatchlistStudent } from "@/lib/cohort-analytics";

function relativeTime(
  iso: string | null,
  locale: string,
  t: (key: "never" | "today" | "yesterday") => string,
): string {
  if (!iso) return t("never");
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return t("today");
  if (diffDays === 1) return t("yesterday");
  const relative = new Intl.RelativeTimeFormat(locale === "id" ? "id-ID" : "en-US", {
    numeric: "auto",
  });
  if (diffDays < 7) return relative.format(-diffDays, "day");
  return relative.format(-Math.floor(diffDays / 7), "week");
}

export function WatchlistTable({ students }: { students: WatchlistStudent[] }) {
  const t = useTranslations("tutor.analytics");
  const { locale } = useAppLocale();
  if (students.length === 0) return <p className="text-body-sm text-muted-foreground">{t("noWatchlist")}</p>;

  return (
    <>
      {/* Mobile stacked rows (zero horizontal table scroll) */}
      <div className="divide-y divide-border/30 md:hidden">
        {students.map((student) => {
          const shown = student.decliningConcepts.slice(0, 3);
          const overflow = student.decliningConcepts.length - shown.length;
          const conceptLabel =
            shown.length === 0
              ? t("activeInterventionCount", { count: student.activeInterventionCount })
              : shown.join(", ") +
                (overflow > 0 ? ` ${t("otherConcepts", { count: overflow })}` : "");
          return (
            <div key={student.studentId} className="space-y-1 py-3">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 wrap-anywhere text-body-sm font-medium text-foreground">
                  {student.name}
                </p>
                <span className="shrink-0 whitespace-nowrap text-body-xs text-muted-foreground">
                  {relativeTime(student.lastActiveAt, locale, (key) => t(key))}
                </span>
              </div>
              <p className="wrap-anywhere text-body-xs text-muted-foreground">{conceptLabel}</p>
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <Table className="w-full text-body-sm">
          <TableHeader>
            <TableRow className="border-b border-border/30 text-left text-body-xs font-semibold text-muted-foreground">
              <TableHead className="font-medium">{t("student")}</TableHead>
              <TableHead className="font-medium">{t("decliningConcepts")}</TableHead>
              <TableHead className="text-right font-medium whitespace-normal">
                {t("lastActive")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-border/30">
            {students.map((student) => {
              const shown = student.decliningConcepts.slice(0, 3);
              const overflow = student.decliningConcepts.length - shown.length;
              const conceptLabel =
                shown.length === 0
                  ? t("activeInterventionCount", { count: student.activeInterventionCount })
                  : shown.join(", ") +
                    (overflow > 0 ? ` ${t("otherConcepts", { count: overflow })}` : "");
              return (
                <TableRow key={student.studentId}>
                  <TableCell className="wrap-anywhere font-medium whitespace-normal text-foreground">
                    {student.name}
                  </TableCell>
                  <TableCell className="max-w-xs wrap-anywhere whitespace-normal text-muted-foreground">
                    {conceptLabel}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap text-muted-foreground">
                    {relativeTime(student.lastActiveAt, locale, (key) => t(key))}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
