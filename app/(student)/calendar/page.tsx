import type { Metadata } from "next";
import { ShellPage } from "@/components/shell-page";
import { pageTitle } from "@/lib/site";

export const metadata: Metadata = {
  title: pageTitle("Calendar"),
  description: "Kalender jadwal dan acara internal Zyx Academy.",
};

export default function CalendarPage() {
  return (
    <ShellPage title="Calendar">
      <div className="rounded-2xl border border-border bg-card p-10 text-center shadow-sm">
        <p className="text-body-base text-muted-foreground">
          Belum ada jadwal kegiatan.
        </p>
      </div>
    </ShellPage>
  );
}
