"use client";

import { useAppLocale, useTranslations } from "@/lib/i18n/client";
import { Users } from "lucide-react";
import { AdminEmptyState } from "@/components/admin/state-panels";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import type { WatchlistStudent } from "@/lib/cohort-analytics";

function relativeTime(iso: string | null, locale: string, t: (key: "never" | "today" | "yesterday") => string): string {
  if (!iso) return t("never");
  const diffDays = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return t("today");
  if (diffDays === 1) return t("yesterday");
  const relative = new Intl.RelativeTimeFormat(locale === "id" ? "id-ID" : "en-US", { numeric: "auto" });
  if (diffDays < 7) return relative.format(-diffDays, "day");
  return relative.format(-Math.floor(diffDays / 7), "week");
}

export function WatchlistTable({ students }: { students: WatchlistStudent[] }) {
  const t = useTranslations("tutor.analytics");
  const { locale } = useAppLocale();
  if (students.length === 0) return <AdminEmptyState icon={Users} title={t("noWatchlist")} />;

  return (
      <Table className="w-full text-body-sm">
        <TableHeader>
          <TableRow className="border-b border-border text-left text-muted-foreground text-body-xs font-semibold">
            <TableHead className="px-4 py-2.5 font-medium">{t("student")}</TableHead>
            <TableHead className="px-4 py-2.5 font-medium">{t("decliningConcepts")}</TableHead>
            <TableHead className="px-4 py-2.5 font-medium whitespace-nowrap">{t("lastActive")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y divide-border">
          {students.map((student) => {
            const shown = student.decliningConcepts.slice(0, 3);
            const overflow = student.decliningConcepts.length - shown.length;
            const conceptLabel = shown.length === 0
              ? t("activeInterventionCount", { count: student.activeInterventionCount })
              : shown.join(", ") + (overflow > 0 ? ` ${t("otherConcepts", { count: overflow })}` : "");
            return (
              <TableRow key={student.studentId}>
                <TableCell className="px-4 py-2.5 font-medium text-foreground whitespace-normal break-words">{student.name}</TableCell>
                <TableCell className="px-4 py-2.5 text-muted-foreground max-w-xs whitespace-normal break-words">{conceptLabel}</TableCell>
                <TableCell className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{relativeTime(student.lastActiveAt, locale, (key) => t(key))}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
  );
}
